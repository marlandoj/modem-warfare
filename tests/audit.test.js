// End-of-game audit: a clean match verifies; a false result, a false sunk flag,
// a moved ship, an invalid fleet, or a wrong salt each produce LIAR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditReveal, stampFor, VERDICT } from '../app/js/audit.js';
import { commitment, fleetCellMap } from '../app/js/fleet.js';
import { parseCellLabel, SHIP_SIZES } from '../app/js/frame.js';

// Opponent's fleet: 4-ship A2..D2, 3-ship G3..G5, 2-ship C6..D6, 2-ship E1..E2.
const fleet = [
  { col: 0, row: 1, horizontal: true },
  { col: 6, row: 2, horizontal: false },
  { col: 2, row: 5, horizontal: true },
  { col: 4, row: 0, horizontal: false },
];
const salt = Uint8Array.from({ length: 16 }, (_, i) => (i * 29 + 3) & 0xff);
const commit = commitment(fleet, salt);
const P = (labels) => labels.map((l) => (l === null ? null : parseCellLabel(l)));

/** An honest opponent: compute what they would truthfully report for my picks. */
function honestRounds(picksPerRound, f = fleet) {
  const map = fleetCellMap(f.map((s, i) => ({ ...s, size: SHIP_SIZES[i] })));
  const hit = new Set();
  return picksPerRound.map((labels, i) => {
    const picks = P(labels);
    const hits = picks.map((idx) => { const h = idx !== null && map.has(idx); if (h) hit.add(idx); return h; });
    const sunk = f.map((ship, s) => {
      const cells = [];
      for (let k = 0; k < SHIP_SIZES[s]; k++) cells.push(parseCellLabel(String.fromCharCode(65 + ship.col + (ship.horizontal ? k : 0)) + (ship.row + (ship.horizontal ? 0 : k) + 1)));
      return cells.every((c) => hit.has(c));
    });
    return { round: i + 1, picks, hits, sunk };
  });
}

// Mixed hits and misses, 2-ship sunk in round 3, 4-ship sunk in round 4, match not yet over.
const PICKS = [['A2', 'B2', 'F7'], ['C2', 'G1', 'E1'], ['E2', 'A7', 'B5'], ['D2', 'G3', 'G4'], ['G5', 'C6', 'D6']];

test('audit: a clean match is VERIFIED — NO SHIP MOVED', () => {
  const rounds = honestRounds(PICKS);
  assert.equal(rounds[2].sunk[3], true, 'fixture: 2-ship E1/E2 sunk in round 3');
  assert.equal(rounds[3].sunk[0], true, 'fixture: 4-ship sunk in round 4');
  assert.deepEqual(rounds[4].sunk, [true, true, true, true], 'fixture: all sunk by round 5');
  const res = auditReveal({ commit, fleet, salt, rounds });
  assert.equal(res.verdict, VERDICT.VERIFIED);
  assert.deepEqual(res.findings, []);
  assert.equal(res.checked, 1 + 15 + 5 * 4, 'commitment + 15 shots + 4 sunk flags per round');
  assert.deepEqual(stampFor(res), { word: 'VERIFIED', sub: 'NO SHIP MOVED', cls: 'verified' });
});

test('audit: a reveal with the wrong salt fails the commitment check', () => {
  const wrong = salt.slice(); wrong[0] ^= 0x80;
  const res = auditReveal({ commit, fleet, salt: wrong, rounds: honestRounds(PICKS) });
  assert.equal(res.verdict, VERDICT.LIAR);
  assert.equal(res.findings[0].code, 'COMMIT_MISMATCH');
  assert.equal(stampFor(res).word, 'LIAR');
});

test('audit: a revealed fleet that differs from the committed one is LIAR even when every result matches it', () => {
  // The liar moves the 2-ship after committing and reports results consistent with the moved fleet.
  const moved = fleet.map((s, i) => (i === 2 ? { ...s, col: 0, row: 6 } : s));
  const res = auditReveal({ commit, fleet: moved, salt, rounds: honestRounds(PICKS, moved) });
  assert.equal(res.verdict, VERDICT.LIAR);
  assert.deepEqual(res.findings.map((f) => f.code), ['COMMIT_MISMATCH']);
});

test('audit: one false result (a HIT reported as a miss) is LIAR, named by round and cell', () => {
  const rounds = honestRounds(PICKS);
  rounds[1].hits[0] = false; // C2 was a hit on the 4-ship
  // Keep the liar internally consistent: with C2 "missed", the 4-ship can never be reported sunk.
  for (const r of rounds) r.sunk[0] = false;
  const res = auditReveal({ commit, fleet, salt, rounds });
  assert.equal(res.verdict, VERDICT.LIAR);
  assert.equal(res.findings[0].code, 'FALSE_RESULT');
  assert.equal(res.findings[0].round, 2);
  assert.match(res.findings[0].detail, /C2 reported miss, revealed fleet says HIT/);
  assert.equal(stampFor(res).sub, 'FALSE RESULT · ROUND 2');
});

test('audit: a miss reported as a HIT, and a ship reported sunk early, are both LIAR', () => {
  const r1 = honestRounds(PICKS);
  r1[0].hits[2] = true; // F7 is water
  assert.equal(auditReveal({ commit, fleet, salt, rounds: r1 }).findings[0].code, 'FALSE_RESULT');
  const r2 = honestRounds(PICKS);
  r2[0].sunk[0] = true; // 4-ship after only two hits
  const res = auditReveal({ commit, fleet, salt, rounds: r2 });
  assert.equal(res.verdict, VERDICT.LIAR);
  assert.equal(res.findings[0].code, 'FALSE_SUNK');
  assert.match(res.findings[0].detail, /4-ship reported SUNK after round 1/);
});

test('audit: an off-board or overlapping revealed fleet is LIAR before any result is checked', () => {
  const off = fleet.map((s, i) => (i === 1 ? { ...s, row: 6 } : s)); // 3-ship vertical from row 7 runs off the board
  const a = auditReveal({ commit, fleet: off, salt, rounds: honestRounds(PICKS) });
  assert.equal(a.verdict, VERDICT.LIAR);
  assert.equal(a.findings[0].code, 'INVALID_FLEET');
  const overlap = fleet.map((s, i) => (i === 3 ? { col: 1, row: 1, horizontal: false } : s));
  assert.equal(auditReveal({ commit, fleet: overlap, salt, rounds: [] }).findings[0].code, 'INVALID_FLEET');
});

test('audit: a round with no reported results is a finding, and forfeit has its own stamp', () => {
  const rounds = honestRounds(PICKS);
  rounds[4].hits = null;
  const res = auditReveal({ commit, fleet, salt, rounds });
  assert.equal(res.verdict, VERDICT.LIAR);
  assert.equal(res.findings[0].code, 'MISSING_RESULTS');
  assert.deepEqual(stampFor({ verdict: VERDICT.FORFEIT, findings: [] }), { word: 'FORFEIT', sub: 'NO REVEAL · OPPONENT FORFEITS', cls: 'forfeit' });
  assert.deepEqual(stampFor(null), { word: 'AUDIT', sub: 'AWAITING REVEAL', cls: 'pending' });
});
