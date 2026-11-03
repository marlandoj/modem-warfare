// Thursday gate: the transport is a pre-game setting, and there is no wager.
//
//   1. A fresh phone defaults to CHIRP (the setting on Home, the state, the
//      JOIN label); the choice persists across a reload; nothing on any match
//      screen offers a scan-or-chirp choice.
//   2. Inside a match only the configured carrier is presented: in chirp mode
//      no QR, no scanner, no SCAN button is visible on the handshake, the
//      exchange or the reveal screen; in QR mode no Sonar row, no CHIRP /
//      LISTEN button.
//   3. The handshake carries the setting and the joiner adopts it — both
//      directions, in the harness: a QR host with a chirp-set joiner, then a
//      chirp host with a QR-set joiner. The joiner's own handshake then
//      carries the adopted value.
//   4. A full scripted match completes in CHIRP mode with the text transport
//      muted: every frame crossed as a chirp through the peer's capture
//      pipeline (MediaStream -> AudioWorklet -> ggwave -> gate); VERIFIED on
//      both phones. (The QR-mode match is match.js.)
//   5. No wager string renders anywhere: every screen, button, title, label
//      and placeholder of both harness instances after that match and of a
//      fresh app page; and the app's own files carry no such string.
import path from 'node:path';
import fs from 'node:fs';
import { startServer, launch, capture, assert, banner, OUT, AUDIO_ARGS, ROOT } from './lib.js';

const WAGER_WORDS = /\b(WAGER|STAKE|STAKES|BET)\b/i;

/** Every string a player could read on a document: screen text, buttons, titles, labels, placeholders. */
async function readableCopy(frameOrPage) {
  return frameOrPage.evaluate(() => {
    const d = document;
    const screens = {};
    for (const s of d.querySelectorAll('.screen')) screens[s.dataset.route] = s.textContent.replace(/\s+/g, ' ').trim();
    const buttons = Array.from(d.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    const attrs = Array.from(d.querySelectorAll('[title],[aria-label],[placeholder]')).map((e) => [e.getAttribute('title'), e.getAttribute('aria-label'), e.getAttribute('placeholder')].filter(Boolean).join(' '));
    return { screens, buttons, attrs, toast: d.querySelector('#toast').textContent };
  });
}

function assertNoWager(copy, label) {
  for (const [route, text] of Object.entries(copy.screens)) assert(!WAGER_WORDS.test(text), `${label}: screen ${route} carries no wager word: ` + (WAGER_WORDS.exec(text) || [])[0]);
  for (const b of copy.buttons) assert(!WAGER_WORDS.test(b), `${label}: button carries no wager word: ${b}`);
  for (const t of copy.attrs) assert(!WAGER_WORDS.test(t), `${label}: title/label carries no wager word: ${t}`);
  assert(!WAGER_WORDS.test(copy.toast), `${label}: toast carries no wager word`);
}

/** Which carrier is visible on the current screen of an app page. */
async function presented(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('.screen:not([hidden])');
    const vis = (el) => !el.hidden && el.offsetParent !== null;
    return {
      route: document.body.dataset.route || document.body.dataset.screen,
      phase: window.MW.state.phase,
      qr: Array.from(screen.querySelectorAll('[data-transport="qr"]')).filter(vis).length,
      chirp: Array.from(screen.querySelectorAll('[data-transport="chirp"]')).filter(vis).length,
      scanButtons: Array.from(screen.querySelectorAll('[data-action="scan-toggle"],[data-action="scan-flip"]')).filter(vis).length,
      chirpButtons: Array.from(screen.querySelectorAll('[data-action="chirp"],[data-action="listen"]')).filter(vis).length,
      qrSvg: Array.from(screen.querySelectorAll('.lamp__qr svg')).filter((e) => vis(e.parentElement)).length,
      choices: screen.querySelectorAll('[data-transport-choice]').length,
      frameText: (screen.querySelector('[data-frame-text]') || {}).textContent || '',
      visibleText: Array.from(screen.querySelectorAll('*')).filter((el) => vis(el) && el.children.length === 0).map((el) => el.textContent.trim()).filter(Boolean).join(' | '),
    };
  });
}

