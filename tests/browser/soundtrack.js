// SOUNDTRACK gate: the score plays, follows the screens, heats with the
// match, ducks to exactly zero under the Sonar, and obeys both switches.
//
//   1. Nothing sounds before the first gesture. On it the engine takes the
//      shared 48 kHz AudioContext and schedules the theme's notes in the menu
//      state (arps, octave bass, kit, then the lead and brass), continuously.
//   2. State transitions move the music: Home → theme, NEW MATCH → the
//      chart-room march, LOCK (the Salute) → the battle ostinato at layer 0.
//   3. The chirp is sacred: in chirp mode the handshake screen opens the mic
//      by itself and the music's duck gain is exactly 0 for as long as the
//      window is open; it stays 0 through a CHIRP and the mic's reopen; it
//      ramps back only after STOP. The engine's own violation counter is 0.
//   4. The battle layers arrive on their triggers through a scripted match
//      by TYPE: layer 1 on the first hit of round 1, layer 2 when a third
//      enemy ship goes down in round 3, the lead line scheduled after it;
//      the win brings the victory sting, then the full theme at strength.
//   5. A second scripted match lost the same way brings the defeat descent,
//      then the quiet march; NEXT CHALLENGER brings the theme back on Home.
//   6. MUSIC off: the engine stops, the choice persists across a reload,
//      a gesture creates no node (an init script counts every oscillator
//      and buffer source on the shared context: none), the game walks on in
//      silence; MUSIC on brings the score back.
//   7. The two-window harness plays the whole scripted match in CHIRP mode
//      (text transport muted, every frame crossed as a chirp through the
//      production capture pipeline) with the score playing on both phones:
//      VERIFIED on both, the engine sampled its gain on every tick of every
//      Sonar window and saw zero every time, the winner ended on victory and
//      the loser on defeat.
// SOUND = false is the soundflag gate's half: the setting leaves the
// document and the engine never starts.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT, AUDIO_ARGS } from './lib.js';

// The viewport gate's fixed fleets, in the shell's labelling.
const PEER = [{ col: 1, row: 0, horizontal: false }, { col: 3, row: 4, horizontal: true }, { col: 5, row: 0, horizontal: true }, { col: 0, row: 6, horizontal: true }];
const MINE = [{ col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false }, { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false }];
const SIZES = [4, 3, 2, 2];
const idx = (col, row) => row * 7 + col;
const shipCells = (s, size) => Array.from({ length: size }, (_, i) => idx(s.col + (s.horizontal ? i : 0), s.row + (s.horizontal ? 0 : i)));
const allCells = (fleet) => fleet.flatMap((s, i) => shipCells(s, SIZES[i]));

// A win in four rounds: the 2-ship F1-G1 sinks in round 1 (first hit), the
// 4-ship in round 2, the 3-ship in round 3 (three down: the final rounds),
// the last 2-ship in round 4.
const WIN_PICKS = [[idx(5, 0), idx(6, 0), idx(1, 0)], [idx(1, 1), idx(1, 2), idx(1, 3)], [idx(3, 4), idx(4, 4), idx(5, 4)], [idx(0, 6), idx(1, 6), idx(0, 0)]];
// A loss in four rounds: they sink everything of mine (11 cells in 12 shells); my shells all miss.
const LOSS_THEIRS = (() => { const cells = allCells(MINE); cells.push(idx(6, 6)); return [0, 1, 2, 3].map((r) => cells.slice(r * 3, r * 3 + 3)); })();
const LOSS_MINE = [[idx(0, 0), idx(2, 0), idx(3, 0)], [idx(4, 0), idx(0, 2), idx(2, 2)], [idx(3, 2), idx(4, 2), idx(5, 2)], [idx(0, 3), idx(2, 3), idx(3, 3)]];
const THEIR_PICKS_WIN = [[idx(4, 0), idx(4, 1), idx(0, 0)], [idx(1, 0), idx(2, 0), idx(3, 0)], [idx(5, 1), idx(6, 1), idx(0, 2)], [idx(0, 1), idx(0, 3), idx(0, 4)]];

function honestResults(fleet, picksByRound) {
  const cells = fleet.map((s, i) => shipCells(s, SIZES[i]));
  const hit = new Set();
  return picksByRound.map((picks) => {
    const hits = picks.map((c) => { const h = cells.some((cs) => cs.includes(c)); if (h) hit.add(c); return h; });
    return { hits, sunk: cells.map((cs) => cs.every((c) => hit.has(c))) };
  });
}

