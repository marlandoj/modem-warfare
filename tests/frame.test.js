// Frame codec round-trip and gate tests. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE, FRAME_VERSION, NO_CELL, HEADER_LEN,
  encodeFrame, decodeFrame, frameToText, textToFrame,
  base32Encode, base32Decode, crc8, packFleet, unpackFleet,
  cellLabel, parseCellLabel, FrameGate, FrameError, describeFrame,
} from '../app/js/frame.js';

const SESSION = 0xa1b2c3d4;
const commit = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);
const salt = Uint8Array.from({ length: 16 }, (_, i) => (255 - i * 13) & 0xff);
const fleet = [
  { col: 0, row: 1, horizontal: true },   // 4
  { col: 6, row: 2, horizontal: false },  // 3
  { col: 2, row: 5, horizontal: true },   // 2
  { col: 4, row: 0, horizontal: false },  // 2
];

const HANDSHAKE = { type: TYPE.HANDSHAKE, session: SESSION, round: 0, commit };
const SALVO = {
  type: TYPE.SALVO, session: SESSION, round: 4,
  salvo: [parseCellLabel('C4'), parseCellLabel('E2'), parseCellLabel('G7')],
  results: { present: true, hits: [true, false, true] },
  sunk: [false, true, false, false],
};
const REVEAL = { type: TYPE.REVEAL, session: SESSION, round: 11, fleet, salt, sunk: [true, true, false, true] };

function stripVolatile(f) {
  const { bytes, ...rest } = f;
  if (rest.fleet) rest.fleet = rest.fleet.map(({ col, row, horizontal }) => ({ col, row, horizontal }));
  if (rest.commit) rest.commit = Array.from(rest.commit);
  if (rest.salt) rest.salt = Array.from(rest.salt);
  return rest;
}

test('base32: RFC 4648 vectors (unpadded)', () => {
  const enc = (s) => base32Encode(new TextEncoder().encode(s));
  assert.equal(enc(''), '');
  assert.equal(enc('f'), 'MY');
  assert.equal(enc('fo'), 'MZXQ');
  assert.equal(enc('foo'), 'MZXW6');
  assert.equal(enc('foob'), 'MZXW6YQ');
  assert.equal(enc('fooba'), 'MZXW6YTB');
  assert.equal(enc('foobar'), 'MZXW6YTBOI');
  assert.equal(new TextDecoder().decode(base32Decode('MZXW6YTBOI')), 'foobar');
  assert.equal(new TextDecoder().decode(base32Decode('mzxw6ytboi======')), 'foobar');
  assert.throws(() => base32Decode('MZXW6Y1'), (e) => e.code === 'BAD_BASE32');
  assert.match(enc('foobar'), /^[A-Z2-7]+$/, 'base32 is QR-alphanumeric safe');
});

test('crc8: known value and single-bit sensitivity', () => {
  // CRC-8 poly 0x07 of "123456789" is 0xF4 (standard check value).
  assert.equal(crc8(new TextEncoder().encode('123456789')), 0xf4);
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  assert.notEqual(crc8(a), crc8(b));
});

test('salvo frame is exactly 12 bytes / 20 base32 chars', () => {
  const bytes = encodeFrame(SALVO);
  assert.equal(bytes.length, 12);
  assert.equal(bytes.length, HEADER_LEN + 1);
  const text = frameToText(SALVO);
  assert.equal(text.length, 20);
  assert.match(text, /^[A-Z2-7]{20}$/);
});

test('round-trip: handshake frame (session + commitment placeholder)', () => {
  const text = frameToText(HANDSHAKE);
  assert.equal(encodeFrame(HANDSHAKE).length, 28);
  assert.equal(text.length, 45);
  const back = textToFrame(text);
  assert.equal(back.v, FRAME_VERSION);
  assert.equal(back.type, TYPE.HANDSHAKE);
  assert.equal(back.typeName, 'HANDSHAKE');
  assert.equal(back.session, SESSION);
  assert.equal(back.round, 0);
  assert.deepEqual(back.salvo, [null, null, null]);
  assert.equal(back.results, null);
  assert.deepEqual(Array.from(back.commit), Array.from(commit));
  console.log('  handshake text:', text, '->', describeFrame(back));
});

