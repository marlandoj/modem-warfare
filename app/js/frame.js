// Modem Warfare — frame codec.
//
// One frame format for both channels: the Lamp (static QR) and the Sonar
// (ggwave chirp) carry the SAME base32 text. SPEC.md fixes the payload at
// about 12 bytes: version/type, session, round, salvo cells, results bitmask,
// sunk flags, check byte. This module is plain ES2020 with no imports so it
// runs unchanged in the browser (type="module") and under Node's test runner.
//
// Byte layout (big-endian, header 11 bytes + ext + 1 check byte):
//
//   0      ver (high nibble, =1) | type (low nibble)
//   1..4   session  uint32   — random per match; JOIN MATCH scans it
//   5      round    uint8    — 0 = handshake / pre-game, 1.. = salvo rounds
//   6..8   24 bits: cell0(6) cell1(6) cell2(6) hits(3) hasResults(1) rsv(2)
//          cells index row*7+col, 0..48; 63 = empty slot
//          hits bit i = opponent's shot i of their previous salvo was a HIT
//   9      low nibble: sunk flags, bit i = my ship i (4,3,2,2) is sunk
//          high nibble (HANDSHAKE only, Thursday): bits 4..5 = transport
//          the host chose at new-game setup, 0 = chirp, 1 = qr; the joiner
//          adopts it. Reserved (zero) on every other frame type.
//   10     ext length (bytes)
//   11..   ext: HANDSHAKE = 16-byte fleet commitment: first 16 bytes of
//                           SHA-256(packed fleet ‖ 128-bit salt)
//               REVEAL    = 4-byte packed fleet + 16-byte salt
//               SALVO     = none
//   last   CRC-8 (poly 0x07, init 0) over every preceding byte
//
// A SALVO frame is therefore exactly 12 bytes -> 20 base32 chars -> QR v2-M.
// HANDSHAKE = 28 bytes -> 45 chars, REVEAL = 32 bytes -> 52 chars -> QR v3-M.
//
// Thursday: the family is these three types. Tuesday's type 4 (the stake
// note) is gone; a frame carrying that type byte is rejected as BAD_TYPE
// like any other unknown type.

export const FRAME_VERSION = 1;
export const TYPE = Object.freeze({ HANDSHAKE: 1, SALVO: 2, REVEAL: 3 });
export const TYPE_NAME = Object.freeze({ 1: 'HANDSHAKE', 2: 'SALVO', 3: 'REVEAL' });

// The transport the host fixed at setup, carried in the handshake. The frame
// is the truth whichever carrier moves it; this only tells both phones which
// carrier to present.
export const TRANSPORT = Object.freeze({ CHIRP: 'chirp', QR: 'qr' });
export const TRANSPORT_CODE = Object.freeze({ chirp: 0, qr: 1 });
export const TRANSPORT_NAME = Object.freeze({ 0: 'chirp', 1: 'qr' });
export const DEFAULT_TRANSPORT = TRANSPORT.CHIRP;

export const BOARD = 7;
export const CELL_COUNT = BOARD * BOARD; // 49
export const NO_CELL = 63;
export const SALVO_SIZE = 3;
export const SHIP_SIZES = Object.freeze([4, 3, 2, 2]);
export const HEADER_LEN = 11;
export const COMMIT_LEN = 16;
export const SALT_LEN = 16;
export const FLEET_LEN = 4;

export class FrameError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'FrameError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- CRC-8 ---

export function crc8(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

// --------------------------------------------------------------- base32 ---
// RFC 4648 alphabet, no padding. Every character is in the QR alphanumeric
// set, so the QR encoder can use its 5.5-bit/char mode instead of byte mode.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32_REV = new Int8Array(256).fill(-1);
for (let i = 0; i < B32.length; i++) B32_REV[B32.charCodeAt(i)] = i;

export function base32Encode(bytes) {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = ((acc << 8) | bytes[i]) & 0x1fff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[=\s]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B32_REV[clean.charCodeAt(i)];
    if (v < 0) throw new FrameError('BAD_BASE32', `not base32: ${JSON.stringify(clean[i])}`);
    acc = ((acc << 5) | v) & 0x1fff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------- cells ---

export function cellIndex(col, row) {
  return row * BOARD + col;
}

export function cellLabel(index) {
  if (index === null || index === undefined || index === NO_CELL) return '--';
  const col = index % BOARD;
  const row = Math.floor(index / BOARD);
  return String.fromCharCode(65 + col) + (row + 1);
}

export function parseCellLabel(label) {
  const m = /^([A-Ga-g])([1-7])$/.exec(String(label).trim());
  if (!m) throw new FrameError('BAD_CELL', `bad cell label ${label}`);
  return cellIndex(m[1].toUpperCase().charCodeAt(0) - 65, Number(m[2]) - 1);
}

// --------------------------------------------------------------- fleet ----
// Fleet = 4 ships (sizes 4,3,2,2): {col,row,horizontal}. Packed 7 bits each.

export function packFleet(fleet) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_SIZES.length) {
    throw new FrameError('BAD_FLEET', 'fleet must have 4 ships');
  }
  let acc = 0;
  for (const s of fleet) {
    acc = (acc * 128) + ((s.col & 7) << 4) + ((s.row & 7) << 1) + (s.horizontal ? 1 : 0);
  }
  acc *= 16; // 28 bits -> 32, low nibble reserved
  return new Uint8Array([(acc / 2 ** 24) & 0xff, (acc / 2 ** 16) & 0xff, (acc / 2 ** 8) & 0xff, acc & 0xff]);
}

