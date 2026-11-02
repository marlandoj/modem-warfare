// ggwave spike in headless Chromium.
//
// What this proves: the vendored ggwave Wasm build loads under the page CSP,
// encodes the real salvo frame text to an audible waveform, and decodes it
// back (a) through a WebAudio MediaStream loopback into the same capture
// pipeline the microphone uses, and (b) from a direct buffer. It also proves
// Chromium accepts the EC/NS/AGC-off microphone constraints and that the
// transmit path closes and reopens the mic.
//
// What this cannot prove: an acoustic path (speaker -> air -> microphone).
// Headless Chromium's microphone is a synthetic fake device, so the mic
// decode counter is NOT asserted here; that number comes from the two
// physical Android phones.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT, AUDIO_ARGS } from './lib.js';

export async function run(n = 10) {
  banner(`spike: ggwave loopback ×${n}`);
  const srv = await startServer();
  const { context, close } = await launch({ args: AUDIO_ARGS });
  const page = await context.newPage();
  const cap = capture(page, 'spike');
  try {
    await page.goto(`${srv.base}/spike/`);
    await page.waitForFunction(() => window.SPIKE && window.SPIKE.state.gg, null, { timeout: 30000 });
    const env = await page.textContent('#env');
    const expected = await page.evaluate(() => window.SPIKE.expectedText());
    const airtime = await page.textContent('#airtime');
    console.log('env:', env);
    console.log('frame text:', expected, '|', airtime);

    // Mic constraints honoured + close-before-transmit behaviour.
    const mic = await page.evaluate(async () => {
      const s = await window.SPIKE.openMic();
      const before = window.SPIKE.state.mic.listening;
      await window.SPIKE.transmit();
      const after = window.SPIKE.state.mic.listening;
      const lines = window.SPIKE.lines();
      window.SPIKE.closeMic();
      return { settings: s, listeningBefore: before, listeningAfterTx: after, lines: lines.slice(-4) };
    });
    console.log('mic settings:', JSON.stringify(mic.settings));
    console.log('mic log:\n  ' + mic.lines.join('\n  '));
    assert(mic.settings.echoCancellation === false && mic.settings.noiseSuppression === false && mic.settings.autoGainControl === false, 'EC/NS/AGC all false on the mic track');
    assert(mic.lines.some((l) => /mic closed/.test(l)) && mic.lines.some((l) => /transmit /.test(l)), 'transmit closed the mic first');
    assert(mic.listeningBefore && mic.listeningAfterTx, 'mic reopened after transmit');

    const webaudio = await page.evaluate((n) => window.SPIKE.runWebAudioLoopback(n), n);
    console.log('WebAudio MediaStream loopback:', JSON.stringify(webaudio));
    const direct = await page.evaluate((n) => window.SPIKE.runDirect(n), n);
    console.log('direct buffer:', JSON.stringify(direct));
    const counts = await page.evaluate(() => window.SPIKE.counts());
    const lines = await page.evaluate(() => window.SPIKE.lines());
    console.log('spike log:\n  ' + lines.join('\n  '));
    await page.screenshot({ path: path.join(OUT, 'spike.png'), fullPage: true });

    assert(webaudio.a === n, `webaudio attempts == ${n}`);
    assert(direct.a === n, `direct attempts == ${n}`);
    assert(direct.d === n, `direct decodes ${direct.d}/${n} — codec path must be lossless`);
    assert(webaudio.d >= Math.ceil(n * 0.8), `webaudio decodes ${webaudio.d}/${n} below the 8-of-10 bar`);
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log(`spike: PASS (webaudio ${webaudio.d}/${webaudio.a}, direct ${direct.d}/${direct.a}; acoustic path NOT tested here)`);
    return { ok: true, env, expected, airtime, mic, counts, lines };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('spike.js')) run(Number(process.argv[2]) || 10).catch((e) => { console.error(e); process.exit(1); });
