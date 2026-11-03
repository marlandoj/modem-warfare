// Cold airplane-mode launch.
//
// Method (quoted verbatim in the Monday report):
//   1. Fresh Chromium profile in a temp dir (no prior cache, no registration).
//   2. Online: load /app/ once, wait for the Home badge to report OFFLINE READY
//      from the service worker's own per-URL cache check. Close the browser.
//   3. Stop the HTTP server entirely (the port now refuses connections) AND
//      relaunch the same profile with Playwright's offline network emulation.
//   4. Navigate to the app URL from a brand-new browser process. Every
//      response must be fromServiceWorker(); the badge must again report
//      READY; the shell must get through placement -> handshake (QR library
//      from cache) and warm the zxing-wasm decoder (wasm from cache).
import path from 'node:path';
import fs from 'node:fs';
import { startServer, launch, capture, assert, banner, OUT, tempProfile } from './lib.js';

export async function run() {
  banner('offline: cold launch from precache with the network gone');
  const profile = tempProfile('offline');
  const srv = await startServer();
  const url = `${srv.base}/app/`;
  let phase1;
  {
    const { context, close } = await launch({ persistentDir: profile });
    const page = await context.newPage();
    capture(page, 'install');
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    phase1 = await page.evaluate(() => ({ badge: document.querySelector('#offline-badge-text').textContent, cache: window.MW.state.cacheStatus }));
    console.log('phase 1 (online install):', phase1.badge, 'version', phase1.cache.version, 'missing', JSON.stringify(phase1.cache.missing));
    assert(phase1.cache.missing.length === 0, 'all precache URLs cached after install');
    await close();
  }
  await srv.close();
  // Prove the server is really gone.
  let refused = false;
  try { await fetch(url); } catch { refused = true; }
  assert(refused, 'server port refuses connections after close');
  console.log('phase 2: server stopped (connection refused), relaunching the same profile with offline emulation');

  const { context, close } = await launch({ persistentDir: profile, offline: true });
  const page = await context.newPage();
  const cap = capture(page, 'cold');
  const responses = [];
  page.on('response', (r) => responses.push({ url: r.url().replace(srv.base, ''), status: r.status(), sw: r.fromServiceWorker() }));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    const onLine = await page.evaluate(() => navigator.onLine);
    const title = await page.title();
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    const badge = await page.textContent('#offline-badge-text');
    console.log('cold launch: navigator.onLine =', onLine, '| title =', title, '| badge =', badge);
    await page.screenshot({ path: path.join(OUT, 'offline-cold-home.png') });

    // The Lamp from the cache: QR library, then the decoder's wasm.
    await page.click('[data-transport-choice="qr"]');
    await page.click('[data-action="new-match"]');
    await page.click('[data-action="lock"]');
    await page.waitForSelector('#qr-handshake svg', { timeout: 10000 });
    const decoder = await page.evaluate(async () => { const m = await import('./js/qr.js'); return m.prepareDecoder(); });
    console.log('offline decoder warm-up:', decoder);
    await page.screenshot({ path: path.join(OUT, 'offline-cold-handshake.png') });
    // The Sonar from the cache: in chirp mode the handshake screen loads ggwave by itself.
    let ggwave = 'sound off';
    if (await page.evaluate(() => window.MW.sound)) {
      await page.click('[data-go="home"]');
      await page.click('[data-transport-choice="chirp"]');
      await page.click('[data-action="new-match"]');
      await page.click('[data-action="lock"]');
      await page.waitForFunction(() => window.MW.sonar && window.MW.sonar.gg, null, { timeout: 15000 });
      ggwave = await page.evaluate(() => typeof window.ggwave_factory);
    }
    console.log('offline ggwave load:', ggwave);

    const notSw = responses.filter((r) => !r.sw);
    console.log(`responses: ${responses.length}, from service worker: ${responses.filter((r) => r.sw).length}`);
    for (const r of responses) console.log(`  ${r.sw ? 'SW ' : 'NET'} ${r.status} ${r.url}`);
    assert(responses.length >= 8, 'shell made requests');
    assert(notSw.length === 0, 'every response came from the service worker: ' + JSON.stringify(notSw));
    assert(/OFFLINE READY/.test(badge), 'badge READY while offline');
    assert(decoder === 'zxing-wasm' || decoder === 'BarcodeDetector', 'decoder available offline');
    const failed = cap.console.filter((l) => l.startsWith('[requestfailed]'));
    assert(failed.length === 0, 'no failed requests offline: ' + failed.join(', '));
    assert(cap.errors.length === 0, 'no console/page errors offline: ' + cap.errors.join(' | '));
    console.log('offline: PASS');
    return { ok: true, phase1, onLine, title, badge, decoder, ggwave, responses };
  } finally {
    await close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('offline.js')) run().catch((e) => { console.error(e); process.exit(1); });