test('round-trip: salvo frame with piggybacked results and sunk flags', () => {
  const text = frameToText(SALVO);
  const back = textToFrame(text);
  assert.equal(back.type, TYPE.SALVO);
  assert.equal(back.session, SESSION);
  assert.equal(back.round, 4);
  assert.deepEqual(back.salvo.map(cellLabel), ['C4', 'E2', 'G7']);
  assert.deepEqual(back.results, { present: true, hits: [true, false, true] });
  assert.deepEqual(back.sunk, [false, true, false, false]);
  assert.equal(describeFrame(back), 'SALVO s=a1b2c3d4 r=4 · salvo C4 E2 G7 · results HIT/miss/HIT · sunk 3');
  console.log('  salvo text:', text, '->', describeFrame(back));
});

test('round-trip: salvo frame without results (first salvo of a round) and partial salvo', () => {
  const first = { type: TYPE.SALVO, session: 7, round: 1, salvo: [0, 48, null] };
  const back = textToFrame(frameToText(first));
  assert.deepEqual(back.salvo, [0, 48, null]);
  assert.equal(back.results, null);
  assert.deepEqual(back.sunk, [false, false, false, false]);
  const raw = encodeFrame(first);
  const packed = (raw[6] << 16) | (raw[7] << 8) | raw[8];
  assert.equal((packed >>> 6) & 63, NO_CELL, 'empty slot encodes as 63');
});

test('round-trip: reveal frame (packed fleet + 16-byte salt)', () => {
  const text = frameToText(REVEAL);
  assert.equal(encodeFrame(REVEAL).length, 32);
  assert.equal(text.length, 52);
  const back = textToFrame(text);
  assert.equal(back.type, TYPE.REVEAL);
  assert.equal(back.round, 11);
  assert.deepEqual(back.fleet.map(({ col, row, horizontal }) => ({ col, row, horizontal })), fleet);
  assert.deepEqual(back.fleet.map((s) => s.size), [4, 3, 2, 2]);
  assert.deepEqual(Array.from(back.salt), Array.from(salt));
  assert.deepEqual(back.sunk, [true, true, false, true]);
  console.log('  reveal text:', text, '->', describeFrame(back));
});

test('fleet packing is lossless for every corner', () => {
  const f = [
    { col: 7, row: 7, horizontal: true }, { col: 0, row: 0, horizontal: false },
    { col: 3, row: 6, horizontal: false }, { col: 6, row: 3, horizontal: true },
  ];
  assert.deepEqual(unpackFleet(packFleet(f)).map(({ col, row, horizontal }) => ({ col, row, horizontal })), f);
});

test('encode(decode(x)) is byte-identical for all representative frames', () => {
  for (const f of [HANDSHAKE, SALVO, REVEAL]) {
    const bytes = encodeFrame(f);
    const back = decodeFrame(bytes);
    assert.deepEqual(Array.from(encodeFrame(back)), Array.from(bytes));
    assert.deepEqual(stripVolatile(decodeFrame(encodeFrame(back))), stripVolatile(back));
  }
});

test('corruption: a flipped bit fails the check byte; wrong version/type rejected', () => {
  const bytes = encodeFrame(SALVO);
  for (let i = 0; i < bytes.length - 1; i++) {
    const bad = bytes.slice();
    bad[i] ^= 0x10;
    assert.throws(() => decodeFrame(bad), (e) => e instanceof FrameError && ['BAD_CHECK', 'BAD_VERSION', 'BAD_TYPE', 'TOO_SHORT', 'BAD_SALVO'].includes(e.code), `byte ${i}`);
  }
  assert.throws(() => decodeFrame(bytes.subarray(0, 5)), (e) => e.code === 'TOO_SHORT');
  assert.throws(() => textToFrame('NOTAFRAME'), (e) => e instanceof FrameError);
  assert.throws(() => encodeFrame({ type: 9, session: 1 }), (e) => e.code === 'BAD_TYPE');
  assert.throws(() => encodeFrame({ type: TYPE.SALVO, session: 1, round: 1, salvo: [49] }), (e) => e.code === 'BAD_SALVO');
});

