// Wednesday gate: the Sonar inside the app (not the spike page).
//
//   1. The app shell's CSP is byte-identical to Tuesday's and the vendored
//      ggwave glue loads under it (no 'unsafe-eval', no console error).
//   2. Microphone capture goes through the AudioWorklet module under that
//      policy: in chirp mode (the default) the handshake screen opens the
//      (fake) mic by itself with EC/NS/AGC off, the sweep runs, the capture
//      mode reports 'worklet', CHIRP closes the mic first and reopens it.
//   3. Chirp round-trip through the two-window harness with the text
//      transport MUTED: A's handshake frame reaches B by chirp alone (B
//      adopts the session), B's reaches A the same way, then ten salvo
//      chirps A -> B decode to the identical frame through B's real capture
//      pipeline (MediaStream -> AudioWorklet -> ggwave -> routeText -> gate).
//      The bar is the spike's: at least 8 of 10, every decode identical.
//
// What this cannot prove: the acoustic path (speaker -> air -> microphone).
// The harness replaces the air with the waveform samples; everything from
// the MediaStream onwards is the production code. The phones decide that.
import path from 'node:path';
import fs from 'node:fs';
import { startServer, launch, capture, assert, banner, OUT, AUDIO_ARGS, ROOT } from './lib.js';

const TUESDAY_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; font-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";

