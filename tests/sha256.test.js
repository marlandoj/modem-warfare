// Vendored SHA-256: FIPS 180-4 vectors, padding boundaries against node:crypto,
// and the commitment format (first 16 bytes of SHA-256(packed fleet ‖ salt)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, sha256Hex } from '../app/js/sha256.js';
import { commitment } from '../app/js/fleet.js';
import { packFleet, COMMIT_LEN } from '../app/js/frame.js';

const enc = (s) => new TextEncoder().encode(s);

test('sha256: FIPS 180-4 vectors', () => {
  assert.equal(sha256Hex(enc('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex(enc('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(sha256Hex(new Uint8Array(1000000).fill(0x61)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  assert.equal(sha256(enc('abc')).length, 32);
});

test('sha256: every padding boundary agrees with node:crypto', () => {
  for (const n of [0, 1, 20, 54, 55, 56, 57, 63, 64, 65, 100, 119, 120, 128, 255, 1000]) {
    const m = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) & 0xff);
    assert.equal(sha256Hex(m), createHash('sha256').update(m).digest('hex'), `length ${n}`);
  }
});

test('commitment: first 16 bytes of SHA-256(packed fleet ‖ salt); salt-sensitive; no SubtleCrypto needed', () => {
  const fleet = [
    { col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false },
    { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false },
  ];
  const salt = Uint8Array.from({ length: 16 }, (_, i) => (255 - i * 13) & 0xff);
  const c = commitment(fleet, salt);
  assert.equal(c.length, COMMIT_LEN);
  const packed = packFleet(fleet);
  const msg = new Uint8Array([...packed, ...salt]);
  assert.equal(Buffer.from(c).toString('hex'), createHash('sha256').update(msg).digest('hex').slice(0, 32));
  const salt2 = salt.slice(); salt2[15] ^= 1;
  assert.notDeepEqual(Array.from(commitment(fleet, salt2)), Array.from(c), 'one salt bit changes the commitment');
  const moved = fleet.map((s, i) => (i === 2 ? { ...s, row: 6 } : s));
  assert.notDeepEqual(Array.from(commitment(moved, salt)), Array.from(c), 'moving a ship changes the commitment');
  assert.throws(() => commitment(fleet, new Uint8Array(8)), /16 bytes/);
});
