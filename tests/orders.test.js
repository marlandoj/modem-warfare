// Sealed Orders codec, limits and store. Run: node --test tests/orders.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_PREFIX, LABELS, NOTE_MAX, ITEMS_MAX, ITEM_MAX, CARD_MAX_BYTES,
  composeCard, validateCard, cardToText, textToCard, isCardText, passOn,
  itemsFromLines, cardSummary, utf8Length, CardStore,
} from '../app/js/orders.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const base = () => composeCard({ label: 'KITCHEN', note: 'Bins go out Tuesday night.\nSpare key is with Jordan.', items: ['Feed the cat', 'Water the tomatoes', 'Lock the side gate'] });

test('compose -> text -> card round-trip keeps every field, hop 1, fresh id', () => {
  const card = base();
  assert.equal(card.hop, 1);
  assert.match(card.id, /^[0-9a-f]{8}$/);
  assert.equal(validateCard(card), null);
  const text = cardToText(card);
  assert.ok(text.startsWith(CARD_PREFIX + '{'), 'prefix routes the scan');
  assert.ok(isCardText(text));
  const back = textToCard(text);
  assert.deepEqual(back, { id: card.id, hop: 1, label: 'KITCHEN', note: card.note, items: card.items });
  console.log(`# card text (${utf8Length(text)} bytes): ${text.slice(0, 80)}…`);
});

test('UTF-8 survives the wire (accents, emoji)', () => {
  const card = composeCard({ label: 'GRANDMA', note: 'Café at 3 ☕ — bring the piñata 🎉', items: ['Señora Núñez · 555-0100'] });
  const back = textToCard(cardToText(card));
  assert.equal(back.note, card.note);
  assert.equal(back.items[0].text, 'Señora Núñez · 555-0100');
});

test('the longest card that is allowed still fits the QR byte budget', () => {
  const note = 'x'.repeat(NOTE_MAX);
  const items = Array.from({ length: ITEMS_MAX }, (_, i) => `item ${i + 1} `.padEnd(ITEM_MAX, 'y'));
  const card = composeCard({ label: 'SCHOOL RUN', note, items });
  assert.equal(validateCard(card), null);
  const bytes = utf8Length(cardToText(card));
  console.log(`# maximum card: ${bytes} bytes (budget ${CARD_MAX_BYTES})`);
  assert.ok(bytes <= CARD_MAX_BYTES);
});

test('over-limit note is refused with a message that names the count and limit (never truncated)', () => {
  const card = composeCard({ label: 'KITCHEN', note: 'n'.repeat(NOTE_MAX + 1), items: [] });
  const msg = validateCard(card);
  assert.equal(msg, `NOTE TOO LONG · ${NOTE_MAX + 1} OF ${NOTE_MAX} CHARACTERS · TRIM 1`);
  assert.equal(card.note.length, NOTE_MAX + 1, 'the note was not cut');
  assert.throws(() => cardToText(card), /NOTE TOO LONG/);
});

test('too many items and an over-long item are refused by name', () => {
  const nine = composeCard({ label: 'PETS', note: '', items: Array.from({ length: ITEMS_MAX + 1 }, (_, i) => `item ${i}`) });
  assert.equal(validateCard(nine), `TOO MANY ITEMS · ${ITEMS_MAX + 1} OF ${ITEMS_MAX} · DROP 1`);
  const long = composeCard({ label: 'PETS', note: '', items: ['ok', 'z'.repeat(ITEM_MAX + 3)] });
  assert.equal(validateCard(long), `ITEM 2 TOO LONG · ${ITEM_MAX + 3} OF ${ITEM_MAX} CHARACTERS · TRIM 3`);
});

test('empty card, unknown label and a bloated incoming card are refused', () => {
  assert.equal(validateCard(composeCard({ label: 'KITCHEN', note: '   ', items: [] })), 'WRITE A NOTE OR ADD AN ITEM');
  assert.equal(validateCard(composeCard({ label: 'BUNKER', note: 'x', items: [] })), 'PICK A LABEL');
  // 700 characters is the limit, but 700 emoji are 2800 bytes on the wire: too big for one QR, said plainly.
  const bloated = composeCard({ label: 'TRIP', note: '🎉'.repeat(NOTE_MAX), items: [] });
  assert.equal(Array.from(bloated.note).length, NOTE_MAX, 'inside the character limit');
  assert.match(validateCard(bloated) || '', /CARD TOO BIG FOR ONE QR · \d+ OF \d+ BYTES/);
  assert.throws(() => textToCard(CARD_PREFIX + JSON.stringify({ id: 'deadbeef', h: 1, l: 'KITCHEN', n: 'n'.repeat(NOTE_MAX + 5), i: [] })), /NOTE TOO LONG/);
  assert.throws(() => textToCard('CKQ3FQ6UAROLYLAAAB7A'), /NOT A SEALED ORDERS CARD/);
  assert.throws(() => textToCard(CARD_PREFIX + '{not json'), /CARD UNREADABLE/);
});

test('pass it on bumps the hop count and keeps the id', () => {
  const card = base();
  const next = passOn(card);
  assert.equal(next.hop, 2);
  assert.equal(next.id, card.id);
  assert.equal(textToCard(cardToText(next)).hop, 2);
  assert.equal(cardSummary(next), 'KITCHEN · HOP 2 · 0/3 DONE');
});

test('items from textarea lines: blank lines dropped, nothing shortened', () => {
  const items = itemsFromLines('  Feed the cat \n\n\nWater   the tomatoes\r\n');
  assert.deepEqual(items, [{ text: 'Feed the cat', done: false }, { text: 'Water the tomatoes', done: false }]);
});

test('store: keep, mark done, bump hop, persist across a fresh store on the same storage', () => {
  const storage = new MemoryStorage();
  const store = new CardStore(storage);
  const card = base();
  assert.equal(store.keep(card).status, 'kept');
  assert.equal(store.keep(card).status, 'already');
  assert.equal(store.list().length, 1);
  store.setDone(card.id, 1, true);
  const again = new CardStore(storage); // "reload"
  assert.equal(again.get(card.id).items[1].done, true);
  assert.equal(again.get(card.id).items[0].done, false);
  assert.equal(again.bumpHop(card.id).hop, 2);
  // A later scan of the same card at hop 3 raises the hop but keeps the done marks.
  const hop3 = { ...card, hop: 3 };
  assert.equal(again.keep(hop3).status, 'already');
  assert.equal(again.get(card.id).hop, 3);
  assert.equal(again.get(card.id).items[1].done, true);
  assert.ok(again.remove(card.id));
  assert.equal(again.list().length, 0);
});

test('the labels are a fixed picker and the limits are the published ones', () => {
  assert.ok(LABELS.length >= 6);
  assert.equal(NOTE_MAX, 700);
  assert.equal(ITEMS_MAX, 8);
});