function assertOnlyCarrier(p, mode, label) {
  assert(p.choices === 0, `${label}: no transport chooser on a match screen`);
  if (mode === 'chirp') {
    assert(p.chirp >= 1 && p.qr === 0, `${label}: chirp carrier shown, QR carrier hidden (${JSON.stringify(p)})`);
    assert(p.scanButtons === 0 && p.qrSvg === 0, `${label}: no scanner, no QR anywhere in chirp mode (${JSON.stringify(p)})`);
    assert(p.chirpButtons === 2, `${label}: CHIRP and LISTEN present`);
    assert(!/\bSCAN\b|\bQR\b/.test(p.visibleText), `${label}: no SCAN / QR word visible in chirp mode: ${p.visibleText}`);
  } else {
    assert(p.qr >= 1 && p.chirp === 0, `${label}: QR carrier shown, chirp carrier hidden (${JSON.stringify(p)})`);
    assert(p.chirpButtons === 0, `${label}: no CHIRP / LISTEN in QR mode`);
    assert(p.scanButtons === 2, `${label}: SCAN and FLIP present`);
    assert(!/\bCHIRP\b|\bLISTEN\b|\bSONAR\b/.test(p.visibleText), `${label}: no CHIRP / LISTEN / SONAR word visible in QR mode: ${p.visibleText}`);
  }
}

