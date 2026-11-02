// Modem Warfare — Sealed Orders screen controller (Wednesday).
//
// Views inside the one screen: list (kept cards) · compose (label picker,
// note, checklist) · card (the card, its ONE static QR, mark-as-done, pass it
// on, print) · scan (scan-to-keep). The codec, limits and store live in
// orders.js; this file only moves DOM. Over-limit input is refused with the
// validator's message shown verbatim; nothing is ever truncated.
//
// Claims discipline: the only honesty label is "LOCAL, NOT SECRET". The
// words secure and encrypted do not appear in this screen's copy, and the
// shell gate asserts it.
import {
  LABELS, NOTE_MAX, ITEMS_MAX, CARD_QR_MAX_VERSION,
  composeCard, validateCard, cardToText, textToCard, itemsFromLines, cardSummary, utf8Length, CardStore,
} from './orders.js';
import { qrSvg } from './qr.js';

export function initOrders({ $, $$, toast, dispatch, vibrate, storeKey = undefined }) {
  const store = new CardStore(globalThis.localStorage, storeKey);
  const section = $('#screen-sealed');
  const ui = { view: 'list', current: null, lastError: null, lastRender: null };

  // Label picker.
  const select = $('#orders-label');
  select.textContent = '';
  for (const l of LABELS) {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    select.appendChild(o);
  }

  function showView(name) {
    ui.view = name;
    for (const v of $$('.orders-view', section)) v.hidden = v.dataset.ordersView !== name;
    if (name === 'list') renderList();
    if (name === 'compose') { hideError(); counters(); }
    if (name === 'scan') setContact('waiting', 'WAITING FOR A CARD…');
    dispatch('mw:orders-view', { view: name });
  }

  function setContact(state, text) {
    const el = $('#contact-sealed');
    el.dataset.state = state;
    el.textContent = text;
  }

  function showError(msg) {
    ui.lastError = msg;
    const el = $('#orders-error');
    el.textContent = msg;
    el.hidden = false;
    vibrate([30, 40, 30]);
    dispatch('mw:orders-refused', { message: msg });
  }

  function hideError() {
    ui.lastError = null;
    $('#orders-error').hidden = true;
  }

  function counters() {
    const noteLen = Array.from($('#orders-note').value.replace(/\r\n?/g, '\n')).length;
    const nc = $('#orders-note-count');
    nc.textContent = `${noteLen} / ${NOTE_MAX}`;
    nc.classList.toggle('over', noteLen > NOTE_MAX);
    const items = itemsFromLines($('#orders-items').value);
    const ic = $('#orders-items-count');
    ic.textContent = `${items.length} / ${ITEMS_MAX}`;
    ic.classList.toggle('over', items.length > ITEMS_MAX);
  }

  // ------------------------------------------------------------- list ---

  function renderList() {
    const list = store.list();
    const el = $('#orders-list');
    el.textContent = '';
    $('#orders-empty').hidden = list.length > 0;
    for (const card of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cardrow';
      b.dataset.cardId = card.id;
      const name = document.createElement('span');
      name.textContent = card.label;
      const meta = document.createElement('span');
      meta.className = 'cardrow__meta';
      meta.textContent = `${cardSummary(card).replace(card.label + ' · ', '')} · ${card.from === 'composed' ? 'written here' : 'scanned'}`;
      b.append(name, meta);
      b.addEventListener('click', () => open(card.id));
      el.appendChild(b);
    }
  }

  function open(id) {
    const card = store.get(id);
    if (!card) { toast('CARD NOT FOUND'); return false; }
    ui.current = card;
    renderCard(card);
    showView('card');
    return true;
  }

  // ------------------------------------------------------------- card ---

  function renderCard(card) {
    $('#card-label').textContent = card.label;
    $('#card-hop').textContent = `HOP ${card.hop}`;
    $('#card-note').textContent = card.note;
    const ul = $('#card-items');
    ul.textContent = '';
    card.items.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'card__item' + (it.done ? ' card__item--done' : '');
      const label = document.createElement('label');
      label.className = 'card__item';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!it.done;
      box.dataset.index = String(i);
      box.setAttribute('aria-label', `${it.text}, mark as done`);
      box.addEventListener('change', () => markDone(i, box.checked));
      const span = document.createElement('span');
      span.textContent = it.text;
      label.append(box, span);
      li.appendChild(label);
      ul.appendChild(li);
    });
    const text = cardToText(card);
    const { svg, version } = qrSvg(text, { minVersion: 5, maxVersion: CARD_QR_MAX_VERSION, mode: 'Byte' });
    const qrEl = $('#qr-card');
    qrEl.innerHTML = svg;
    qrEl.dataset.text = text;
    qrEl.dataset.cardId = card.id;
    qrEl.dataset.hop = String(card.hop);
    const bytes = utf8Length(text);
    $('#caption-card').textContent = `${card.label} · HOP ${card.hop} · QR v${version}-M · ${bytes} BYTES · ONE STATIC CODE`;
    ui.lastRender = { id: card.id, hop: card.hop, version, bytes, text };
    dispatch('mw:orders-render', { id: card.id, hop: card.hop, version, bytes, text });
    return text;
  }

  function markDone(index, done) {
    if (!ui.current) return;
    const card = store.setDone(ui.current.id, index, done);
    if (!card) return;
    ui.current = card;
    renderCard(card);
    dispatch('mw:orders-done', { id: card.id, index, done });
  }

  function passItOn() {
    if (!ui.current) return null;
    try {
      const card = store.bumpHop(ui.current.id);
      ui.current = card;
      renderCard(card);
      toast(`PASSING ON · HOP ${card.hop} · SHOW THIS CODE TO THE NEXT PHONE`, 2600);
      dispatch('mw:orders-pass', { id: card.id, hop: card.hop });
      return card;
    } catch (err) {
      toast(err.message.toUpperCase().slice(0, 40), 3000);
      return null;
    }
  }

  function removeCurrent() {
    if (!ui.current) return;
    if (removeCurrent.armed === ui.current.id) {
      store.remove(ui.current.id);
      removeCurrent.armed = null;
      ui.current = null;
      toast('CARD DELETED FROM THIS PHONE');
      showView('list');
      return;
    }
    removeCurrent.armed = ui.current.id;
    toast('TAP DELETE AGAIN TO REMOVE THIS CARD', 2600);
    setTimeout(() => { removeCurrent.armed = null; }, 4000);
  }

  // ---------------------------------------------------------- compose ---

  function compose() {
    hideError();
    const card = composeCard({ label: select.value, note: $('#orders-note').value, items: itemsFromLines($('#orders-items').value) });
    const bad = validateCard(card);
    if (bad) { showError(bad); return null; }
    const { card: kept } = store.keep(card, { from: 'composed' });
    ui.current = kept;
    renderCard(kept);
    showView('card');
    toast('CARD KEPT ON THIS PHONE · LOCAL, NOT SECRET', 2400);
    dispatch('mw:orders-composed', { id: kept.id, hop: kept.hop });
    return kept;
  }

  // ---------------------------------------------------------- receive ---

  /** A scanned (or typed, or dev-channel) card text: keep it and show it. */
  function receive(text, meta = {}) {
    let card;
    try { card = textToCard(text); } catch (err) {
      setContact('rejected', `SAY AGAIN · ${err.message}`);
      dispatch('mw:orders-received', { status: 'rejected', reason: err.message, meta });
      return { status: 'rejected', reason: err.message };
    }
    const { card: kept, status } = store.keep(card, { from: meta.source || 'scan' });
    ui.current = kept;
    setContact('contact', status === 'kept' ? `CARD KEPT ✓ ${cardSummary(kept)}` : `ALREADY KEPT ✓ ${cardSummary(kept)}`);
    vibrate([25, 30, 25]);
    renderCard(kept);
    showView('card');
    toast(status === 'kept' ? 'CARD KEPT ON THIS PHONE · LOCAL, NOT SECRET' : 'ALREADY KEPT · HOP COUNT UPDATED', 2400);
    dispatch('mw:orders-received', { status: 'accepted', reason: status, id: kept.id, hop: kept.hop, meta });
    return { status: 'accepted', reason: status, card: kept };
  }

  // ----------------------------------------------------------- wiring ---

  section.addEventListener('click', (e) => {
    const act = e.target.closest('[data-orders]');
    if (!act) return;
    switch (act.dataset.orders) {
      case 'list': showView('list'); break;
      case 'compose': showView('compose'); break;
      case 'scan': showView('scan'); break;
      case 'pass-on': passItOn(); break;
      case 'print': try { window.print(); } catch { toast('PRINT NOT AVAILABLE HERE'); } break;
      case 'delete': removeCurrent(); break;
      default: break;
    }
  });
  $('#orders-form').addEventListener('submit', (e) => { e.preventDefault(); compose(); });
  $('#orders-note').addEventListener('input', counters);
  $('#orders-items').addEventListener('input', counters);

  return {
    state: ui,
    store,
    show: () => showView('list'),
    view: showView,
    open,
    compose,
    receive,
    passItOn,
    render: () => (ui.current ? renderCard(ui.current) : null),
    parse: textToCard,
    limits: { NOTE_MAX, ITEMS_MAX },
  };
}
