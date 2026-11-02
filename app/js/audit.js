// Modem Warfare — end-of-game audit.
//
// Each phone audits the OPPONENT: it holds the opponent's commitment from the
// handshake, every result the opponent reported about my salvos, every sunk
// flag the opponent raised, and finally the opponent's REVEAL frame (fleet +
// salt). The audit recomputes the commitment and replays the whole match
// against the revealed fleet. One visible artefact comes out of it: the stamp.
//
// Plain ES2020, no DOM; runs under Node for tests/audit.test.js.
import { SHIP_SIZES, cellIndex, cellLabel, fleetIsValid, bytesEqual } from './frame.js';
import { commitment } from './fleet.js';

export const VERDICT = Object.freeze({ VERIFIED: 'VERIFIED', LIAR: 'LIAR', FORFEIT: 'FORFEIT' });

function shipCellIndices(ship, size) {
  const out = [];
  for (let i = 0; i < size; i++) {
    out.push(cellIndex(ship.col + (ship.horizontal ? i : 0), ship.row + (ship.horizontal ? 0 : i)));
  }
  return out;
}

/**
 * auditReveal({ commit, fleet, salt, rounds })
 *   commit  Uint8Array(16)  the opponent's handshake commitment
 *   fleet   [{col,row,horizontal}×4]  the opponent's revealed fleet (ship i has size SHIP_SIZES[i])
 *   salt    Uint8Array(16)  the opponent's revealed salt
 *   rounds  [{ round, picks:[idx|null ×3], hits:[bool×3]|null, sunk:[bool×4] }]
 *           my salvo each round and what the opponent REPORTED about it
 *
 * -> { verdict: 'VERIFIED'|'LIAR', findings:[{round, code, detail}], checked, recomputed }
 */
export function auditReveal({ commit, fleet, salt, rounds }) {
  const findings = [];
  let checked = 0;
  let recomputed = null;

  if (!fleetIsValid(fleet)) {
    findings.push({ round: 0, code: 'INVALID_FLEET', detail: 'revealed fleet is off the board or overlaps itself' });
  } else {
    recomputed = commitment(fleet, salt);
    checked += 1;
    if (!commit || !bytesEqual(recomputed, commit)) {
      findings.push({ round: 0, code: 'COMMIT_MISMATCH', detail: 'revealed fleet + salt do not hash to the commitment fixed at LOCK' });
    }
  }

  if (fleetIsValid(fleet)) {
    const shipCells = fleet.map((ship, i) => shipCellIndices(ship, SHIP_SIZES[i]));
    const cellToShip = new Map();
    shipCells.forEach((cells, i) => cells.forEach((c) => cellToShip.set(c, i)));
    const hitSoFar = new Set();

    for (const r of rounds || []) {
      const picks = r.picks || [];
      if (!r.hits) {
        findings.push({ round: r.round, code: 'MISSING_RESULTS', detail: `no results were reported for round ${r.round}` });
        continue;
      }
      picks.forEach((idx, i) => {
        if (idx === null || idx === undefined) return;
        checked += 1;
        const truth = cellToShip.has(idx);
        const reported = !!r.hits[i];
        if (truth) hitSoFar.add(idx);
        if (truth !== reported) {
          findings.push({ round: r.round, code: 'FALSE_RESULT', detail: `${cellLabel(idx)} reported ${reported ? 'HIT' : 'miss'}, revealed fleet says ${truth ? 'HIT' : 'miss'}` });
        }
      });
      const expectSunk = shipCells.map((cells) => cells.every((c) => hitSoFar.has(c)));
      const reportedSunk = r.sunk || [false, false, false, false];
      for (let s = 0; s < SHIP_SIZES.length; s++) {
        checked += 1;
        if (!!reportedSunk[s] !== expectSunk[s]) {
          findings.push({ round: r.round, code: 'FALSE_SUNK', detail: `${SHIP_SIZES[s]}-ship reported ${reportedSunk[s] ? 'SUNK' : 'afloat'} after round ${r.round}, revealed fleet says ${expectSunk[s] ? 'SUNK' : 'afloat'}` });
        }
      }
    }
  }

  return { verdict: findings.length ? VERDICT.LIAR : VERDICT.VERIFIED, findings, checked, recomputed };
}

/** Words for the stamp. */
export function stampFor(result) {
  if (!result) return { word: 'AUDIT', sub: 'AWAITING REVEAL', cls: 'pending' };
  if (result.verdict === VERDICT.FORFEIT) return { word: 'FORFEIT', sub: 'NO REVEAL · OPPONENT FORFEITS', cls: 'forfeit' };
  if (result.verdict === VERDICT.VERIFIED) return { word: 'VERIFIED', sub: 'NO SHIP MOVED', cls: 'verified' };
  const f = result.findings[0];
  return { word: 'LIAR', sub: `${f.code.replace(/_/g, ' ')}${f.round ? ' · ROUND ' + f.round : ''}`, cls: 'liar' };
}