/** Walk one app page through handshake → exchange → game over in the given mode and check the carrier at each Salute screen. */
async function walkCarriers(page, mode) {
  await page.click('[data-go="home"]').catch(() => {});
  await page.waitForFunction(() => document.body.dataset.screen === 'home');
  await page.click(`[data-transport-choice="${mode}"]`);
  await page.waitForFunction((m) => window.MW.transport() === m, mode);
  await page.click('[data-action="new-match"]');
  await page.click('[data-action="lock"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.currentText());
  const out = { handshake: await presented(page) };
  assertOnlyCarrier(out.handshake, mode, `${mode} handshake`);
  const frame = await page.evaluate(() => window.MW.describeFrame(window.MW.textToFrame(window.MW.currentText())));
  assert(new RegExp(`by ${mode}$`).test(frame), `${mode}: the handshake frame carries the setting: ${frame}`);
  const peer = await page.evaluate(() => window.MW.frameToText({ type: 1, session: window.MW.state.session, round: 0, commit: new Uint8Array(16).fill(7), transport: window.MW.transport() }));
  await page.click('#screen-handshake [data-action="manual-toggle"]');
  await page.fill('#screen-handshake .manual__input', peer);
  await page.click('#screen-handshake .manual button[type="submit"]');
  await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
  await page.click('#btn-begin-round');
  await page.waitForFunction(() => document.body.dataset.screen === 'round');
  await page.evaluate(() => window.MW.setPicks(['B1', 'B2', 'G7']));
  await page.click('[data-action="fire"]');
  await page.waitForFunction(() => window.MW.state.phase === 'exchange' && window.MW.currentText());
  out.exchange = await presented(page);
  assertOnlyCarrier(out.exchange, mode, `${mode} exchange`);
  await page.evaluate(() => window.MW.go('gameover'));
  await page.waitForFunction(() => document.body.dataset.screen === 'gameover');
  out.gameover = await presented(page);
  assertOnlyCarrier(out.gameover, mode, `${mode} game over`);
  return { frame, ...out };
}

export async function run() {
  banner('transport: pre-game setting, carried by the handshake, one carrier per match; no wager');
  const srv = await startServer();
  const { context, close } = await launch({ args: AUDIO_ARGS });
  const page = await context.newPage();
  const cap = capture(page, 'transport');
  try {
    // --- 1. the default, the persistence, the match-screen chooser absence -----
    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => window.MW && window.MW.sound === true);
    const fresh = await page.evaluate(() => ({
      transport: window.MW.transport(), source: window.MW.state.transportSource, stored: localStorage.getItem('mw.transport.v1'),
      checked: document.querySelector('[data-transport-choice][aria-checked="true"]').dataset.transportChoice,
      choices: Array.from(document.querySelectorAll('[data-transport-choice]')).map((b) => b.dataset.transportChoice),
      onHome: !!document.querySelector('#screen-home [data-transport-choice]'),
      onMatchScreens: document.querySelectorAll('.screen--match [data-transport-choice], .screen--match .segmented').length,
      join: document.querySelector('#join-sub').textContent,
      body: document.body.dataset.transport,
    }));
    console.log('fresh phone:', JSON.stringify(fresh));
    assert(fresh.transport === 'chirp' && fresh.source === 'default' && fresh.stored === null, 'a fresh phone defaults to CHIRP with nothing stored');
    assert(fresh.checked === 'chirp' && JSON.stringify(fresh.choices) === '["chirp","qr"]', 'the setting on Home shows CHIRP checked, QR as the alternative');
    assert(fresh.onHome && fresh.onMatchScreens === 0, 'the setting lives on Home only');
    assert(fresh.join === 'LISTEN' && fresh.body === 'chirp', 'JOIN MATCH says LISTEN; the body carries the transport');

    await page.click('[data-transport-choice="qr"]');
    await page.waitForFunction(() => window.MW.transport() === 'qr');
    await page.reload();
    await page.waitForFunction(() => window.MW && window.MW.transport);
    const afterReload = await page.evaluate(() => ({ transport: window.MW.transport(), source: window.MW.state.transportSource, stored: localStorage.getItem('mw.transport.v1') }));
    console.log('after choosing QR and reloading:', JSON.stringify(afterReload));
    assert(afterReload.transport === 'qr' && afterReload.source === 'stored' && afterReload.stored === 'qr', 'the setting persists on the phone');

    // --- 2. one carrier per match: walk both modes on one phone -------------
    const chirpWalk = await walkCarriers(page, 'chirp');
    console.log('chirp mode:', chirpWalk.frame, '| handshake', JSON.stringify(chirpWalk.handshake), '| exchange', JSON.stringify(chirpWalk.exchange));
    await page.screenshot({ path: path.join(OUT, 'transport-chirp-exchange.png') });
    const qrWalk = await walkCarriers(page, 'qr');
    console.log('qr mode:', qrWalk.frame, '| handshake', JSON.stringify(qrWalk.handshake), '| exchange', JSON.stringify(qrWalk.exchange));
    await page.screenshot({ path: path.join(OUT, 'transport-qr-exchange.png') });
    const pageCopy = await readableCopy(page);
    assertNoWager(pageCopy, 'app page');
    await page.evaluate(() => { localStorage.removeItem('mw.transport.v1'); });

    // --- 3. adoption both directions, in the harness --------------------------
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runAdoption && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1000 });
    const adoptions = {};
    for (const [host, joiner] of [['qr', 'chirp'], ['chirp', 'qr']]) {
      const a = await page.evaluate(([h, j]) => window.harness.runAdoption({ host: h, joiner: j }), [host, joiner]);
      adoptions[`${host}-host`] = a;
      console.log(`adoption (${host} host, ${joiner} joiner):`, JSON.stringify({ before: a.before, after: a.after, hostFrame: a.hostFrame.transport, joinerFrame: a.joinerFrame.transport, presented: a.presented }));
      assert(a.errors.length === 0, 'no errors inside instances: ' + a.errors.join(' | '));
      assert(a.before.a === host && a.before.b === joiner && a.before.aChecked === host && a.before.bChecked === joiner, 'settings were set the opposite way before the match');
      assert(a.hostFrame.transport === host, `the host's handshake frame carries ${host}`);
      assert(a.after.b === host && a.after.source.b === 'handshake', `the joiner adopted ${host} from the handshake`);
      assert(a.after.a === host, 'the host kept its own setting');
      assert(a.joinerFrame.transport === host, `the joiner's own handshake carries the adopted ${host}`);
      assert(a.bHoldsAAs === host && a.aHoldsBAs === host, 'each phone holds the other\'s handshake with the same transport');
      const want = host === 'chirp' ? { qr: 0, chirpMin: 1 } : { chirp: 0, qrMin: 1 };
      for (const [who, p] of Object.entries(a.presented)) {
        if (host === 'chirp') assert(p.qr === 0 && p.chirp >= 1 && p.scanButtons === 0 && p.qrSvg === 0, `${who} presents the chirp carrier only after adoption: ${JSON.stringify(p)}`);
        else assert(p.chirp === 0 && p.qr >= 1 && p.chirpButtons === 0, `${who} presents the QR carrier only after adoption: ${JSON.stringify(p)}`);
      }
      void want;
    }

    // --- 4. a full match in CHIRP mode, by chirp alone ------------------------
    const chirpMatch = await page.evaluate(() => window.harness.runMatch({ cheat: null, transport: 'chirp' }));
    console.log(`chirp match: ${chirpMatch.rounds.length} rounds in ${chirpMatch.seconds} s, session ${chirpMatch.session}`);
    for (const r of chirpMatch.rounds) {
      const f = (s) => `${s.picks.join(' ')} → ${s.hits.map((h) => (h ? 'HIT' : 'miss')).join('/')} sunk=${s.enemySunk.map((x) => (x ? 1 : 0)).join('')}`;
      console.log(`  round ${r.round}: A ${f(r.a)} | B ${f(r.b)}`);
    }
    console.log('transport:', JSON.stringify(chirpMatch.transport));
    console.log('sonar:', JSON.stringify(chirpMatch.sonar));
    console.log('outcome:', JSON.stringify(chirpMatch.outcome));
    console.log('audit:', JSON.stringify(chirpMatch.audit));
    console.log('stamps:', JSON.stringify(chirpMatch.stamp));
    console.log('gate tallies:', JSON.stringify(chirpMatch.gate));
    await page.screenshot({ path: path.join(OUT, 'transport-chirp-match.png') });
    assert(chirpMatch.errors.length === 0, 'no errors inside instances (chirp match): ' + chirpMatch.errors.join(' | '));
    assert(chirpMatch.transport.a === 'chirp' && chirpMatch.transport.b === 'chirp', 'both phones play by chirp');
    assert(chirpMatch.rounds.length >= 4 && chirpMatch.rounds.length <= 12, `match length ${chirpMatch.rounds.length} rounds inside the spec envelope`);
    assert(chirpMatch.outcome.a.result === 'win' && chirpMatch.outcome.b.result === 'loss' && chirpMatch.outcome.a.finalRound === chirpMatch.outcome.b.finalRound, 'A wins, B loses, both agree on the final round');
    assert(chirpMatch.audit.a.verdict === 'VERIFIED' && chirpMatch.audit.b.verdict === 'VERIFIED', 'both audits VERIFIED');
    assert(chirpMatch.stamp.a.word === 'VERIFIED' && chirpMatch.stamp.b.word === 'VERIFIED' && chirpMatch.stamp.a.stage === 'verdict' && chirpMatch.stamp.b.stage === 'verdict', 'both phones stamp VERIFIED on the verdict stage');
    assert(chirpMatch.commits.aOfB === chirpMatch.commits.bActual && chirpMatch.commits.bOfA === chirpMatch.commits.aActual, 'each phone holds the other\'s real commitment');
    assert(chirpMatch.sonar.textFramesSeen.a === 0 && chirpMatch.sonar.textFramesSeen.b === 0, 'no frame crossed the text transport (it was muted)');
    assert(chirpMatch.sonar.sonarFramesSeen.a >= 1 + chirpMatch.rounds.length * 2 && chirpMatch.sonar.sonarFramesSeen.b >= 1 + chirpMatch.rounds.length * 2, 'every frame each phone acted on arrived by chirp: ' + JSON.stringify(chirpMatch.sonar.sonarFramesSeen));
    assert(chirpMatch.gate.a.rejected === 0 && chirpMatch.gate.b.rejected === 0, 'no rejected frames');

    // --- 5. no wager string, anywhere --------------------------------------
    for (const f of page.frames().filter((fr) => /dev=[AB]/.test(fr.url()))) {
      const copy = await readableCopy(f);
      assertNoWager(copy, `instance ${/dev=A/.test(f.url()) ? 'A' : 'B'}`);
    }
    const files = [];
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(js|html|css|webmanifest)$/.test(e.name)) files.push(p); } };
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'dev'));
    const offenders = files.filter((f) => /wager/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
    console.log(`source scan: ${files.length} files under app/ and dev/, "wager" in ${offenders.length}`);
    assert(offenders.length === 0, 'no "wager" in any app/ or dev/ source file: ' + offenders.join(', '));

    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log(`transport: PASS (default CHIRP; adoption both directions; chirp-mode match VERIFIED both ways by chirp alone, ${chirpMatch.sonar.chirps} chirps / ${chirpMatch.sonar.resends} re-sends; no wager string)`);
    return { ok: true, fresh, afterReload, chirpWalk, qrWalk, adoptions, chirpMatch };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('transport.js')) run().catch((e) => { console.error(e); process.exit(1); });
