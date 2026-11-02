// Fleet helpers: random valid placement on the 7×7 board, rotation, cell
// expansion, and the commitment digest (first 16 bytes of SHA-256 of the
// packed fleet ‖ 128-bit salt, the 16 bytes the HANDSHAKE frame carries).
import { BOARD, SHIP_SIZES, packFleet, cellIndex, randomBytes, SALT_LEN, COMMIT_LEN } from './frame.js';
import { sha256 } from './sha256.js';

export function shipCells(ship) {
  const cells = [];
  for (let i = 0; i < ship.size; i++) {
    const col = ship.col + (ship.horizontal ? i : 0);
    const row = ship.row + (ship.horizontal ? 0 : i);
    cells.push({ col, row, index: cellIndex(col, row) });
  }
  return cells;
}

export function shipFits(ship, others) {
  const cells = shipCells(ship);
  if (cells.some((c) => c.col < 0 || c.row < 0 || c.col >= BOARD || c.row >= BOARD)) return false;
  const taken = new Set(others.flatMap((o) => shipCells(o).map((c) => c.index)));
  return cells.every((c) => !taken.has(c.index));
}

export function randomFleet(rng = Math.random) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const fleet = [];
    let ok = true;
    for (const size of SHIP_SIZES) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horizontal = rng() < 0.5;
        const ship = {
          size,
          horizontal,
          col: Math.floor(rng() * (horizontal ? BOARD - size + 1 : BOARD)),
          row: Math.floor(rng() * (horizontal ? BOARD : BOARD - size + 1)),
        };
        if (shipFits(ship, fleet)) { fleet.push(ship); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return fleet;
  }
  throw new Error('could not place fleet');
}

/** Rotate ship i about its anchor cell. Returns the new fleet or null if it will not fit. */
export function rotateShip(fleet, i) {
  const ship = { ...fleet[i], horizontal: !fleet[i].horizontal };
  const others = fleet.filter((_, k) => k !== i);
  if (shipFits(ship, others)) return fleet.map((s, k) => (k === i ? ship : s));
  // Try to pull it back onto the board.
  const max = BOARD - ship.size;
  const nudged = { ...ship, col: Math.min(ship.col, ship.horizontal ? max : BOARD - 1), row: Math.min(ship.row, ship.horizontal ? BOARD - 1 : max) };
  if (shipFits(nudged, others)) return fleet.map((s, k) => (k === i ? nudged : s));
  return null;
}

export function fleetCellMap(fleet) {
  const map = new Map();
  fleet.forEach((ship, shipIndex) => {
    const cells = shipCells(ship);
    cells.forEach((c, k) => {
      map.set(c.index, { shipIndex, k, size: ship.size, horizontal: ship.horizontal, bow: k === cells.length - 1, stern: k === 0 });
    });
  });
  return map;
}

export function newSalt() {
  return randomBytes(SALT_LEN);
}

/**
 * commitment = SHA-256(packFleet(fleet) ‖ salt)[0..16). Synchronous and
 * independent of SubtleCrypto, so it is identical on a plain-http LAN origin,
 * on localhost, in an installed PWA with the radios off, and under Node.
 */
export function commitment(fleet, salt) {
  if (!salt || salt.length !== SALT_LEN) throw new Error('salt must be 16 bytes');
  const packed = packFleet(fleet);
  const msg = new Uint8Array(packed.length + salt.length);
  msg.set(packed, 0);
  msg.set(salt, packed.length);
  return sha256(msg).slice(0, COMMIT_LEN);
}
