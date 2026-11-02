// Shell smoke: every screen renders without console errors, the offline badge
// reaches READY from the service worker's real cache report, the handshake
// and salvo QRs render at the spec'd versions. Screenshots go to test-output/.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

export async function run() {
  banner('shell: six screens, offline badge, QR versions');
  const srv = await startServer();
  const { context, close } = await launch();
  const page = await context.newPage();
  const cap = capture(page, 'shell');
  try {
    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => document.querySelector('#offline-badge').dataset.state === 'ready', null, { timeout: 20000 });
    const badge = await page.textContent('#offline-badge-text');
    console.log('badge:', badge);
    assert(/OFFLINE READY/.test(badge), 'badge says offline ready');
    await page.screenshot({ path: path.join(OUT, 'screen-1-home.png') });

    // Host flow to placement.
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    const ships = await page.$$eval('#board-placement .cell--ship', (els) => els.length);
    assert(ships === 11, `11 ship cells on placement, got ${ships}`);
    const labels = await page.$$eval('#board-placement .board__label', (els) => els.map((e) => e.textContent).join(''));
    assert(labels === 'ABCDEFG1234567', `board labels A–G / 1–7, got ${labels}`);
    await page.screenshot({ path: path.join(OUT, 'screen-2-placement.png') });

    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && document.querySelector('#qr-handshake svg'));
    const hsVersion = await page.getAttribute('#qr-handshake svg', 'data-qr-version');
    const hsText = await page.getAttribute('#qr-handshake', 'data-text');
    console.log('handshake QR: version', hsVersion, 'text', hsText);
    assert(hsVersion === '3', 'handshake frame renders as QR v3');
    assert(hsText.length === 45, 'handshake text 45 chars');
    await page.screenshot({ path: path.join(OUT, 'screen-3-handshake.png') });

    // Fake the opponent: type their handshake into the manual field.
    const peerText = await page.evaluate(() => {
      const s = window.MW.state;
      return window.MW.frameToText({ type: 1, session: s.session, round: 0, commit: new Uint8Array(16).fill(7) });
    });
    await page.click('#screen-handshake [data-action="manual-toggle"]');
    await page.fill('#screen-handshake .manual__input', peerText);
    await page.click('#screen-handshake .manual button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
    await page.click('#btn-begin-round');
    await page.waitForFunction(() => document.body.dataset.screen === 'round');
    await page.screenshot({ path: path.join(OUT, 'screen-4a-round-target.png') });
    await page.evaluate(() => window.MW.setPicks(['C4', 'E2', 'G7']));
    await page.click('[data-action="fire"]');
    await page.waitForSelector('#qr-round svg');
    const svVersion = await page.getAttribute('#qr-round svg', 'data-qr-version');
    const svText = await page.getAttribute('#qr-round', 'data-text');
    console.log('salvo QR: version', svVersion, 'text', svText);
    assert(svVersion === '2', 'salvo frame renders as QR v2');
    assert(svText.length === 20, 'salvo text 20 chars');
    await page.screenshot({ path: path.join(OUT, 'screen-4b-round-exchange.png') });
    await page.click('.tab[data-phase="reveal"]');
    await page.screenshot({ path: path.join(OUT, 'screen-4c-round-reveal.png') });

    await page.click('[data-go="gameover"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'gameover');
    await page.screenshot({ path: path.join(OUT, 'screen-5-gameover.png') });
    await page.click('[data-go="home"]');
    await page.click('[data-go="sealed"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'sealed');
    const notice = await page.textContent('#screen-sealed .notice');
    assert(/NOT SECRET/.test(notice), 'Sealed Orders carries the honesty label');
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(!/\bSECURE\b|\bENCRYPTED\b/i.test(bodyText), 'no "secure"/"encrypted" copy anywhere in the shell');
    await page.screenshot({ path: path.join(OUT, 'screen-6-sealed.png') });

    const requests = cap.console.filter((l) => l.startsWith('[requestfailed]'));
    assert(requests.length === 0, 'no failed requests: ' + requests.join(', '));
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('shell: PASS (screenshots in test-output/)');
    return { ok: true, badge, hsVersion, svVersion, hsText, svText };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('shell.js')) run().catch((e) => { console.error(e); process.exit(1); });