async function inject(page, screen, text) {
  const open = await page.$eval(`#${screen} [data-manual]`, (m) => !m.hidden);
  if (!open) await page.click(`#${screen} [data-action="manual-toggle"]`);
  await page.fill(`#${screen} .manual__input`, text);
  await page.click(`#${screen} .manual button[type="submit"]`);
}

const musicState = (page) => page.evaluate(() => window.MW.music.state());

/** One scripted match by TYPE in QR mode; `onRound(r)` runs after each reveal. Returns the outcome. */
async function playMatch(page, { mine, theirs, myPicks, theirPicks, onRound }) {
  await page.click('[data-action="new-match"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'placement');
  await page.evaluate((f) => window.MW.setFleet(f), mine);
  await page.click('[data-action="lock"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.currentText());
  const session = await page.evaluate(() => window.MW.state.session);
  const salt = Array.from({ length: 16 }, (_, i) => (i * 29 + 3) & 0xff);
  const commit = await page.evaluate(async ([fleet, salt]) => { const F = await import('./js/fleet.js'); return Array.from(F.commitment(fleet.map((s, i) => ({ ...s, size: [4, 3, 2, 2][i] })), Uint8Array.from(salt))); }, [theirs, salt]);
  await inject(page, 'screen-handshake', await page.evaluate(([session, commit]) => window.MW.frameToText({ type: 1, session, round: 0, commit: Uint8Array.from(commit), transport: 'qr' }), [session, commit]));
  await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
  await page.click('#btn-begin-round');
  await page.waitForFunction(() => document.body.dataset.screen === 'round');
  const results = honestResults(theirs, myPicks);
  for (let r = 1; r <= myPicks.length; r++) {
    await page.evaluate((p) => window.MW.setPicks(p), myPicks[r - 1]);
    await page.click('[data-action="fire"]');
    await page.waitForFunction(() => window.MW.state.phase === 'exchange' && window.MW.currentText());
    const t = theirPicks[r - 1];
    await inject(page, 'screen-round', await page.evaluate(([session, round, salvo]) => window.MW.frameToText({ type: 2, session, round, salvo, results: null, sunk: [false, false, false, false] }), [session, r, t]));
    await page.waitForFunction(() => window.MW.state.incoming && !window.MW.state.incoming.results);
    const res = results[r - 1];
    await inject(page, 'screen-round', await page.evaluate(([session, round, salvo, hits, sunk]) => window.MW.frameToText({ type: 2, session, round, salvo, results: { present: true, hits }, sunk }), [session, r, t, res.hits, res.sunk]));
    await page.waitForFunction(() => window.MW.converged());
    await page.click('[data-action="reveal"]');
    await page.waitForFunction(() => window.MW.state.revealDone, null, { timeout: 15000 });
    if (onRound) await onRound(r);
    const outcome = await page.evaluate(() => window.MW.state.outcome);
    if (outcome) return outcome;
    await page.click('[data-action="next-round"]');
    await page.waitForFunction((n) => window.MW.state.round === n, r + 1);
  }
  return page.evaluate(() => window.MW.state.outcome);
}

export async function run() {
  banner('soundtrack: the score plays, follows the screens, heats with the match, ducks to zero under the Sonar, obeys both switches');
  const srv = await startServer();
  const { context, close } = await launch({ args: AUDIO_ARGS });
  await context.addInitScript(() => {
    // Count every sound source made on any context, so "no music node" can be read from outside the engine.
    window.__sources = 0;
    const proto = window.BaseAudioContext ? window.BaseAudioContext.prototype : window.AudioContext.prototype;
    for (const name of ['createOscillator', 'createBufferSource']) {
      const orig = proto[name];
      proto[name] = function (...args) { window.__sources += 1; return orig.apply(this, args); };
    }
  });
  const page = await context.newPage();
  const cap = capture(page, 'soundtrack');
  const out = {};
  try {
    // --- 1. before and after the first gesture --------------------------------
    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => window.MW && window.MW.sound === true && window.MW.music);
    const before = await page.evaluate(() => ({ ...window.MW.music.state(), sources: window.__sources, setting: document.querySelector('[data-music-choice][aria-checked="true"]').dataset.musicChoice, stored: localStorage.getItem('mw.music.v1'), besideTransport: !!document.querySelector('#setup-transport + #setup-music') }));
    console.log('before any gesture:', JSON.stringify({ enabled: before.enabled, started: before.started, scene: before.scene, playing: before.playing, nodes: before.stats.nodes, sources: before.sources, setting: before.setting, stored: before.stored, besideTransport: before.besideTransport }));
    assert(before.enabled && !before.started && before.scene === 'theme' && before.playing === null && before.stats.nodes === 0 && before.sources === 0, 'music is on by default and silent until the first gesture: nothing created');
    assert(before.setting === 'on' && before.stored === null && before.besideTransport, 'the MUSIC setting sits beside TRANSPORT on Home, ON by default, nothing stored yet');
    await page.waitForTimeout(600);
    assert((await musicState(page)).stats.nodes === 0, 'still nothing after 600 ms without a gesture');

    await page.click('.title'); // any tap on the page is the gesture
    await page.waitForFunction(() => { const s = window.MW.music.state(); return s.started && s.playing === 'theme' && s.stats.notes >= 24; }, null, { timeout: 8000 });
    // Through the intro (bars 1-2: the deck alone) into the fanfare call (bars 3-4, 4.6 s in).
    await page.waitForFunction(() => window.MW.music.state().scheduled.some((n) => n.i === 'brass'), null, { timeout: 12000 });
    const menu = await musicState(page);
    const insts = [...new Set(menu.scheduled.map((n) => n.i))];
    const times = [...new Set(menu.scheduled.map((n) => n.t))].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1]);
    console.log(`menu: scene ${menu.scene} playing ${menu.playing} context ${menu.contextState} notes ${menu.stats.notes} nodes ${menu.stats.nodes} gain ${menu.gain} instruments ${insts.join(' ')} max gap between scheduled notes ${maxGap.toFixed(3)} s`);
    console.log('first notes:', JSON.stringify(menu.scheduled.slice(0, 6)));
    assert(menu.contextState === 'running' && menu.playing === 'theme' && menu.scene === 'theme', 'the theme plays in the menu state on a running context');
    assert(['arp', 'bass', 'kick', 'hat', 'snare', 'brass'].every((i) => insts.includes(i)), 'the deck leads (arps, octave bass, the kit) and the brass fanfare answers: ' + insts.join(' '));
    assert(maxGap < 0.6 && menu.stats.notes > 60, 'notes are scheduled continuously (no gap over 0.6 s in the last 96)');
    assert(menu.gain === 1 && !menu.ducked, 'not ducked on Home');
    out.menu = { notes: menu.stats.notes, nodes: menu.stats.nodes, insts, maxGap };
    const sampleRate = await page.evaluate(() => window.MW.music.ctx.sampleRate);
    assert(sampleRate === 48000, `the score shares the Sonar's 48 kHz context (got ${sampleRate})`);

    // --- 2 + 3. placement, the Salute, the duck ----------------------------
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => window.MW.music.state().playing === 'placement');
    const placement = await musicState(page);
    console.log(`placement: playing ${placement.playing} layer ${placement.layer}`);
    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.music.state().playing === 'battle');
    const battle0 = await musicState(page);
    assert(battle0.layer === 0, 'the Salute starts the battle ostinato at layer 0');
    // Chirp mode (the default): the mic opens by itself; the music is exactly silent from the request on.
    await page.waitForFunction(() => window.MW.sonar.listening, null, { timeout: 20000 });
    const duckOpen = await page.evaluate(() => ({ ...window.MW.music.state(), listening: window.MW.sonar.listening, gainExact: window.MW.music.duckGain.gain.value }));
    console.log(`listen window open: ducked ${duckOpen.ducked} gain ${duckOpen.gainExact} (typeof ${typeof duckOpen.gainExact}) playing ${duckOpen.playing} notes still scheduled ${duckOpen.stats.notes}`);
    assert(duckOpen.listening && duckOpen.ducked === true && duckOpen.gainExact === 0 && Object.is(duckOpen.gainExact, 0), 'during a listen window the music gain is exactly zero');
    const duckLog = duckOpen.log.filter((l) => l.event === 'duck');
    assert(duckLog.length >= 1 && duckLog[duckLog.length - 1].active === true, 'the duck was logged on the window opening');
    // A CHIRP from this screen: silent before the first sample, through the chirp, and into the reopened mic.
    const chirp = await page.evaluate(async () => {
      const samples = [];
      const g = () => window.MW.music.duckGain.gain.value;
      const p = window.MW.chirp();
      samples.push(['at call', g()]);
      await new Promise((r) => setTimeout(r, 120));
      samples.push(['120 ms in', g(), window.MW.sonar.busy]);
      await new Promise((r) => setTimeout(r, 900));
      samples.push(['1 s in', g(), window.MW.sonar.busy]);
      const r = await p;
      samples.push(['after', g(), window.MW.sonar.listening]);
      return { samples, seconds: r && r.seconds, state: window.MW.music.state() };
    });
    console.log(`chirp ${chirp.seconds && chirp.seconds.toFixed(2)} s: gain samples ${JSON.stringify(chirp.samples)} violations ${chirp.state.stats.violations} of ${chirp.state.stats.duckSamples} ticks`);
    assert(chirp.samples.every((s) => s[1] === 0), 'exactly zero at the call, during the chirp and after it with the mic reopened');
    assert(chirp.samples[3][2] === true && chirp.state.ducked, 'the mic reopened after the chirp and the duck held');
    assert(chirp.state.stats.violations === 0 && chirp.state.stats.duckSamples > 10, 'the engine saw zero gain on every tick of the window');
    await page.click('#screen-handshake [data-action="listen"]'); // STOP
    await page.waitForFunction(() => !window.MW.sonar.listening);
    await page.waitForTimeout(500);
    const after = await musicState(page);
    console.log(`after STOP: ducked ${after.ducked} gain ${after.gain.toFixed(3)} playing ${after.playing}`);
    assert(!after.ducked && after.gain > 0.9 && after.playing === 'battle', 'the music comes back after the window closes, still the battle');
    await page.screenshot({ path: path.join(OUT, 'soundtrack-duck-handshake.png') });
    out.duck = { open: duckOpen.gainExact, chirp: chirp.samples, violations: chirp.state.stats.violations, samples: chirp.state.stats.duckSamples };

    // --- 4. the layers and the victory, by a scripted match in QR mode ----------
    await page.click('[data-go="home"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'home' && window.MW.music.state().playing === 'theme');
    await page.click('[data-transport-choice="qr"]');
    await page.waitForFunction(() => window.MW.transport() === 'qr');
    const layers = [];
    const win = await playMatch(page, {
      mine: MINE, theirs: PEER, myPicks: WIN_PICKS, theirPicks: THEIR_PICKS_WIN,
      onRound: async (r) => {
        const s = await page.evaluate(() => ({ layer: window.MW.music.state().layer, playing: window.MW.music.state().playing, sunk: window.MW.state.enemySunk.filter(Boolean).length, mine: window.MW.state.sunk.filter(Boolean).length }));
        layers.push({ round: r, ...s });
        console.log(`  round ${r}: enemy ships sunk ${s.sunk}, mine ${s.mine} → layer ${s.layer} (${s.playing})`);
      },
    });
    assert(win && win.result === 'win', 'the scripted match is a win: ' + JSON.stringify(win));
    assert(layers[0].layer === 1 && layers[0].sunk === 1, 'round 1: the first hit brings layer 1');
    assert(layers[1].layer === 1, 'round 2: still layer 1 with two ships down');
    assert(layers[2].layer === 2 && layers[2].sunk === 3, 'round 3: the third ship down brings the lead (layer 2)');
    const st = await musicState(page);
    const layerLog = st.log.filter((l) => l.event === 'layer').map((l) => l.layer);
    assert(JSON.stringify(layerLog) === '[1,2]', 'the layer log climbed 1 then 2, once each: ' + JSON.stringify(layerLog));
    assert(st.scheduled.some((n) => n.i === 'lead' && n.scene === 'battle' && n.layer === 2), 'the lead line was scheduled once layer 2 arrived');
    assert(st.scene === 'victory', 'the win set the victory sting: ' + st.scene);
    await page.waitForFunction(() => window.MW.music.state().playing === 'victory', null, { timeout: 5000 });
    await page.waitForFunction(() => window.MW.music.state().scheduled.some((n) => n.scene === 'victory' && n.i === 'brass'), null, { timeout: 5000 });
    const sting = await musicState(page);
    assert(sting.scheduled.some((n) => n.scene === 'victory' && n.i === 'timpani'), 'the victory fanfare is scheduled: brass and timpani');
    await page.click('[data-action="to-audit"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'gameover');
    await page.waitForFunction(() => window.MW.music.state().playing === 'theme', null, { timeout: 15000 });
    const reprise = await musicState(page);
    console.log(`victory: scene ${reprise.scene} → playing ${reprise.playing} (the theme at strength)`);
    assert(reprise.scene === 'victory' && reprise.playing === 'theme', 'after the sting the full theme returns');
    await page.screenshot({ path: path.join(OUT, 'soundtrack-victory.png') });
    out.win = { layers, layerLog };

    // --- 5. the defeat ------------------------------------------------------
    await page.click('[data-go="home"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'home' && window.MW.music.state().playing === 'theme');
    const loss = await playMatch(page, { mine: MINE, theirs: PEER, myPicks: LOSS_MINE, theirPicks: LOSS_THEIRS });
    assert(loss && loss.result === 'loss', 'the second scripted match is a loss: ' + JSON.stringify(loss));
    await page.waitForFunction(() => window.MW.music.state().playing === 'defeat', null, { timeout: 5000 });
    await page.waitForFunction(() => window.MW.music.state().scheduled.some((n) => n.scene === 'defeat'), null, { timeout: 5000 });
    const defeat = await musicState(page);
    console.log(`defeat: scene ${defeat.scene} playing ${defeat.playing} layer ${defeat.layer}`);
    assert(defeat.scene === 'defeat' && defeat.scheduled.some((n) => n.scene === 'defeat' && n.i === 'brassDark'), 'the loss brings the sombre brass descent');
    assert(defeat.layer === 2, 'their hits brought layer 1 and three of my own ships down brought the final rounds (layer 2): the heat counts both sides');
    await page.click('[data-action="to-audit"]');
    await page.waitForFunction(() => window.MW.music.state().playing === 'placement', null, { timeout: 15000 });
    console.log('after the descent: the quiet march');
    await page.click('[data-go="home"]'); // no reveal was exchanged, so the verdict stage (and NEXT CHALLENGER) never showed
    await page.waitForFunction(() => document.body.dataset.screen === 'home' && window.MW.music.state().playing === 'theme');
    out.loss = { scene: defeat.scene };

    // --- 6. the MUSIC setting -------------------------------------------------
    await page.click('[data-music-choice="off"]');
    await page.waitForFunction(() => window.MW.music.state().playing === null);
    const off = await page.evaluate(() => ({ ...window.MW.music.state(), stored: localStorage.getItem('mw.music.v1'), checked: document.querySelector('[data-music-choice][aria-checked="true"]').dataset.musicChoice }));
    assert(!off.enabled && off.stored === 'off' && off.checked === 'off', 'MUSIC off: stopped, stored, shown');
    await page.reload();
    await page.waitForFunction(() => window.MW && window.MW.music);
    const reloaded = await page.evaluate(() => ({ ...window.MW.music.state(), checked: document.querySelector('[data-music-choice][aria-checked="true"]').dataset.musicChoice, sources: window.__sources }));
    assert(!reloaded.enabled && reloaded.checked === 'off' && reloaded.sources === 0, 'the choice persists across a reload');
    await page.click('.title');
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.currentText());
    // The lamp clack on arrival is one buffer source of the feel; from here the screen is quiet, so any
    // further source on the context would be the score's. The theme makes about twelve a second.
    const sources0 = await page.evaluate(() => window.__sources);
    await page.waitForTimeout(2000);
    const silent = await page.evaluate(() => ({ ...window.MW.music.state(), sources: window.__sources, screen: document.body.dataset.screen }));
    console.log(`MUSIC off, after a gesture and a walk to the Salute: started ${silent.started} playing ${silent.playing} nodes ${silent.stats.nodes} notes ${silent.stats.notes} sources on the context ${sources0} → ${silent.sources} over 2 s (scene asked: ${silent.scene})`);
    assert(silent.screen === 'handshake' && !silent.started && silent.playing === null && silent.stats.nodes === 0 && silent.stats.notes === 0, 'with Music off no music node is created and the game walks on');
    assert(silent.sources === sources0 && sources0 <= 2, `no oscillator or buffer source joined the context in 2 s on the Salute screen (${sources0} → ${silent.sources}; the feel's clack is at most two)`);
    await page.click('[data-go="home"]');
    await page.click('[data-music-choice="on"]');
    await page.waitForFunction(() => window.MW.music.state().playing === 'theme', null, { timeout: 5000 });
    const on = await page.evaluate(() => ({ ...window.MW.music.state(), stored: localStorage.getItem('mw.music.v1') }));
    assert(on.enabled && on.stored === 'on' && on.stats.nodes > 0, 'MUSIC on brings the score straight back');
    await page.screenshot({ path: path.join(OUT, 'soundtrack-home.png') });
    out.setting = { offNodes: silent.stats.nodes, offSources: silent.sources };

    // --- 7. the chirp-mode match in the harness with the score on both phones --
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runMatch && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1000 });
    const frames = page.frames().filter((fr) => /dev=[AB]/.test(fr.url()));
    assert(frames.length === 2, 'two instances');
    for (const f of frames) {
      await f.waitForFunction(() => window.MW && window.MW.music);
      await f.evaluate(() => document.body.click()); // the gesture, on each phone
      await f.waitForFunction(() => window.MW.music.state().playing === 'theme', null, { timeout: 5000 });
    }
    const match = await page.evaluate(() => window.harness.runMatch({ cheat: null, transport: 'chirp' }));
    console.log(`chirp match with the score: ${match.rounds.length} rounds in ${match.seconds} s, ${match.sonar.chirps} chirps / ${match.sonar.resends} re-sends, outcome ${JSON.stringify(match.outcome)}, stamps ${JSON.stringify(match.stamp)}`);
    assert(match.errors.length === 0, 'no errors inside instances: ' + match.errors.join(' | '));
    assert(match.transport.a === 'chirp' && match.transport.b === 'chirp', 'both phones by chirp');
    assert(match.stamp.a.word === 'VERIFIED' && match.stamp.b.word === 'VERIFIED' && match.audit.a.verdict === 'VERIFIED' && match.audit.b.verdict === 'VERIFIED', 'VERIFIED on both phones with the score playing');
    assert(match.sonar.textFramesSeen.a === 0 && match.sonar.textFramesSeen.b === 0 && match.gate.a.rejected === 0 && match.gate.b.rejected === 0, 'every frame crossed by chirp, none rejected');
    const engines = {};
    for (const f of frames) {
      const who = /dev=A/.test(f.url()) ? 'a' : 'b';
      engines[who] = await f.evaluate(() => { const s = window.MW.music.state(); return { ...s, scenes: s.log.filter((l) => l.event === 'scene').map((l) => l.scene), ducks: s.log.filter((l) => l.event === 'duck').length, layers: s.log.filter((l) => l.event === 'layer').map((l) => l.layer) }; });
      const e = engines[who];
      console.log(`instance ${who.toUpperCase()}: scenes ${e.scenes.join(' → ')} · layers ${e.layers.join(',')} · ${e.ducks} duck changes · ${e.stats.duckSamples} ticks inside Sonar windows, ${e.stats.violations} with non-zero gain · ${e.stats.notes} notes, ${e.stats.nodes} nodes · now ${e.scene}/${e.playing}`);
      assert(e.stats.violations === 0 && e.stats.duckSamples >= 100, `${who}: the music gain was exactly zero on every tick of every listen window and chirp`);
      assert(e.ducks >= 4, `${who}: the duck followed the Sonar in and out through the match (${e.ducks} changes)`);
      assert(e.scenes.includes('placement') && e.scenes.includes('battle'), `${who}: the score moved placement → battle`);
      assert(e.layers.includes(1), `${who}: the first hit brought layer 1`);
    }
    assert(engines.a.scene === 'victory' && engines.b.scene === 'defeat', 'the winner ended on the victory reprise, the loser on the defeat descent');
    assert(engines.a.layers.includes(2), 'A, who sank three ships, reached the final-rounds layer');
    await page.screenshot({ path: path.join(OUT, 'soundtrack-chirp-match.png') });
    out.chirpMatch = { rounds: match.rounds.length, chirps: match.sonar.chirps, stamps: match.stamp, engines: { a: engines.a.stats, b: engines.b.stats } };

    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log(`soundtrack: PASS (theme in the menu; placement → battle → victory/defeat; layers 1 and 2 on their triggers; gain exactly 0 under listen and chirp, ${engines.a.stats.violations + engines.b.stats.violations} violations in ${engines.a.stats.duckSamples + engines.b.stats.duckSamples} Sonar ticks of a chirp match VERIFIED both ways; MUSIC off creates nothing)`);
    return { ok: true, ...out };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('soundtrack.js')) run().catch((e) => { console.error(e); process.exit(1); });