export function unpackFleet(bytes) {
  if (bytes.length < FLEET_LEN) throw new FrameError('BAD_FLEET', 'fleet bytes too short');
  let acc = ((bytes[0] * 2 ** 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) / 16;
  const fleet = [];
  for (let i = SHIP_SIZES.length - 1; i >= 0; i--) {
    const v = acc % 128;
    acc = Math.floor(acc / 128);
    fleet[i] = { size: SHIP_SIZES[i], col: (v >> 4) & 7, row: (v >> 1) & 7, horizontal: (v & 1) === 1 };
  }
  return fleet;
}

/** Every ship inside the 7×7 board and no two ships sharing a cell. */
export function fleetIsValid(fleet) {
  if (!Array.isArray(fleet) || fleet.length !== SHIP_SIZES.length) return false;
  const taken = new Set();
  for (let s = 0; s < fleet.length; s++) {
    const ship = fleet[s];
    const size = SHIP_SIZES[s];
    for (let i = 0; i < size; i++) {
      const col = ship.col + (ship.horizontal ? i : 0);
      const row = ship.row + (ship.horizontal ? 0 : i);
      if (col < 0 || row < 0 || col >= BOARD || row >= BOARD) return false;
      const idx = cellIndex(col, row);
      if (taken.has(idx)) return false;
      taken.add(idx);
    }
  }
  return true;
}

// --------------------------------------------------------------- frames ---

function u32(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new FrameError('BAD_SESSION', 'session must be uint32');
  return n >>> 0;
}

function normaliseSalvo(salvo) {
  const out = [NO_CELL, NO_CELL, NO_CELL];
  const list = Array.isArray(salvo) ? salvo : [];
  if (list.length > SALVO_SIZE) throw new FrameError('BAD_SALVO', 'salvo has more than 3 cells');
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === null || c === undefined) continue;
    if (!Number.isInteger(c) || c < 0 || c >= CELL_COUNT) throw new FrameError('BAD_SALVO', `cell ${c} out of range`);
    out[i] = c;
  }
  return out;
}

/**
 * Build the wire bytes for a frame object:
 * { type, session, round, salvo:[i,i,i], results:{present,hits:[b,b,b]}|null,
 *   sunk:[b,b,b,b], commit:Uint8Array(16) (HANDSHAKE), fleet:[..], salt:Uint8Array(16) (REVEAL) }
 */
