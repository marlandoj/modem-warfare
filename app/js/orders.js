// Modem Warfare — Sealed Orders: the household card. Codec, limits, store.
//
// "Same channel, real job": one static QR carries a household note
// (label, a note of up to NOTE_MAX characters, a checklist of up to ITEMS_MAX
// short items, a hop count) from one phone to another. The receiving phone
// keeps the card in local storage. Nothing here touches a network.
//
// Honesty label (SPEC.md): "Local, not secret — anyone who can see the screen
// can read it." The card is plain text in a plain QR, and the app says so.
//
// Wire text: 'MWO1' + JSON. The prefix routes a scan to this module instead
// of the match FrameGate (a card has no session and no round). JSON keeps
// the payload printable and UTF-8 clean through any QR decoder.
//   { id, h: hop, l: label, n: note, i: [[done 0|1, text], ...] }
//
// Limits are refused, never truncated: validateCard() returns a message that
// names the field, the count and the limit; the UI shows it verbatim.
//
// Plain ES2020, no imports, no DOM: runs under node --test.

export const CARD_PREFIX = 'MWO1';
export const LABELS = Object.freeze(['KITCHEN', 'FRONT GATE', 'SITTER', 'SCHOOL RUN', 'PETS', 'GRANDMA', 'TRIP', 'WORKSHOP']);
export const NOTE_MAX = 700;
export const ITEMS_MAX = 8;
export const ITEM_MAX = 40;
export const HOP_MAX = 99;
/** JSON bytes the card may occupy: inside QR version 30 at EC-M (1370 bytes). */
export const CARD_MAX_BYTES = 1300;
export const CARD_QR_MAX_VERSION = 30;
export const STORE_KEY = 'mw.orders.v1';

export function utf8Length(s) {
  return new TextEncoder().encode(String(s)).length;
}

