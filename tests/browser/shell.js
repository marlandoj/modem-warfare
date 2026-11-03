// Shell smoke: every screen renders without console errors, the offline badge
// reaches READY from the service worker's real cache report, the transport
// setting defaults to CHIRP and is switched to QR for this walk, the
// handshake and salvo QRs render at the spec'd versions, and one round plays
// through the TYPE (manual) path with the staggered reveal. Screenshots go
// to test-output/.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

export async function run() {
  banner('shell: five screens, offline badge, QR versions, one round by TYPE');
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

    // Thursday: the transport is a Home setting. Fresh phone = CHIRP; this walk plays the Lamp.
    const defaultTransport = await page.evaluate(() => ({ transport: window.MW.transport(), checked: document.querySelector('[data-transport-choice][aria-checked="true"]').dataset.transportChoice, join: document.querySelector('#join-sub').textContent }));
    console.log('transport default:', JSON.stringify(defaultTransport));
    assert(defaultTransport.transport === 'chirp' && defaultTransport.checked === 'chirp' && defaultTransport.join === 'LISTEN', 'a fresh phone defaults to CHIRP');
    await page.click('[data-transport-choice="qr"]');
    await page.waitForFunction(() => window.MW.transport() === 'qr' && document.body.dataset.transport === 'qr');
    assert((await page.textContent('#join-sub')) === 'SCAN', 'JOIN MATCH says SCAN in QR mode');

    // Host flow to placement.
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    const ships = await page.$$eval('#board-placement .cell--ship', (els) => els.length);
    assert(ships === 11, `11 ship cells on placement, got ${ships}`);
    const labels = await page.$$eval('#board-placement .board__label', (els) => els.map((e) => e.textContent).join(''));
    assert(labels === 'ABCDEFG1234567', `board labels A–G / 1–7, got ${labels}`);
    // Reroll changes the fleet; tap-to-rotate changes one ship.
    const before = await page.evaluate(() => JSON.stringify(window.MW.state.fleet));
    await page.click('[data-action="reroll"]');
    const after = await page.evaluate(() => JSON.stringify(window.MW.state.fleet));
    console.log('reroll changed fleet:', before !== after);
    await page.screenshot({ path: path.join(OUT, 'screen-2-placement.png') });

    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && document.querySelector('#qr-handshake svg'));
    const hsVersion = await page.getAttribute('#qr-handshake svg', 'data-qr-version');
    const hsText = await page.getAttribute('#qr-handshake', 'data-text');
    const commit = await page.evaluate(() => Array.from(window.MW.state.commit, (b) => b.toString(16).padStart(2, '0')).join(''));
    console.log('handshake QR: version', hsVersion, 'text', hsText, 'commit', commit);
    assert(hsVersion === '3', 'handshake frame renders as QR v3');
    assert(hsText.length === 45, 'handshake text 45 chars');
    assert(/^[0-9a-f]{32}$/.test(commit) && !/^0+$/.test(commit), 'commitment is a real digest fixed at LOCK');
    const commitLine = await page.textContent('#commit-line');
    assert(commitLine.includes(commit), 'commitment shown on the handshake screen');
    await page.screenshot({ path: path.join(OUT, 'screen-3-handshake.png') });

    // Fake the opponent: type their handshake into the manual field.
    const peer = await page.evaluate(() => {
      const s = window.MW.state;
      const fleet = [{ col: 1, row: 0, horizontal: false }, { col: 3, row: 4, horizontal: true }, { col: 5, row: 0, horizontal: true }, { col: 0, row: 6, horizontal: true }];
      return { fleet, text: window.MW.frameToText({ type: 1, session: s.session, round: 0, commit: new Uint8Array(16).fill(7) }) };
    });
    await page.click('#screen-handshake [data-action="manual-toggle"]');
    await page.fill('#screen-handshake .manual__input', peer.text);
    await page.click('#screen-handshake .manual button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
    const hsFrame = await page.evaluate(() => window.MW.describeFrame(window.MW.textToFrame(window.MW.currentText())));
    console.log('handshake frame:', hsFrame);
    assert(/by qr$/.test(hsFrame), 'the host\'s handshake carries the transport (by qr)');
    const stillQr = await page.getAttribute('#qr-handshake', 'data-text');
    assert(stillQr === hsText, 'the handshake frame stays on the lamp after contact (nothing else is exchanged before round 1)');
    await page.click('#btn-begin-round');
    await page.waitForFunction(() => document.body.dataset.screen === 'round');
    await page.screenshot({ path: path.join(OUT, 'screen-4a-round-target.png') });
    await page.evaluate(() => window.MW.setPicks(['B1', 'B2', 'G7']));
    await page.click('[data-action="fire"]');
    await page.waitForSelector('#qr-round svg');
    const svVersion = await page.getAttribute('#qr-round svg', 'data-qr-version');
    const svText = await page.getAttribute('#qr-round', 'data-text');
    console.log('salvo QR: version', svVersion, 'text', svText);
    assert(svVersion === '2', 'salvo frame renders as QR v2');
    assert(svText.length === 20, 'salvo text 20 chars');
    assert(await page.isDisabled('#btn-reveal'), 'REVEAL is held until contact');
    await page.screenshot({ path: path.join(OUT, 'screen-4b-round-exchange.png') });

    // The opponent's plain salvo, then their result-bearing re-render (B1, B2 hit the fake fleet; G7 misses).
    const peerSalvo = await page.evaluate(() => window.MW.frameToText({ type: 2, session: window.MW.state.session, round: 1, salvo: [0, 8, 16], results: null, sunk: [false, false, false, false] }));
    await page.click('#screen-round [data-action="manual-toggle"]');
    await page.fill('#screen-round .manual__input', peerSalvo);
    await page.click('#screen-round .manual button[type="submit"]');
    await page.waitForFunction(() => window.MW.state.incoming && !window.MW.state.incoming.results);
    const afterTheirSalvo = await page.getAttribute('#qr-round', 'data-text');
    assert(afterTheirSalvo !== svText, 'my frame re-rendered with their results filled in once theirs decoded');
    assert(await page.isDisabled('#btn-reveal'), 'REVEAL still held: their results of my salvo not in yet');
    const peerResults = await page.evaluate(() => window.MW.frameToText({ type: 2, session: window.MW.state.session, round: 1, salvo: [0, 8, 16], results: { present: true, hits: [true, true, false] }, sunk: [false, false, false, false] }));
    await page.fill('#screen-round .manual__input', peerResults);
    await page.click('#screen-round .manual button[type="submit"]');
    await page.waitForFunction(() => window.MW.converged());
    const contact = await page.textContent('#contact-round');
    console.log('contact:', contact);
    assert(/CONTACT ✓/.test(contact), 'contact confirmed on convergence');
    // Re-scan of the same frame is a no-op.
    await page.fill('#screen-round .manual__input', peerResults);
    await page.click('#screen-round .manual button[type="submit"]');
    const dup = await page.evaluate(() => window.MW.state.gate.log[window.MW.state.gate.log.length - 1]);
    assert(dup.status === 'duplicate', 'identical re-scan is a duplicate no-op: ' + JSON.stringify(dup));

    await page.click('[data-action="reveal"]');
    const t0 = Date.now();
    await page.waitForFunction(() => window.MW.state.revealDone, null, { timeout: 10000 });
    const revealMs = Date.now() - t0;
    const logText = await page.textContent('#reveal-log');
    console.log(`reveal played in ${revealMs} ms:`, logText.replace(/\s+/g, ' ').trim());
    assert(revealMs >= 6 * 250 - 50, 'staggered reveal took at least 6 shells × 250 ms');
    assert(revealMs < 6000, 'and the tightened pacing keeps a round\'s reveal under 6 s');
    assert(/My shell 1 → B1 … HIT/.test(logText) && /My shell 3 → G7 … splash/.test(logText), 'reveal log shows hits and splashes');
    const hitCells = await page.$$eval('#board-reveal-enemy .cell--hit', (els) => els.length);
    assert(hitCells === 2, `two burning cells on the enemy board, got ${hitCells}`);
    await page.screenshot({ path: path.join(OUT, 'screen-4c-round-reveal.png') });
    assert(!(await page.isDisabled('#btn-next-round')), 'NEXT ROUND enabled after the reveal');

    // Game-over screen renders (no outcome yet: honest pending stamp), then the rest of the shell.
    await page.evaluate(() => window.MW.go('gameover'));
    await page.waitForFunction(() => document.body.dataset.screen === 'gameover');
    const stampWord = await page.textContent('#stamp-word');
    assert(stampWord === 'AUDIT', 'stamp pending before any reveal');
    await page.waitForSelector('#qr-reveal svg');
    const rvVersion = await page.getAttribute('#qr-reveal svg', 'data-qr-version');
    console.log('reveal QR: version', rvVersion);
    assert(rvVersion === '3', 'reveal frame renders as QR v3');
    await page.screenshot({ path: path.join(OUT, 'screen-5-gameover.png') });
    await page.click('[data-go="home"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'home');
    const screens = await page.$$eval('.screen', (els) => els.map((e) => e.dataset.route));
    assert(screens.join(',') === 'home,placement,handshake,round,gameover', `the shell has exactly the five match screens, got ${screens.join(',')}`);
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert(!/\bSECURE\b|\bENCRYPTED\b/i.test(bodyText), 'no "secure"/"encrypted" copy anywhere in the shell');

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
