// Thursday gate: one unmoved screen. Match play must not scroll.
//
// At two Android viewports (360×740, 412×915) one phone is driven through a
// whole match by the TYPE path — placement, handshake (idle, scanner open or
// mic open, TYPE form open, contact), round (target with picks; exchange
// idle, with their salvo, converged; reveal with a sinking both ways), game
// over (the reveal stage idle and with the scanner / mic open; the verdict
// stage with the stamp, the tally and the audit detail) — in QR mode and in
// chirp mode. At every stop:
//   - the document does not scroll: scrollingElement.scrollHeight and
//     scrollWidth are inside the viewport, and a forced window.scrollTo lands
//     at 0;
//   - neither the screen area nor the active screen overflows its box
//     (overflow: hidden would clip, so scrollHeight vs clientHeight is checked
//     on both);
//   - every visible element's box lies inside the viewport.
// Home is allowed to scroll and is not measured.
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT, AUDIO_ARGS } from './lib.js';

export const VIEWPORTS = [{ width: 360, height: 740 }, { width: 412, height: 915 }];

// The opponent's fleet (the shell test's fake one): 4-ship B1-B4 · 3-ship D5-F5 · 2-ship F1-G1 · 2-ship A7-B7.
const PEER = [{ col: 1, row: 0, horizontal: false }, { col: 3, row: 4, horizontal: true }, { col: 5, row: 0, horizontal: true }, { col: 0, row: 6, horizontal: true }];
// Mine: 4-ship A2-D2 · 3-ship G3-G5 · 2-ship C6-D6 · 2-ship E1-E2.
const MINE = [{ col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false }, { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false }];
const SIZES = [4, 3, 2, 2];
const idx = (col, row) => row * 7 + col;
const shipCells = (s, size) => Array.from({ length: size }, (_, i) => idx(s.col + (s.horizontal ? i : 0), s.row + (s.horizontal ? 0 : i)));
// My salvos: sink the F1-G1 2-ship in round 1 (banner + sinking on the enemy), everything by round 4.
const MY_PICKS = [[idx(5, 0), idx(6, 0), idx(6, 2)], [idx(1, 0), idx(1, 1), idx(1, 2)], [idx(1, 3), idx(3, 4), idx(4, 4)], [idx(5, 4), idx(0, 6), idx(1, 6)]];
// Their salvos: sink my E1-E2 2-ship in round 1 (my own ship sinks), then mostly water.
const THEIR_PICKS = [[idx(4, 0), idx(4, 1), idx(0, 0)], [idx(1, 0), idx(2, 0), idx(3, 0)], [idx(5, 1), idx(6, 1), idx(0, 2)], [idx(0, 1), idx(0, 3), idx(0, 4)]];

function peerResults() {
  // What an honest opponent with fleet PEER reports for MY_PICKS, round by round.
  const cells = PEER.map((s, i) => shipCells(s, SIZES[i]));
  const hit = new Set();
  return MY_PICKS.map((picks) => {
    const hits = picks.map((c) => { const h = cells.some((cs) => cs.includes(c)); if (h) hit.add(c); return h; });
    const sunk = cells.map((cs) => cs.every((c) => hit.has(c)));
    return { hits, sunk };
  });
}