export function encodeFrame(frame) {
  const type = frame.type;
  if (!TYPE_NAME[type]) throw new FrameError('BAD_TYPE', `unknown frame type ${type}`);
  const session = u32(frame.session);
  const round = Number(frame.round) || 0;
  if (!Number.isInteger(round) || round < 0 || round > 255) throw new FrameError('BAD_ROUND', 'round must be 0..255');

  const salvo = normaliseSalvo(frame.salvo);
  const results = frame.results || null;
  const hasResults = !!(results && results.present);
  let hits = 0;
  if (hasResults) {
    const h = results.hits || [];
    for (let i = 0; i < SALVO_SIZE; i++) if (h[i]) hits |= 1 << i;
  }
  let sunk = 0;
  const sunkList = frame.sunk || [];
  for (let i = 0; i < SHIP_SIZES.length; i++) if (sunkList[i]) sunk |= 1 << i;
  let transportBits = 0;
  if (type === TYPE.HANDSHAKE) {
    const t = frame.transport === undefined || frame.transport === null ? DEFAULT_TRANSPORT : frame.transport;
    if (!(t in TRANSPORT_CODE)) throw new FrameError('BAD_TRANSPORT', `unknown transport ${JSON.stringify(t)}`);
    transportBits = TRANSPORT_CODE[t] << 4;
  }

  let ext;
  if (type === TYPE.HANDSHAKE) {
    ext = new Uint8Array(COMMIT_LEN);
    if (frame.commit) {
      if (frame.commit.length !== COMMIT_LEN) throw new FrameError('BAD_COMMIT', 'commit must be 16 bytes');
      ext.set(frame.commit);
    }
  } else if (type === TYPE.REVEAL) {
    ext = new Uint8Array(FLEET_LEN + SALT_LEN);
    ext.set(packFleet(frame.fleet), 0);
    if (!frame.salt || frame.salt.length !== SALT_LEN) throw new FrameError('BAD_SALT', 'salt must be 16 bytes');
    ext.set(frame.salt, FLEET_LEN);
  } else {
    ext = new Uint8Array(0);
  }

  const bytes = new Uint8Array(HEADER_LEN + ext.length + 1);
  bytes[0] = (FRAME_VERSION << 4) | type;
  bytes[1] = (session >>> 24) & 0xff;
  bytes[2] = (session >>> 16) & 0xff;
  bytes[3] = (session >>> 8) & 0xff;
  bytes[4] = session & 0xff;
  bytes[5] = round;
  const packed = (salvo[0] << 18) | (salvo[1] << 12) | (salvo[2] << 6) | (hits << 3) | (hasResults ? 1 << 2 : 0);
  bytes[6] = (packed >>> 16) & 0xff;
  bytes[7] = (packed >>> 8) & 0xff;
  bytes[8] = packed & 0xff;
  bytes[9] = (sunk & 0x0f) | transportBits;
  bytes[10] = ext.length;
  bytes.set(ext, HEADER_LEN);
  bytes[bytes.length - 1] = crc8(bytes.subarray(0, bytes.length - 1));
  return bytes;
}

export function decodeFrame(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < HEADER_LEN + 1) throw new FrameError('TOO_SHORT', `frame is ${bytes.length} bytes`);
  const version = bytes[0] >> 4;
  const type = bytes[0] & 0x0f;
  if (version !== FRAME_VERSION) throw new FrameError('BAD_VERSION', `frame version ${version}`);
  if (!TYPE_NAME[type]) throw new FrameError('BAD_TYPE', `unknown frame type ${type}`);
  const extLen = bytes[10];
  const total = HEADER_LEN + extLen + 1;
  if (bytes.length < total) throw new FrameError('TOO_SHORT', `frame declares ${total} bytes, got ${bytes.length}`);
  const body = bytes.subarray(0, total);
  const expect = crc8(body.subarray(0, total - 1));
  if (body[total - 1] !== expect) throw new FrameError('BAD_CHECK', 'check byte mismatch');

  const session = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
  const round = bytes[5];
  const packed = (bytes[6] << 16) | (bytes[7] << 8) | bytes[8];
  const salvo = [(packed >>> 18) & 63, (packed >>> 12) & 63, (packed >>> 6) & 63].map((c) => (c === NO_CELL ? null : c));
  for (const c of salvo) if (c !== null && c >= CELL_COUNT) throw new FrameError('BAD_SALVO', `cell ${c} out of range`);
  const hasResults = ((packed >>> 2) & 1) === 1;
  const hitBits = (packed >>> 3) & 7;
  const results = hasResults ? { present: true, hits: [!!(hitBits & 1), !!(hitBits & 2), !!(hitBits & 4)] } : null;
  const sunkBits = bytes[9] & 0x0f;
  const sunk = [!!(sunkBits & 1), !!(sunkBits & 2), !!(sunkBits & 4), !!(sunkBits & 8)];
  const ext = body.slice(HEADER_LEN, HEADER_LEN + extLen);

  const frame = { v: version, type, typeName: TYPE_NAME[type], session, round, salvo, results, sunk, bytes: body.slice() };
  if (type === TYPE.HANDSHAKE) {
    if (extLen !== COMMIT_LEN) throw new FrameError('BAD_EXT', `handshake ext is ${extLen} bytes`);
    frame.commit = ext;
    const code = (bytes[9] >> 4) & 0x03;
    if (!(code in TRANSPORT_NAME)) throw new FrameError('BAD_TRANSPORT', `unknown transport code ${code}`);
    frame.transport = TRANSPORT_NAME[code];
  } else if (type === TYPE.REVEAL) {
    if (extLen !== FLEET_LEN + SALT_LEN) throw new FrameError('BAD_EXT', `reveal ext is ${extLen} bytes`);
    frame.fleet = unpackFleet(ext.subarray(0, FLEET_LEN));
    frame.salt = ext.slice(FLEET_LEN);
  } else if (extLen !== 0) {
    throw new FrameError('BAD_EXT', `salvo ext is ${extLen} bytes`);
  }
  return frame;
}

export function frameToText(frame) {
  return base32Encode(encodeFrame(frame));
}

export function textToFrame(text) {
  return decodeFrame(base32Decode(text));
}