test('gate: handshake binds the session, duplicate re-scan is a no-op', () => {
  const gate = new FrameGate();
  const hsText = frameToText(HANDSHAKE);
  const r1 = gate.accept(hsText);
  assert.equal(r1.status, 'accepted');
  assert.equal(gate.session, SESSION);
  const r2 = gate.accept(hsText);
  assert.equal(r2.status, 'duplicate');
  assert.equal(r2.reason, 'IDENTICAL_FRAME');
  assert.equal(gate.lastAccepted, r1.frame, 'duplicate did not replace the accepted frame');
  assert.equal(gate.log.length, 2);
});

test('gate: salvo round flow — accept expected, no-op on identical, reject stale and future', () => {
  const gate = new FrameGate({ session: SESSION, round: 4 });
  const r4 = gate.accept(frameToText(SALVO));
  assert.equal(r4.status, 'accepted');
  assert.equal(r4.reason, 'SALVO');

  // The exact same QR scanned again (the opponent is still holding it up).
  const again = gate.accept(frameToText(SALVO));
  assert.equal(again.status, 'duplicate');

  // Same round, but the opponent re-rendered with results filled in: new bytes, accepted.
  const updated = { ...SALVO, results: { present: true, hits: [false, false, false] } };
  assert.equal(gate.accept(frameToText(updated)).status, 'accepted');

  // Stale: a frame from round 3 reappears (old screenshot, slow flip).
  const stale = gate.accept(frameToText({ ...SALVO, round: 3 }));
  assert.equal(stale.status, 'rejected');
  assert.equal(stale.reason, 'STALE_ROUND');

  // Future: round 6 while we expect 4.
  const future = gate.accept(frameToText({ ...SALVO, round: 6 }));
  assert.equal(future.status, 'rejected');
  assert.equal(future.reason, 'FUTURE_ROUND');

  // Local game loop advances; round 5 now accepted, round 4 now stale.
  gate.expectRound(5);
  assert.equal(gate.accept(frameToText({ ...SALVO, round: 5 })).status, 'accepted');
  assert.equal(gate.accept(frameToText(SALVO)).reason, 'STALE_ROUND');
  assert.equal(gate.lastAccepted.round, 5, 'rejected frames never touch state');
});

test('gate: wrong session, undecodable text, and late handshake are rejected without state change', () => {
  const gate = new FrameGate({ session: SESSION, round: 4 });
  gate.accept(frameToText(SALVO));
  const before = gate.lastAccepted;
  assert.equal(gate.accept(frameToText({ ...SALVO, session: SESSION + 1 })).reason, 'WRONG_SESSION');
  assert.equal(gate.accept('ZZZZ').status, 'rejected');
  assert.equal(gate.accept(frameToText(HANDSHAKE)).reason, 'WRONG_TYPE');
  assert.equal(gate.lastAccepted, before);
});

test('gate: reveal frame accepted at the expected round', () => {
  const gate = new FrameGate({ session: SESSION, round: 11 });
  const r = gate.accept(frameToText(REVEAL));
  assert.equal(r.status, 'accepted');
  assert.equal(r.reason, 'REVEAL');
  assert.equal(r.frame.fleet.length, 4);
});

test('cell labels', () => {
  assert.equal(cellLabel(0), 'A1');
  assert.equal(cellLabel(48), 'G7');
  assert.equal(cellLabel(NO_CELL), '--');
  assert.equal(parseCellLabel('d5'), 3 + 4 * 7);
  assert.throws(() => parseCellLabel('H1'), (e) => e.code === 'BAD_CELL');
});