/** Measure the current screen. Waits for the theatre to settle first. */
async function measure(page, label, { settle = 700 } = {}) {
  await page.waitForTimeout(settle);
  const m = await page.evaluate(() => {
    const se = document.scrollingElement;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    window.scrollTo(0, 100000);
    const scrolledTo = window.scrollY;
    window.scrollTo(0, 0);
    const screens = document.querySelector('#screens');
    const screen = document.querySelector('.screen:not([hidden])');
    const over = [];
    let contentBottom = 0;
    for (const el of screen.querySelectorAll('*')) {
      if (el.hidden || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      contentBottom = Math.max(contentBottom, r.bottom);
      if (r.bottom > vh + 0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.left < -0.5) {
        over.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} y${Math.round(r.top)}..${Math.round(r.bottom)} x${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    return {
      route: document.body.dataset.screen, match: document.body.dataset.match === '1', transport: document.body.dataset.transport, phase: window.MW.state.phase,
      vw, vh, docScrollH: se.scrollHeight, docScrollW: se.scrollWidth, scrolledTo,
      screensScrollH: screens.scrollHeight, screensClientH: screens.clientHeight,
      screenScrollH: screen.scrollHeight, screenClientH: screen.clientHeight,
      avail: getComputedStyle(screens).getPropertyValue('--avail').trim(),
      contentBottom: Math.round(contentBottom),
      over,
    };
  });
  const slack = m.vh - m.contentBottom; // room below the lowest visible element
  console.log(`  ${label.padEnd(34)} doc ${m.docScrollH}/${m.vh} · screens ${m.screensScrollH}/${m.screensClientH} · screen ${m.screenScrollH}/${m.screenClientH} · slack ${slack}px · scrollTo→${m.scrolledTo}${m.over.length ? ' · OUTSIDE: ' + m.over.join(', ') : ''}`);
  assert(m.match, `${label}: body is in match layout`);
  assert(m.docScrollH <= m.vh && m.docScrollW <= m.vw, `${label}: the document does not scroll (${m.docScrollH}×${m.docScrollW} in ${m.vh}×${m.vw})`);
  assert(m.scrolledTo === 0, `${label}: a forced scroll lands at 0 (got ${m.scrolledTo})`);
  assert(m.screensScrollH <= m.screensClientH + 1, `${label}: the screen area does not overflow (${m.screensScrollH} in ${m.screensClientH})`);
  assert(m.screenScrollH <= m.screenClientH + 1, `${label}: the active screen does not overflow (${m.screenScrollH} in ${m.screenClientH})`);
  assert(m.over.length === 0, `${label}: every visible element is inside the viewport: ${m.over.join(', ')}`);
  return { label, ...m, slack };
}

async function shot(page, vp, name) {
  await page.screenshot({ path: path.join(OUT, `viewport-${vp.width}x${vp.height}-${name}.png`) });
}

async function inject(page, screen, text) {
  const open = await page.$eval(`#${screen} [data-manual]`, (m) => !m.hidden);
  if (!open) await page.click(`#${screen} [data-action="manual-toggle"]`);
  await page.fill(`#${screen} .manual__input`, text);
  await page.click(`#${screen} .manual button[type="submit"]`);
}

/** One phone, one mode, one viewport: the whole walk. Returns the measurements. */
async function walk(page, vp, mode) {
  const results = [];
  const tag = (s) => `${mode} · ${s}`;
  const results0 = peerResults();

  await page.goto(`${srv.base}/app/`);
  await page.waitForFunction(() => window.MW && window.MW.transport);
  await page.click(`[data-transport-choice="${mode}"]`);
  await page.waitForFunction((m) => window.MW.transport() === m, mode);

  // Placement.
  await page.click('[data-action="new-match"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'placement');
  await page.evaluate((f) => window.MW.setFleet(f), MINE);
  results.push(await measure(page, tag('placement')));
  await shot(page, vp, `${mode}-placement`);

  // Handshake: idle, carrier open, TYPE open, contact.
  await page.click('[data-action="lock"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.currentText());
  results.push(await measure(page, tag('handshake idle')));
  if (mode === 'qr') {
    await page.click('#screen-handshake [data-action="scan-toggle"]');
    await page.waitForFunction(() => !document.querySelector('#screen-handshake .scan__video').hidden, null, { timeout: 15000 }).catch(() => {});
    results.push(await measure(page, tag('handshake scanner open')));
  } else {
    await page.waitForFunction(() => window.MW.sonar.listening, null, { timeout: 15000 });
    results.push(await measure(page, tag('handshake mic open')));
  }
  await shot(page, vp, `${mode}-handshake`);
  await page.click('#screen-handshake [data-action="manual-toggle"]');
  results.push(await measure(page, tag('handshake TYPE open'), { settle: 200 }));
  const session = await page.evaluate(() => window.MW.state.session);
  const salt = Array.from({ length: 16 }, (_, i) => (i * 29 + 3) & 0xff);
  const commit = await page.evaluate(async ([fleet, salt]) => { const F = await import('./js/fleet.js'); return Array.from(F.commitment(fleet.map((s, i) => ({ ...s, size: [4, 3, 2, 2][i] })), Uint8Array.from(salt))); }, [PEER, salt]);
  const hs = await page.evaluate(([session, commit, mode]) => window.MW.frameToText({ type: 1, session, round: 0, commit: Uint8Array.from(commit), transport: mode }), [session, commit, mode]);
  await inject(page, 'screen-handshake', hs);
  await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
  results.push(await measure(page, tag('handshake contact')));
  await shot(page, vp, `${mode}-handshake-contact`);

  // Rounds.
  await page.click('#btn-begin-round');
  await page.waitForFunction(() => document.body.dataset.screen === 'round');
  for (let r = 1; r <= MY_PICKS.length; r++) {
    const first = r === 1;
    await page.evaluate((p) => window.MW.setPicks(p), MY_PICKS[r - 1]);
    if (first) { results.push(await measure(page, tag('round target, 3 picks'))); await shot(page, vp, `${mode}-target`); }
    await page.click('[data-action="fire"]');
    await page.waitForFunction(() => window.MW.state.phase === 'exchange' && window.MW.currentText());
    if (first) {
      results.push(await measure(page, tag('exchange idle')));
      if (mode === 'qr') {
        await page.click('#screen-round [data-action="scan-toggle"]');
        await page.waitForFunction(() => !document.querySelector('#screen-round .scan__video').hidden, null, { timeout: 15000 }).catch(() => {});
        results.push(await measure(page, tag('exchange scanner open')));
      } else {
        await page.waitForFunction(() => window.MW.sonar.listening, null, { timeout: 15000 });
        results.push(await measure(page, tag('exchange mic open')));
      }
      await shot(page, vp, `${mode}-exchange`);
    }
    const theirs = THEIR_PICKS[r - 1];
    const plain = await page.evaluate(([session, round, salvo]) => window.MW.frameToText({ type: 2, session, round, salvo, results: null, sunk: [false, false, false, false] }), [session, r, theirs]);
    await inject(page, 'screen-round', plain);
    await page.waitForFunction(() => window.MW.state.incoming && !window.MW.state.incoming.results);
    if (first) results.push(await measure(page, tag('exchange, their salvo in')));
    const res = results0[r - 1];
    const withResults = await page.evaluate(([session, round, salvo, hits, sunk]) => window.MW.frameToText({ type: 2, session, round, salvo, results: { present: true, hits }, sunk }), [session, r, theirs, res.hits, res.sunk]);
    await inject(page, 'screen-round', withResults);
    await page.waitForFunction(() => window.MW.converged());
    if (first) { results.push(await measure(page, tag('exchange converged'))); await shot(page, vp, `${mode}-exchange-contact`); }
    await page.click('[data-action="reveal"]');
    await page.waitForFunction(() => window.MW.state.revealDone, null, { timeout: 15000 });
    if (first) {
      const sunkNow = await page.evaluate(() => { const rec = window.MW.state.history[0]; return { enemy: rec.enemySunkNow, mine: rec.mySunkNow, banner: !document.querySelector('#banner').hidden, sinking: document.querySelectorAll('#board-reveal-own .cell--sunk').length }; });
      console.log(`  round 1 sinkings: enemy ${JSON.stringify(sunkNow.enemy)} mine ${JSON.stringify(sunkNow.mine)} banner ${sunkNow.banner} wreck cells ${sunkNow.sinking}`);
      assert(sunkNow.enemy[2] && sunkNow.mine[3] && sunkNow.banner && sunkNow.sinking === 2, 'round 1 sinks a ship on each side with the banner up');
      results.push(await measure(page, tag('reveal after sinkings'), { settle: 1200 }));
      await shot(page, vp, `${mode}-reveal`);
    }
    if (r < MY_PICKS.length) {
      await page.click('[data-action="next-round"]');
      await page.waitForFunction((n) => window.MW.state.round === n, r + 1);
    }
  }
  const outcome = await page.evaluate(() => window.MW.state.outcome);
  assert(outcome && outcome.result === 'win', 'the scripted match ends in a win after round 4: ' + JSON.stringify(outcome));
  results.push(await measure(page, tag('reveal, match over')));

  // Game over: the reveal stage, then the verdict stage.
  await page.click('[data-action="to-audit"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'gameover' && document.querySelector('#screen-gameover').dataset.stage === 'reveal');
  results.push(await measure(page, tag('game over, reveal stage')));
  if (mode === 'qr') {
    await page.click('#screen-gameover [data-action="scan-toggle"]');
    await page.waitForFunction(() => !document.querySelector('#screen-gameover .scan__video').hidden, null, { timeout: 15000 }).catch(() => {});
    results.push(await measure(page, tag('game over, scanner open')));
  } else {
    await page.waitForFunction(() => window.MW.sonar.listening, null, { timeout: 15000 });
    results.push(await measure(page, tag('game over, mic open')));
  }
  await shot(page, vp, `${mode}-gameover-reveal`);
  const reveal = await page.evaluate(([session, fleet, salt]) => window.MW.frameToText({ type: 3, session, round: 5, fleet, salt: Uint8Array.from(salt), sunk: [true, true, true, true] }), [session, PEER, salt]);
  await inject(page, 'screen-gameover', reveal);
  await page.waitForFunction(() => document.querySelector('#screen-gameover').dataset.stage === 'verdict');
  const verdict = await page.evaluate(() => ({ word: document.querySelector('#stamp-word').textContent, sub: document.querySelector('#stamp-sub').textContent, detail: document.querySelector('#audit-detail').textContent.slice(0, 80), landed: window.MW.state.events.some((e) => e.name === 'mw:stamp') }));
  console.log(`  verdict: ${verdict.word} · ${verdict.sub} · ${verdict.detail} · landed ${verdict.landed}`);
  assert(verdict.word === 'VERIFIED' && verdict.landed, 'the honest reveal verifies and the stamp landed');
  results.push(await measure(page, tag('game over, verdict stage'), { settle: 900 }));
  await shot(page, vp, `${mode}-gameover-verdict`);
  await page.click('[data-action="next-challenger"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'home');
  return results;
}

let srv;

export async function run() {
  banner('viewport: no match screen scrolls at 360×740 or 412×915, in QR and in chirp mode');
  srv = await startServer();
  const all = {};
  try {
    for (const vp of VIEWPORTS) {
      const browser = await launch({ args: AUDIO_ARGS });
      const context = await browser.browser.newContext({ viewport: vp, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, permissions: ['microphone', 'camera'] });
      const page = await context.newPage();
      const cap = capture(page, `viewport-${vp.width}`);
      try {
        console.log(`\n--- ${vp.width}×${vp.height} ---`);
        const sizes = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
        void sizes;
        all[`${vp.width}x${vp.height}`] = {};
        for (const mode of ['qr', 'chirp']) {
          all[`${vp.width}x${vp.height}`][mode] = await walk(page, vp, mode);
        }
        assert(cap.errors.length === 0, `no console/page errors at ${vp.width}×${vp.height}: ` + cap.errors.join(' | '));
      } finally {
        await context.close();
        await browser.close();
      }
    }
    const count = Object.values(all).flatMap((m) => Object.values(m)).flat().length;
    const minSlack = Math.min(...Object.values(all).flatMap((m) => Object.values(m)).flat().map((r) => r.slack));
    console.log(`viewport: PASS (${count} measurements, none scrolls; tightest slack ${minSlack}px)`);
    return { ok: true, all };
  } finally {
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('viewport.js')) run().catch((e) => { console.error(e); process.exit(1); });
