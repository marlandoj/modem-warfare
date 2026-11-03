// Wednesday gate: the kill switch. The app is served with config.js replaced
// by the one-line flip (SOUND = false) and:
//   - the full scripted match still completes over QR, VERIFIED on both phones;
//   - the rendered interface carries no sound affordance in either instance:
//     no element marked data-needs-sound, no Sonar row, no CHIRP/LISTEN
//     button, no SONAR/CHIRP/LISTEN/MIC/SOUND word in any screen's text;
//   - no AudioContext is ever constructed (counted by an init script in
//     every frame) and the shell's sound surface reports off.
// The same walk with the flag ON (the committed default) runs in match.js
// and sonar.js; this file is the OFF half of "both ways".
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

const OFF = "export const SOUND = false;\n";
const SOUND_WORDS = /\b(SONAR|CHIRP|LISTEN|MIC|MICROPHONE|SOUND|AUDIO|MUTE|VOLUME|SPEAKER)\b/i;

export async function run() {
  banner('soundflag: match with SOUND = false, no sound affordance rendered');
  const srv = await startServer({ overrides: { '/app/js/config.js': OFF } });
  const { context, close } = await launch();
  await context.addInitScript(() => {
    // Count every AudioContext construction in every frame.
    window.__acCount = 0;
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const Orig = window[name];
      if (!Orig) continue;
      window[name] = function (...args) { window.__acCount += 1; return new Orig(...args); };
      window[name].prototype = Orig.prototype;
    }
  });
  const page = await context.newPage();
  const cap = capture(page, 'soundflag');
  try {
    const served = await (await fetch(`${srv.base}/app/js/config.js`)).text();
    assert(served === OFF, 'config.js is served flipped: ' + JSON.stringify(served));

    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runMatch && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1000 });
    const flags = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map((f) => ({ sound: f.contentWindow.MW.sound, sonar: f.contentWindow.MW.sonar })));
    assert(flags.every((f) => f.sound === false && f.sonar === null), 'both instances report sound off: ' + JSON.stringify(flags));

    const clean = await page.evaluate(() => window.harness.runMatch({ cheat: null, transport: 'qr' }));
    console.log(`match with SOUND=false: ${clean.rounds.length} rounds in ${clean.seconds} s, outcome ${JSON.stringify(clean.outcome)}`);
    console.log('stamps:', JSON.stringify(clean.stamp));
    assert(clean.errors.length === 0, 'no errors inside instances: ' + clean.errors.join(' | '));
    assert(clean.audit.a.verdict === 'VERIFIED' && clean.audit.b.verdict === 'VERIFIED', 'both audits VERIFIED with the flag off');
    assert(clean.stamp.a.word === 'VERIFIED' && clean.stamp.b.word === 'VERIFIED', 'both stamps VERIFIED with the flag off');
    assert(clean.transport.a === 'qr' && clean.transport.b === 'qr', 'with the flag off the only transport is QR');

    // The interface: walk every screen of both instances and look for any sound affordance.
    const audit = await page.evaluate(() => {
      const out = [];
      for (const f of document.querySelectorAll('iframe')) {
        const d = f.contentDocument;
        const w = f.contentWindow;
        const screens = {};
        for (const s of d.querySelectorAll('.screen')) screens[s.dataset.route] = s.textContent.replace(/\s+/g, ' ').trim();
        const buttons = Array.from(d.querySelectorAll('button')).map((b) => b.textContent.trim());
        const attrs = Array.from(d.querySelectorAll('[title],[aria-label],[placeholder]')).map((e) => [e.getAttribute('title'), e.getAttribute('aria-label'), e.getAttribute('placeholder')].filter(Boolean).join(' '));
        out.push({
          transport: w.MW.transport(),
          choices: Array.from(d.querySelectorAll('[data-transport-choice]')).map((b) => b.dataset.transportChoice),
          needsSound: d.querySelectorAll('[data-needs-sound]').length,
          sonarRows: d.querySelectorAll('[data-sonar], .sonar-row').length,
          chirpButtons: d.querySelectorAll('[data-action="chirp"],[data-action="listen"]').length,
          disabledButtons: Array.from(d.querySelectorAll('button:disabled')).map((b) => b.textContent.trim()),
          screens,
          buttons,
          attrs,
          acCount: w.__acCount,
          ggwaveLoaded: typeof w.ggwave_factory,
          audioEnabled: w.MW.sound,
        });
      }
      return out;
    });
    for (const [i, a] of audit.entries()) {
      console.log(`instance ${i === 0 ? 'A' : 'B'}: data-needs-sound=${a.needsSound} sonar rows=${a.sonarRows} chirp/listen buttons=${a.chirpButtons} AudioContexts=${a.acCount} ggwave=${a.ggwaveLoaded}`);
      assert(a.needsSound === 0, 'no element marked data-needs-sound survives boot');
      assert(a.transport === 'qr' && a.choices.length === 1 && a.choices[0] === 'qr', 'the transport setting offers QR only: ' + JSON.stringify(a.choices));
      assert(a.sonarRows === 0 && a.chirpButtons === 0, 'no Sonar row, no CHIRP / LISTEN button');
      for (const [route, text] of Object.entries(a.screens)) assert(!SOUND_WORDS.test(text), `screen ${route} carries no sound word: ` + (SOUND_WORDS.exec(text) || [])[0]);
      for (const b of a.buttons) assert(!SOUND_WORDS.test(b), `button carries no sound word: ${b}`);
      for (const t of a.attrs) assert(!SOUND_WORDS.test(t), `title/label carries no sound word: ${t}`);
      assert(a.acCount === 0, `no AudioContext constructed through a whole match (got ${a.acCount})`);
      assert(a.ggwaveLoaded === 'undefined', 'ggwave never loaded');
      assert(a.audioEnabled === false, 'MW.sound is false');
    }
    await page.screenshot({ path: path.join(OUT, 'soundflag-off-match.png') });

    // The exchange screen itself, on one phone: lamp only, nothing greyed.
    const p2 = await context.newPage();
    const cap2 = capture(p2, 'soundflag-app');
    await p2.goto(`${srv.base}/app/`);
    await p2.waitForFunction(() => window.MW && window.MW.sound === false);
    await p2.click('[data-action="new-match"]');
    await p2.click('[data-action="lock"]');
    await p2.waitForSelector('#qr-handshake svg');
    const peer = await p2.evaluate(() => window.MW.frameToText({ type: 1, session: window.MW.state.session, round: 0, commit: new Uint8Array(16).fill(7) }));
    await p2.click('#screen-handshake [data-action="manual-toggle"]');
    await p2.fill('#screen-handshake .manual__input', peer);
    await p2.click('#screen-handshake .manual button[type="submit"]');
    await p2.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
    await p2.click('#btn-begin-round');
    await p2.evaluate(() => window.MW.setPicks(['B1', 'B2', 'G7']));
    await p2.click('[data-action="fire"]');
    await p2.waitForSelector('#qr-round svg');
    const exchange = await p2.evaluate(() => {
      const panel = document.querySelector('[data-phase-panel="exchange"]');
      return { text: panel.innerText.replace(/\s+/g, ' ').trim(), lampVisible: !document.querySelector('#lamp-round').hidden, acCount: window.__acCount, needsSound: document.querySelectorAll('[data-needs-sound]').length };
    });
    console.log('exchange panel with SOUND=false:', exchange.text.slice(0, 160));
    assert(exchange.lampVisible && !SOUND_WORDS.test(exchange.text) && exchange.needsSound === 0 && exchange.acCount === 0, 'exchange screen is lamp-only with no sound word and no AudioContext');
    await p2.screenshot({ path: path.join(OUT, 'soundflag-off-exchange.png') });
    assert(cap2.errors.length === 0, 'no console/page errors on the app page: ' + cap2.errors.join(' | '));
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('soundflag: PASS (SOUND=false: VERIFIED both ways, zero sound affordances, zero AudioContexts)');
    return { ok: true, clean, audit, exchange };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('soundflag.js')) run().catch((e) => { console.error(e); process.exit(1); });