export function newCardId() {
  const b = new Uint8Array(4);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Normalise free text: unify newlines, trim ends; never shortens content. */
export function cleanNote(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

export function cleanItem(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Lines of a textarea -> checklist items (empty lines dropped, nothing truncated). */
export function itemsFromLines(text) {
  return String(text || '').split(/\r?\n/).map(cleanItem).filter(Boolean).map((t) => ({ text: t, done: false }));
}

/**
 * Validate a card. Returns null when it is fine, else a clear message.
 * Every check names the count and the limit; nothing is cut to fit.
 */
export function validateCard(card) {
  if (!card || typeof card !== 'object') return 'NOT A CARD';
  if (!LABELS.includes(card.label)) return 'PICK A LABEL';
  const note = typeof card.note === 'string' ? card.note : '';
  const items = Array.isArray(card.items) ? card.items : [];
  const noteLen = Array.from(note).length;
  if (noteLen > NOTE_MAX) return `NOTE TOO LONG · ${noteLen} OF ${NOTE_MAX} CHARACTERS · TRIM ${noteLen - NOTE_MAX}`;
  if (items.length > ITEMS_MAX) return `TOO MANY ITEMS · ${items.length} OF ${ITEMS_MAX} · DROP ${items.length - ITEMS_MAX}`;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it.text !== 'string' || !it.text.trim()) return `ITEM ${i + 1} IS EMPTY`;
    const len = Array.from(it.text).length;
    if (len > ITEM_MAX) return `ITEM ${i + 1} TOO LONG · ${len} OF ${ITEM_MAX} CHARACTERS · TRIM ${len - ITEM_MAX}`;
  }
  if (!note.trim() && items.length === 0) return 'WRITE A NOTE OR ADD AN ITEM';
  const hop = Number(card.hop);
  if (!Number.isInteger(hop) || hop < 1 || hop > HOP_MAX) return `HOP COUNT OUT OF RANGE · 1 TO ${HOP_MAX}`;
  if (!/^[0-9a-f]{8}$/.test(String(card.id || ''))) return 'CARD HAS NO ID';
  const bytes = utf8Length(cardToText({ ...card, note, items }, { unchecked: true }));
  if (bytes > CARD_MAX_BYTES) return `CARD TOO BIG FOR ONE QR · ${bytes} OF ${CARD_MAX_BYTES} BYTES · SHORTEN THE NOTE`;
  return null;
}

/** Build a fresh card from form values (hop 1, new id). Not validated here. */
export function composeCard({ label, note, items }) {
  return {
    id: newCardId(),
    hop: 1,
    label: String(label || '').toUpperCase(),
    note: cleanNote(note),
    items: (items || []).map((it) => (typeof it === 'string' ? { text: cleanItem(it), done: false } : { text: cleanItem(it.text), done: !!it.done })),
  };
}

export function cardToText(card, { unchecked = false } = {}) {
  if (!unchecked) {
    const bad = validateCard(card);
    if (bad) throw new Error(bad);
  }
  const body = { id: card.id, h: Number(card.hop), l: card.label, n: card.note, i: (card.items || []).map((it) => [it.done ? 1 : 0, it.text]) };
  return CARD_PREFIX + JSON.stringify(body);
}

export function isCardText(text) {
  return typeof text === 'string' && text.startsWith(CARD_PREFIX + '{');
}

/** Parse wire text into a validated card. Throws with a clear message. */
export function textToCard(text) {
  if (!isCardText(text)) throw new Error('NOT A SEALED ORDERS CARD');
  let body;
  try { body = JSON.parse(text.slice(CARD_PREFIX.length)); } catch { throw new Error('CARD UNREADABLE · SAY AGAIN'); }
  const card = {
    id: String(body.id || ''),
    hop: Number(body.h),
    label: String(body.l || ''),
    note: typeof body.n === 'string' ? body.n : '',
    items: Array.isArray(body.i) ? body.i.map((it) => ({ done: Array.isArray(it) && it[0] === 1, text: Array.isArray(it) ? String(it[1] || '') : String(it || '') })) : [],
  };
  const bad = validateCard(card);
  if (bad) throw new Error(bad);
  return card;
}

/** The card as it is handed on: same id, hop + 1. */
export function passOn(card) {
  const next = { ...card, hop: Number(card.hop) + 1, items: card.items.map((it) => ({ ...it })) };
  const bad = validateCard(next);
  if (bad) throw new Error(bad);
  return next;
}

export function cardSummary(card) {
  const done = card.items.filter((it) => it.done).length;
  const parts = [card.label, `HOP ${card.hop}`];
  if (card.items.length) parts.push(`${done}/${card.items.length} DONE`);
  return parts.join(' · ');
}

// ----------------------------------------------------------------- store ---
// localStorage (or any object with getItem/setItem/removeItem). Kept cards
// survive reloads; nothing leaves the phone.

export class CardStore {
  constructor(storage = globalThis.localStorage, key = STORE_KEY) {
    this.storage = storage;
    this.key = key || STORE_KEY;
  }

  _read() {
    try {
      const raw = this.storage ? this.storage.getItem(this.key) : null;
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  _write(list) {
    if (!this.storage) return false;
    try { this.storage.setItem(this.key, JSON.stringify(list)); return true; } catch { return false; }
  }

  list() {
    return this._read();
  }

  get(id) {
    return this._read().find((c) => c.id === id) || null;
  }

  /** Keep a card. A card already kept (same id) keeps its done marks; its hop
   *  becomes the higher of the two. Returns { card, status: 'kept'|'already' }. */
  keep(card, { from = 'scan' } = {}) {
    const bad = validateCard(card);
    if (bad) throw new Error(bad);
    const list = this._read();
    const at = list.findIndex((c) => c.id === card.id);
    if (at >= 0) {
      const have = list[at];
      have.hop = Math.max(Number(have.hop), Number(card.hop));
      have.updatedAt = Date.now();
      this._write(list);
      return { card: have, status: 'already' };
    }
    const kept = { ...card, items: card.items.map((it) => ({ ...it })), from, keptAt: Date.now(), updatedAt: Date.now() };
    list.unshift(kept);
    this._write(list);
    return { card: kept, status: 'kept' };
  }

  setDone(id, index, done) {
    const list = this._read();
    const card = list.find((c) => c.id === id);
    if (!card || !card.items[index]) return null;
    card.items[index].done = !!done;
    card.updatedAt = Date.now();
    this._write(list);
    return card;
  }

  /** Bump the hop count of a kept card (the card has been passed on). */
  bumpHop(id) {
    const list = this._read();
    const card = list.find((c) => c.id === id);
    if (!card) return null;
    const next = passOn(card);
    card.hop = next.hop;
    card.updatedAt = Date.now();
    this._write(list);
    return card;
  }

  remove(id) {
    const list = this._read();
    const next = list.filter((c) => c.id !== id);
    this._write(next);
    return next.length !== list.length;
  }

  clear() {
    this._write([]);
  }
}
