// SHIPS gate: the fleet is drawn as ships, cell-exact, in every place a ship
// appears, and the hit / sunk / sinking states still read over the art.
//
// One phone (412×915, QR mode, the TYPE path) is driven through placement
// (a fixed fleet, then a tap-to-rotate and back), the Salute, one round that
// sinks a ship on each side and burns a cell of the capital ship, the rounds
// to the end, and the game-over reveal of the enemy fleet. At each stop the
// DOM is checked:
//   - every ship cell holds exactly one segment SVG and nothing else; the
//     SVG's box lies inside its cell's border box (no overflow into a
//     neighbour: cell-exact honesty);
//   - a ship's segments carry its class and the stern / mid / bow roles in
//     order; a rotated ship redraws vertical (the rotate transform) with the
//     bow at the bottom cell;
//   - the strip has one silhouette per ship, one .fleet__cell group per cell;
//   - a hit ship cell keeps its art and gets the fireball; a sunk ship keeps
//     its art and settles; the sinking animation ran from the stern.
// Screenshots: ships-placement, ships-placement-rotated, ships-reveal (mid
// game: a sunk ship and a burning cell on my side, hits on the enemy's),
// ships-gameover (the full enemy reveal), and ships-sheet (every class in
// both orientations and every state, from the real stylesheet and module).
import path from 'node:path';
import { startServer, launch, capture, assert, banner, OUT } from './lib.js';

const VP = { width: 412, height: 915 };
// The opponent's fleet: 4-ship B1-B4 · 3-ship D5-F5 · 2-ship F1-G1 · 2-ship A7-B7.
const PEER = [{ col: 1, row: 0, horizontal: false }, { col: 3, row: 4, horizontal: true }, { col: 5, row: 0, horizontal: true }, { col: 0, row: 6, horizontal: true }];
// Mine: 4-ship A2-D2 · 3-ship G3-G5 · 2-ship C6-D6 · 2-ship E1-E2.
const MINE = [{ col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false }, { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false }];
const SIZES = [4, 3, 2, 2];
const CLASSES = ['battleship', 'cruiser', 'destroyer', 'corvette'];
const idx = (col, row) => row * 7 + col;
const shipCells = (s, size) => Array.from({ length: size }, (_, i) => idx(s.col + (s.horizontal ? i : 0), s.row + (s.horizontal ? 0 : i)));
// My salvos sink the enemy 2-ship F1-G1 in round 1 and the fleet by round 4.
const MY_PICKS = [[idx(5, 0), idx(6, 0), idx(6, 2)], [idx(1, 0), idx(1, 1), idx(1, 2)], [idx(1, 3), idx(3, 4), idx(4, 4)], [idx(5, 4), idx(0, 6), idx(1, 6)]];
// Theirs: round 1 sinks my E1-E2 2-ship and burns A2 on my 4-ship; then water.
const THEIR_PICKS = [[idx(4, 0), idx(4, 1), idx(0, 1)], [idx(1, 0), idx(2, 0), idx(3, 0)], [idx(5, 1), idx(6, 1), idx(0, 2)], [idx(0, 3), idx(0, 4), idx(0, 5)]];