export function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function randomSession() {
  const b = new Uint8Array(4);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

// ----------------------------------------------------------------- gate ---
// The receive-side rule set from SPEC.md: "Re-scanning the same frame is a
// no-op; frames carry a round number, and a mismatch re-renders automatically
// — game state can never fork on a failed decode; worst case is 'send again'."
//
// accept(input) -> { status: 'accepted' | 'duplicate' | 'rejected', reason, frame }
//   - identical bytes to any frame already accepted -> duplicate (no-op);
//     the camera re-reads a QR every 1.5 s for as long as it is held up
//   - undecodable / bad check byte                -> rejected, reason = FrameError.code
//   - session differs from the bound session      -> rejected WRONG_SESSION
//   - round < expected                            -> rejected STALE_ROUND
//   - round > expected                            -> rejected FUTURE_ROUND
//   - HANDSHAKE after the session is bound        -> rejected WRONG_TYPE (unless duplicate)
//
// The gate does not advance rounds by itself: the game loop calls
// expectRound(n) when a round completes, so an accepted frame can never move
// the local state machine on its own.

export class FrameGate {
  constructor(opts = {}) {
    this.session = opts.session === undefined ? null : opts.session;
    this.expectedRound = opts.round || 0;
    this.lastAccepted = null;
    this.seen = new Set(); // hex of every accepted frame's bytes
    this.log = [];
  }

  bindSession(session) {
    this.session = u32(session);
  }

  expectRound(n) {
    this.expectedRound = n;
  }

  accept(input) {
    let frame;
    try {
      frame = typeof input === 'string' ? textToFrame(input) : input instanceof Uint8Array ? decodeFrame(input) : input;
      if (!frame || !frame.bytes) frame = decodeFrame(encodeFrame(frame));
    } catch (err) {
      return this._result('rejected', err.code || 'UNDECODABLE', null, err.message);
    }

    const key = hex(frame.bytes);
    if (this.lastAccepted && bytesEqual(this.lastAccepted.bytes, frame.bytes)) {
      return this._result('duplicate', 'IDENTICAL_FRAME', frame);
    }
    if (this.session !== null && frame.session !== this.session) {
      return this._result('rejected', 'WRONG_SESSION', frame);
    }
    if (this.seen.has(key)) {
      // Already acted on. Still the current round: a plain no-op. An older
      // round: tell the table the other phone is behind ("say again").
      if (frame.round < this.expectedRound) return this._result('rejected', 'STALE_ROUND', frame);
      return this._result('duplicate', 'IDENTICAL_FRAME', frame);
    }
    if (frame.type === TYPE.HANDSHAKE) {
      if (this.session !== null && this.lastAccepted) {
        return this._result('rejected', 'WRONG_TYPE', frame, 'handshake after session bound');
      }
      if (frame.round !== 0) return this._result('rejected', 'BAD_ROUND', frame, 'handshake must be round 0');
      this.session = frame.session;
      return this._accept(frame, key, 'HANDSHAKE');
    }
    if (frame.round < this.expectedRound) return this._result('rejected', 'STALE_ROUND', frame);
    if (frame.round > this.expectedRound) return this._result('rejected', 'FUTURE_ROUND', frame);
    if (this.session === null) this.session = frame.session;
    return this._accept(frame, key, frame.typeName);
  }

  _accept(frame, key, reason) {
    this.lastAccepted = frame;
    this.seen.add(key);
    return this._result('accepted', reason, frame);
  }

  _result(status, reason, frame, detail) {
    const r = { status, reason, frame, detail: detail || null };
    this.log.push({ status, reason, round: frame ? frame.round : null, type: frame ? frame.typeName : null });
    return r;
  }
}

// ------------------------------------------------------------ describers --

export function describeFrame(frame) {
  const parts = [`${frame.typeName} s=${frame.session.toString(16).padStart(8, '0')} r=${frame.round}`];
  if (frame.type === TYPE.SALVO || frame.salvo.some((c) => c !== null)) {
    parts.push('salvo ' + frame.salvo.map(cellLabel).join(' '));
  }
  if (frame.results) parts.push('results ' + frame.results.hits.map((h) => (h ? 'HIT' : 'miss')).join('/'));
  if (frame.sunk.some(Boolean)) parts.push('sunk ' + frame.sunk.map((s, i) => (s ? SHIP_SIZES[i] : null)).filter(Boolean).join(','));
  if (frame.commit) parts.push('commit ' + hex(frame.commit).slice(0, 8) + '…');
  if (frame.transport) parts.push('by ' + frame.transport);
  if (frame.fleet) parts.push('fleet ' + frame.fleet.map((s) => cellLabel(cellIndex(s.col, s.row)) + (s.horizontal ? 'h' : 'v')).join(' '));
  return parts.join(' · ');
}

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