export async function run(n = 10) {
  banner(`sonar: ggwave under the shell CSP, AudioWorklet capture, chirp round-trip ×${n}`);
  const srv = await startServer();
  const { context, close } = await launch({ args: AUDIO_ARGS });
  const page = await context.newPage();
  const cap = capture(page, 'sonar');
  try {
    // --- 1 + 2: one app instance, real LISTEN / CHIRP buttons ---------------
    const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
    const cspInFile = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
    assert(cspInFile === TUESDAY_CSP, 'app shell CSP is byte-identical to Tuesday\'s (no relaxation): ' + cspInFile);
    const ggwave = fs.readFileSync(path.join(ROOT, 'app/vendor/ggwave/ggwave.js'), 'utf8');
    assert(!/new Function\(|\beval\(|[^A-Za-z0-9_$.]Function\(/.test(ggwave), 'vendored ggwave glue has no dynamic-execution call site');

    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => window.MW && window.MW.sound === true);
    assert(await page.$('[data-sonar="handshake"]') && await page.$('[data-sonar="round"]') && await page.$('[data-sonar="gameover"]'), 'Sonar row present on the three Salute screens');
    assert((await page.evaluate(() => window.MW.transport())) === 'chirp', 'transport defaults to chirp');
    await page.click('[data-action="new-match"]');
    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => window.MW.currentText());
    const lampText = await page.evaluate(() => window.MW.currentText());
    const frameLine = await page.getAttribute('[data-sonar="handshake"] [data-frame-text]', 'data-text');
    assert(frameLine === lampText, 'the Sonar row shows the frame text being chirped');
    assert((await page.$$eval('#screen-handshake .lamp__qr svg', (els) => els.length)) === 0, 'no QR is drawn in chirp mode');

    // Thursday: the mic opens by itself on a Salute screen in chirp mode; the sweep runs while it listens.
    await page.waitForFunction(() => window.MW.sonar.listening, null, { timeout: 20000 });
    const listen = await page.evaluate(() => ({ capture: window.MW.sonar.captureMode, mic: window.MW.sonar.micSettings, status: document.querySelector('#screen-handshake [data-sonar-status]').textContent, button: document.querySelector('#screen-handshake [data-action="listen"]').textContent, sweeping: document.querySelector('[data-sonar="handshake"]').classList.contains('sonar-row--listening'), auto: window.MW.state.events.some((e) => e.name === 'mw:listen' && e.auto === true), sampleRate: window.MW.sonar.chunkSize }));
    console.log('LISTEN (auto):', JSON.stringify(listen));
    assert(listen.capture === 'worklet', `capture through the AudioWorklet under the unchanged CSP (got ${listen.capture})`);
    assert(listen.mic && listen.mic.echoCancellation === false && listen.mic.noiseSuppression === false && listen.mic.autoGainControl === false, 'EC/NS/AGC all off on the mic track');
    assert(listen.button === 'STOP' && listen.auto && listen.sweeping, 'the mic opened by itself, the button reads STOP and the sweep is running');

    const chirp = await page.evaluate(async () => {
      const events = [];
      window.addEventListener('mw:listen', (e) => events.push('listen:' + e.detail.capture));
      const before = window.MW.sonar.listening;
      const r = await window.MW.chirp();
      return { before, result: r, afterListening: window.MW.sonar.listening, stats: JSON.parse(JSON.stringify(window.MW.sonar.stats)), rate: r && r.sampleRate };
    });
    console.log('CHIRP from the handshake screen:', JSON.stringify(chirp));
    assert(chirp.result && chirp.result.text === lampText, 'CHIRP sends exactly the frame on the lamp');
    assert(chirp.result.seconds > 1 && chirp.result.seconds < 6, `handshake chirp airtime ${chirp.result.seconds.toFixed(2)} s is a real chirp`);
    assert(chirp.before && chirp.afterListening, 'the mic was closed for the chirp and reopened after it');
    assert(chirp.stats.listens === 2, `listen count 2 (open, reopen): ${chirp.stats.listens}`);
    assert(chirp.rate === 48000, `shared AudioContext runs at 48 kHz for ggwave (got ${chirp.rate})`);
    await page.screenshot({ path: path.join(OUT, 'sonar-handshake.png') });
    await page.evaluate(() => window.MW.sonar.stop());

    // --- 3: the harness chirp round-trip ---------------------------------
    await page.goto(`${srv.base}/dev/harness.html`);
    await page.waitForFunction(() => window.harness && window.harness.runChirp && document.querySelectorAll('iframe').length === 2);
    await page.setViewportSize({ width: 1400, height: 1000 });
    const s = await page.evaluate((n) => window.harness.runChirp({ n }), n);
    console.log('capture mode:', s.captureMode, '| sample rate:', s.sampleRate);
    console.log('handshake A→B by chirp:', JSON.stringify(s.handshake));
    console.log('handshake B→A by chirp:', JSON.stringify(s.reply));
    console.log(`salvo chirps: ${s.salvo.decodes}/${s.salvo.attempts} decoded, ${s.salvo.identical} identical, airtime ${s.salvo.airtimeSeconds && s.salvo.airtimeSeconds.toFixed(2)} s, latencies ms ${JSON.stringify(s.salvo.latenciesMs)}`);
    console.log('B holds:', s.bIncoming, '| gates:', JSON.stringify(s.gate));
    const lines = await page.evaluate(() => window.harness.lines.map((l) => l.text));
    console.log('channel log (tail):\n  ' + lines.slice(-16).join('\n  '));
    await page.screenshot({ path: path.join(OUT, 'sonar-harness.png') });

    assert(s.errors.length === 0, 'no errors inside instances: ' + s.errors.join(' | '));
    assert(s.captureMode === 'worklet', 'B captured through the AudioWorklet');
    assert(s.handshake.identical && s.handshake.status === 'accepted', 'A\'s handshake crossed by chirp alone and the gate accepted it');
    assert(s.reply.identical && s.reply.status === 'accepted', 'B\'s handshake crossed back by chirp alone');
    assert(s.salvo.attempts === n, `${n} salvo chirps attempted`);
    assert(s.salvo.identical === s.salvo.decodes, 'every decode was the identical frame (no near-miss accepted)');
    assert(s.salvo.decodes >= Math.ceil(n * 0.8), `salvo chirps decoded ${s.salvo.decodes}/${n}, below the 8-of-10 bar`);
    assert(/^SALVO .* salvo C4 E2 G7/.test(s.bIncoming || ''), 'B\'s match state holds A\'s salvo, received by sound');
    assert(s.gate.b.rejected === 0, 'no rejected frames on B from the chirps');
    assert(cap.errors.length === 0, 'no console/page errors (the CSP would show here): ' + cap.errors.join(' | '));
    console.log(`sonar: PASS (worklet capture; handshakes by chirp both ways; salvo ${s.salvo.decodes}/${n} identical; acoustic path NOT tested here)`);
    return { ok: true, listen, chirp, summary: s };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('sonar.js')) run(Number(process.argv[2]) || 10).catch((e) => { console.error(e); process.exit(1); });