function peerResults() {
  const cells = PEER.map((s, i) => shipCells(s, SIZES[i]));
  const hit = new Set();
  return MY_PICKS.map((picks) => {
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

/** Inspect a board: every ship cell's art, its box against the cell's, the ships' segment order. */
async function inspectBoard(page, boardSel, fleet) {
  return page.evaluate(([sel, fleet, SIZES]) => {
    const board = document.querySelector(sel);
    const cells = Array.from(board.querySelectorAll('.cell'));
    const shipCellsEl = cells.filter((c) => c.classList.contains('cell--ship'));
    const problems = [];
    for (const c of shipCellsEl) {
      const svgs = c.querySelectorAll('svg.ship');
      if (svgs.length !== 1 || c.children.length !== 1 + c.querySelectorAll('i.impact').length) problems.push(`${c.dataset.cell}: ${svgs.length} svg, ${c.children.length} children`);
      const cr = c.getBoundingClientRect();
      const sr = svgs[0] ? svgs[0].getBoundingClientRect() : cr;
      // The settled wreck is transformed (lower, tilted, smaller); its art moves with the cell, so compare untransformed boxes only.
      if (!c.classList.contains('cell--settled') && !c.classList.contains('cell--sinking')) {
        if (sr.left < cr.left - 0.75 || sr.right > cr.right + 0.75 || sr.top < cr.top - 0.75 || sr.bottom > cr.bottom + 0.75) problems.push(`${c.dataset.cell}: art box ${Math.round(sr.left)},${Math.round(sr.top)}-${Math.round(sr.right)},${Math.round(sr.bottom)} outside cell ${Math.round(cr.left)},${Math.round(cr.top)}-${Math.round(cr.right)},${Math.round(cr.bottom)}`);
      }
    }
    const waterWithArt = cells.filter((c) => !c.classList.contains('cell--ship') && c.querySelector('svg')).length;
    const ships = fleet.map((s, i) => {
      const size = SIZES[i];
      const seq = [];
      for (let k = 0; k < size; k++) {
        const ci = (s.row + (s.horizontal ? 0 : k)) * 7 + s.col + (s.horizontal ? k : 0);
        const cell = board.querySelector(`[data-cell="${ci}"]`);
        const svg = cell && cell.querySelector('svg.ship');
        seq.push({
          cell: ci, ship: cell && cell.dataset.ship, segment: cell && cell.dataset.segment,
          cls: svg ? Array.from(svg.classList).find((x) => x.startsWith('ship--') && !/--(bow|mid|stern)$/.test(x)) : null,
          role: svg ? Array.from(svg.classList).find((x) => /--(bow|mid|stern)$/.test(x)).replace('ship--', '') : null,
          rotated: svg ? !!svg.querySelector('g[transform="rotate(90 50 50)"]') : null,
          hit: !!(cell && cell.classList.contains('cell--hit')), sunk: !!(cell && cell.classList.contains('cell--sunk')), settled: !!(cell && cell.classList.contains('cell--settled')), sinking: !!(cell && cell.classList.contains('cell--sinking')),
          fireball: cell ? getComputedStyle(cell, '::after').content !== 'none' && cell.classList.contains('cell--hit') : false,
        });
      }
      return seq;
    });
    const cellSize = Math.round(shipCellsEl[0] ? shipCellsEl[0].getBoundingClientRect().width : 0);
    return { shipCells: shipCellsEl.length, problems, waterWithArt, ships, cellSize };
  }, [boardSel, fleet, SIZES]);
}

function checkShips(label, info, fleet, { sunk = [], hits = new Set() } = {}) {
  assert(info.shipCells === 11, `${label}: 11 ship cells (got ${info.shipCells})`);
  assert(info.problems.length === 0, `${label}: every ship cell holds one segment inside its own box: ${info.problems.join(' | ')}`);
  assert(info.waterWithArt === 0, `${label}: no water cell carries art`);
  info.ships.forEach((seq, i) => {
    const size = SIZES[i];
    const roles = seq.map((s) => s.role).join(',');
    const want = size === 2 ? 'stern,bow' : ['stern', ...Array(size - 2).fill('mid'), 'bow'].join(',');
    assert(roles === want, `${label}: ship ${i} segments run stern→bow (${roles})`);
    assert(seq.every((s) => s.cls === `ship--${CLASSES[i]}`), `${label}: ship ${i} is drawn as the ${CLASSES[i]} on every cell (${seq.map((s) => s.cls).join(',')})`);
    assert(seq.every((s) => s.rotated === !fleet[i].horizontal), `${label}: ship ${i} is ${fleet[i].horizontal ? 'horizontal' : 'vertical (rotated art)'} on every cell`);
    assert(seq.every((s) => s.ship === String(i) && Number(s.segment) === seq.indexOf(s)), `${label}: ship ${i} cells carry ship and segment indices`);
    assert(seq.every((s) => s.sunk === !!sunk[i] && (!sunk[i] || s.settled || s.sinking)), `${label}: ship ${i} sunk state ${!!sunk[i]} (settled or sinking) on every cell`);
    seq.forEach((s) => { if (hits.has(s.cell)) assert(s.hit, `${label}: cell ${s.cell} shows the hit`); });
  });
}

/** The art sheet: every class, both orientations, every state, drawn by the real module and stylesheet (tests/browser/ships-sheet.html). */
async function sheet(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 640 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cap = capture(page, 'sheet');
  try {
    await page.goto(`${base}/tests/browser/ships-sheet.html`);
    await page.waitForFunction(() => document.body.dataset.sheetReady === '1');
    await page.waitForTimeout(300);
    const n = await page.$$eval('#sheet svg.ship', (els) => els.length);
    assert(n === (4 + 3 + 2 + 2) * 4, `the sheet draws every segment of every class in every state and orientation (${n})`);
    await page.screenshot({ path: path.join(OUT, 'ships-sheet.png') });
    assert(cap.errors.length === 0, 'no errors on the sheet: ' + cap.errors.join(' | '));
    console.log(`  sheet: ${n} segments drawn`);
  } finally {
    await context.close();
  }
}

export async function run() {
  banner('ships: the fleet is drawn as ships, cell-exact, everywhere, in every state');
  const srv = await startServer();
  const browser = await launch();
  const context = await browser.browser.newContext({ viewport: VP, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, permissions: ['camera'] });
  const page = await context.newPage();
  const cap = capture(page, 'ships');
  try {
    await page.goto(`${srv.base}/app/`);
    await page.waitForFunction(() => window.MW && window.MW.transport);
    await page.click('[data-transport-choice="qr"]');
    await page.waitForFunction(() => window.MW.transport() === 'qr');

    // Placement: the full fleet, drawn as four classes.
    await page.click('[data-action="new-match"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'placement');
    await page.evaluate((f) => window.MW.setFleet(f), MINE);
    await page.waitForTimeout(400);
    let info = await inspectBoard(page, '#board-placement', MINE);
    checkShips('placement', info, MINE);
    console.log(`  placement: ${info.shipCells} ship cells of ${info.cellSize}px, classes ${info.ships.map((s) => s[0].cls.replace('ship--', '')).join(' / ')}, roles ${info.ships.map((s) => s.map((x) => x.role[0]).join('')).join(' ')}`);
    await page.screenshot({ path: path.join(OUT, 'ships-placement.png') });

    // Tap the capital ship: it rotates to vertical (A2-A5) and redraws, then back.
    await page.click(`#board-placement [data-cell="${idx(1, 1)}"]`);
    await page.waitForFunction(() => !window.MW.state.fleet[0].horizontal);
    const rotated = MINE.map((s, i) => (i === 0 ? { ...s, horizontal: false } : s));
    info = await inspectBoard(page, '#board-placement', rotated);
    checkShips('placement rotated', info, rotated);
    const vert = info.ships[0];
    assert(vert[0].role === 'stern' && vert[3].role === 'bow' && vert.every((s) => s.rotated), 'the rotated capital ship runs stern (top) to bow (bottom) in rotated art');
    console.log(`  rotate: capital ship vertical A2-A5, segments ${vert.map((s) => s.role).join('→')}, rotated art on ${vert.filter((s) => s.rotated).length}/4 cells`);
    await page.screenshot({ path: path.join(OUT, 'ships-placement-rotated.png') });
    await page.click(`#board-placement [data-cell="${idx(0, 2)}"]`);
    await page.waitForFunction(() => window.MW.state.fleet[0].horizontal);
    info = await inspectBoard(page, '#board-placement', MINE);
    checkShips('placement rotated back', info, MINE);

    // Lock, Salute, contact.
    await page.click('[data-action="lock"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'handshake' && window.MW.currentText());
    const session = await page.evaluate(() => window.MW.state.session);
    const salt = Array.from({ length: 16 }, (_, i) => (i * 29 + 3) & 0xff);
    const commit = await page.evaluate(async ([fleet, salt]) => { const F = await import('./js/fleet.js'); return Array.from(F.commitment(fleet.map((s, i) => ({ ...s, size: [4, 3, 2, 2][i] })), Uint8Array.from(salt))); }, [PEER, salt]);
    await inject(page, 'screen-handshake', await page.evaluate(([session, commit]) => window.MW.frameToText({ type: 1, session, round: 0, commit: Uint8Array.from(commit), transport: 'qr' }), [session, commit]));
    await page.waitForFunction(() => document.querySelector('#contact-handshake').dataset.state === 'contact');
    await page.click('#btn-begin-round');
    await page.waitForFunction(() => document.body.dataset.screen === 'round');

    // The target screen: the own mini board and the strip carry the art.
    const strip = await page.evaluate(() => Array.from(document.querySelectorAll('#fleet-target .fleet__ship')).map((l) => ({ hulls: l.querySelectorAll('svg.fleet__hull').length, cells: l.querySelectorAll('.fleet__cell').length, blocks: l.querySelectorAll('i.fleet__cell').length, cls: l.querySelector('svg.fleet__hull') && Array.from(l.querySelector('svg.fleet__hull').classList).find((c) => c.startsWith('ship--')) })));
    console.log('  strip:', JSON.stringify(strip));
    assert(strip.length === 4 && strip.every((l, i) => l.hulls === 1 && l.cells === SIZES[i] && l.blocks === 0 && l.cls === `ship--${CLASSES[i]}`), 'the strip has one silhouette per ship, one segment per cell, no blocks');
    info = await inspectBoard(page, '#board-own-target', MINE);
    checkShips('target mini board', info, MINE);
    console.log(`  target mini board: ${info.shipCells} ship cells of ${info.cellSize}px, all drawn`);

    // The rounds.
    const results0 = peerResults();
    for (let r = 1; r <= MY_PICKS.length; r++) {
      await page.evaluate((p) => window.MW.setPicks(p), MY_PICKS[r - 1]);
      await page.click('[data-action="fire"]');
      await page.waitForFunction(() => window.MW.state.phase === 'exchange' && window.MW.currentText());
      const theirs = THEIR_PICKS[r - 1];
      await inject(page, 'screen-round', await page.evaluate(([session, round, salvo]) => window.MW.frameToText({ type: 2, session, round, salvo, results: null, sunk: [false, false, false, false] }), [session, r, theirs]));
      await page.waitForFunction(() => window.MW.state.incoming && !window.MW.state.incoming.results);
      const res = results0[r - 1];
      await inject(page, 'screen-round', await page.evaluate(([session, round, salvo, hits, sunk]) => window.MW.frameToText({ type: 2, session, round, salvo, results: { present: true, hits }, sunk }), [session, r, theirs, res.hits, res.sunk]));
      await page.waitForFunction(() => window.MW.converged());
      await page.click('[data-action="reveal"]');
      if (r === 1) {
        // The sinking: the 2-ship's cells go under from the stern, in order.
        await page.waitForFunction(() => document.querySelectorAll('#board-reveal-own .cell--sinking').length === 2, null, { timeout: 15000 });
        const sinking = await page.evaluate(() => Array.from(document.querySelectorAll('#board-reveal-own .cell--sinking')).map((c) => ({ cell: c.dataset.cell, segment: c.dataset.segment, delay: c.style.animationDelay, art: !!c.querySelector('svg.ship') })));
        console.log('  sinking:', JSON.stringify(sinking));
        assert(sinking.every((s) => s.art) && sinking.find((s) => s.segment === '0').delay === '0ms' && sinking.find((s) => s.segment === '1').delay === '110ms', 'the sinking runs stern first over the drawn segments');
      }
      await page.waitForFunction(() => window.MW.state.revealDone, null, { timeout: 15000 });
      if (r === 1) {
        await page.waitForTimeout(1300);
        const hits = new Set([idx(4, 0), idx(4, 1), idx(0, 1)]);
        info = await inspectBoard(page, '#board-reveal-own', MINE);
        checkShips('reveal own mini board', info, MINE, { sunk: [false, false, false, true], hits });
        const burning = info.ships[0][0];
        assert(burning.hit && !burning.sunk && burning.fireball && burning.cls === 'ship--battleship', 'A2: the capital ship burns on a hit and keeps its art');
        const enemyHits = await page.$$eval('#board-reveal-enemy .cell--hit', (els) => els.length);
        const stripNow = await page.evaluate(() => Array.from(document.querySelectorAll('#fleet-reveal .fleet__ship')).map((l) => ({ sunk: l.classList.contains('fleet__ship--sunk'), hit: l.querySelectorAll('.fleet__cell--hit').length, state: l.querySelector('.fleet__state').textContent })));
        console.log(`  reveal round 1: enemy hits ${enemyHits}, my sunk ship settled, A2 burning with fireball ${burning.fireball}; strip ${JSON.stringify(stripNow)}`);
        assert(enemyHits === 2 && stripNow[3].sunk && stripNow[3].state === 'SUNK' && stripNow[0].hit === 1 && stripNow[0].state === '1/4 HIT', 'the strip marks the hit segment and the sunk ship');
        await page.screenshot({ path: path.join(OUT, 'ships-reveal.png') });
      }
      if (r < MY_PICKS.length) {
        await page.click('[data-action="next-round"]');
        await page.waitForFunction((n) => window.MW.state.round === n, r + 1);
      }
    }
    const outcome = await page.evaluate(() => window.MW.state.outcome);
    assert(outcome && outcome.result === 'win', 'the scripted match ends in a win after round 4: ' + JSON.stringify(outcome));

    // Game over: the enemy fleet revealed, every ship a settled wreck; mine with its hit and its wreck.
    await page.click('[data-action="to-audit"]');
    await page.waitForFunction(() => document.body.dataset.screen === 'gameover');
    const reveal = await page.evaluate(([session, fleet, salt]) => window.MW.frameToText({ type: 3, session, round: 5, fleet, salt: Uint8Array.from(salt), sunk: [true, true, true, true] }), [session, PEER, salt]);
    await inject(page, 'screen-gameover', reveal);
    await page.waitForFunction(() => document.querySelector('#screen-gameover').dataset.stage === 'verdict');
    await page.waitForTimeout(900);
    const enemyFleet = PEER.map((s, i) => ({ ...s, size: SIZES[i] }));
    info = await inspectBoard(page, '#board-final-enemy', enemyFleet);
    checkShips('game over enemy reveal', info, enemyFleet, { sunk: [true, true, true, true] });
    console.log(`  game over: enemy fleet revealed as ${info.ships.map((s) => s[0].cls.replace('ship--', '')).join(' / ')}, ${info.ships.flat().filter((s) => s.settled).length}/11 cells settled wrecks, cells ${info.cellSize}px`);
    info = await inspectBoard(page, '#board-final-own', MINE);
    checkShips('game over own fleet', info, MINE, { sunk: [false, false, false, true], hits: new Set([idx(0, 1)]) });
    const word = await page.textContent('#stamp-word');
    assert(word === 'VERIFIED', 'the honest reveal verifies');
    await page.screenshot({ path: path.join(OUT, 'ships-gameover.png') });

    await sheet(browser.browser, srv.base);
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('ships: PASS');
    return { ok: true };
  } finally {
    await context.close();
    await browser.close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('ships.js')) run().catch((e) => { console.error(e); process.exit(1); });
