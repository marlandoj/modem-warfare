// Modem Warfare — app shell controller (Monday scope).
//
// Six navigable screens, hash routed. Real pieces on Monday: fleet placement
// (random, reroll, rotate), the handshake frame, the salvo frame with
// piggybacked results, the receive gate, the camera scanner and the
// offline-ready badge driven by the service worker's actual cache contents.
// Everything else (staggered reveal, audit stamp, Sealed Orders, Sonar) is a
// shell that says so on screen.
import {
  TYPE, SALVO_SIZE, SHIP_SIZES, BOARD, cellIndex, cellLabel, frameToText, textToFrame,
  randomSession, FrameGate, describeFrame, hex,
} from './frame.js';
import { randomFleet, rotateShip, fleetCellMap, newSalt, commitment, shipCells } from './fleet.js';
import { qrSvg } from './qr.js';
import { Scanner } from './scanner.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const params = new URLSearchParams(location.search);
const DEV_INSTANCE = params.get('dev');

// ------------------------------------------------------------- state ---

const state = {
  role: null,            // 'host' | 'guest'
  session: null,
  round: 0,
  fleet: null,
  salt: null,
  commit: null,
  sunk: [false, false, false, false],
  picks: [],             // my 3 target indices this round
  shotsAtMe: new Map(),  // index -> 'hit' | 'miss' (what the opponent has fired at me)
  shotsByMe: new Map(),  // index -> 'hit' | 'miss' | 'pending'
  incoming: null,        // opponent's accepted frame this round
  peerHandshake: null,
  outgoing: { text: null, frame: null },
  gate: new FrameGate(),
  phase: 'target',
  mode: 'lamp',
  events: [],
};

const scanners = new Map();
let wakeLock = null;

// ------------------------------------------------------------ router ---

const ROUTES = ['home', 'placement', 'handshake', 'round', 'gameover', 'sealed'];
const TITLES = { home: 'MODEM WARFARE', placement: 'PLACEMENT', handshake: 'HANDSHAKE', round: 'ROUND LOOP', gameover: 'GAME OVER', sealed: 'SEALED ORDERS' };

function routeFromHash() {
  const r = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(r) ? r : 'home';
}

function go(route) {
  if (!ROUTES.includes(route)) route = 'home';
  if (routeFromHash() !== route) {
    location.hash = '#/' + route;
  } else {
    showRoute(route);
  }
}

function showRoute(route) {
  for (const s of $$('.screen')) s.hidden = s.dataset.route !== route;
  document.body.dataset.screen = route;
  $('#topbar-title').textContent = TITLES[route];
  $('#nav-back').hidden = route === 'home';
  for (const [key, sc] of scanners) if (!key.startsWith(route)) sc.stop();
  if (route === 'handshake') renderHandshake();
  if (route === 'round') renderRound();
  if (route === 'placement') renderPlacement();
  if (route === 'gameover') renderGameOver();
  if (route === 'handshake' || route === 'round') requestWakeLock(); else releaseWakeLock();
  window.scrollTo(0, 0);
  dispatch('mw:route', { route });
}

window.addEventListener('hashchange', () => showRoute(routeFromHash()));

// ------------------------------------------------------------ helpers ---

function dispatch(name, detail) {
  state.events.push({ name, at: Date.now(), ...detail });
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

function sessionHex() {
  return state.session === null ? '' : state.session.toString(16).padStart(8, '0');
}

function updateTopbar() {
  const label = DEV_INSTANCE ? `${DEV_INSTANCE} · ` : '';
  $('#topbar-session').textContent = state.session === null ? label.trim().replace(/·$/, '') : `${label}s:${sessionHex()}`;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not fatal: the lamp still shows */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ------------------------------------------------------------- boards ---

function renderBoard(el, { fleet = null, marks = new Map(), onCell = null, picks = [] } = {}) {
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const corner = document.createElement('div');
  corner.className = 'board__label';
  frag.appendChild(corner);
  for (let c = 0; c < BOARD; c++) {
    const l = document.createElement('div');
    l.className = 'board__label';
    l.textContent = String.fromCharCode(65 + c);
    frag.appendChild(l);
  }
  const shipMap = fleet ? fleetCellMap(fleet) : new Map();
  for (let r = 0; r < BOARD; r++) {
    const l = document.createElement('div');
    l.className = 'board__label';
    l.textContent = String(r + 1);
    frag.appendChild(l);
    for (let c = 0; c < BOARD; c++) {
      const idx = cellIndex(c, r);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.cell = idx;
      cell.setAttribute('aria-label', cellLabel(idx));
      const ship = shipMap.get(idx);
      if (ship) {
        cell.classList.add('cell--ship');
        if (ship.bow) cell.classList.add(ship.horizontal ? 'cell--bow-h' : 'cell--bow-v');
        if (ship.stern) cell.classList.add(ship.horizontal ? 'cell--stern-h' : 'cell--stern-v');
        cell.dataset.ship = ship.shipIndex;
      }
      const mark = marks.get(idx);
      if (mark) cell.classList.add('cell--' + mark);
      if (picks.includes(idx)) cell.classList.add('cell--pick');
      if (onCell) cell.addEventListener('click', () => onCell(idx, cell));
      frag.appendChild(cell);
    }
  }
  el.appendChild(frag);
}

// ---------------------------------------------------------- placement ---

function renderPlacement() {
  if (!state.fleet) state.fleet = randomFleet();
  renderBoard($('#board-placement'), {
    fleet: state.fleet,
    onCell: (idx, cell) => {
      if (cell.dataset.ship === undefined) return;
      const rotated = rotateShip(state.fleet, Number(cell.dataset.ship));
      if (!rotated) {
        cell.classList.add('cell--shake');
        setTimeout(() => cell.classList.remove('cell--shake'), 200);
        toast('NO ROOM TO ROTATE');
        return;
      }
      state.fleet = rotated;
      renderPlacement();
    },
  });
}

async function lockFleet() {
  state.salt = newSalt();
  state.commit = await commitment(state.fleet, state.salt);
  state.sunk = [false, false, false, false];
  state.shotsAtMe.clear();
  state.shotsByMe.clear();
  dispatch('mw:locked', { fleet: state.fleet });
  go('handshake');
}

// ---------------------------------------------------------- handshake ---

function myHandshakeFrame() {
  return { type: TYPE.HANDSHAKE, session: state.session, round: 0, commit: state.commit };
}

function renderLamp(qrEl, captionEl, frame, caption) {
  const text = frameToText(frame);
  const { svg, version } = qrSvg(text);
  qrEl.innerHTML = svg;
  qrEl.dataset.text = text;
  captionEl.textContent = `${caption} · QR v${version}-M · ${text}`;
  state.outgoing = { text, frame };
  dispatch('mw:render', { text, frame, caption });
  return text;
}

function renderHandshake() {
  const qrEl = $('#qr-handshake');
  const cap = $('#caption-handshake');
  const hint = $('#handshake-hint');
  if (state.session === null) {
    qrEl.innerHTML = '';
    qrEl.dataset.text = '';
    cap.textContent = 'SCAN THE HOST FIRST — YOUR FRAME RENDERS ONCE THE SESSION IS KNOWN';
    hint.textContent = 'GUEST · SCAN THE HOST’S CODE';
  } else {
    renderLamp(qrEl, cap, myHandshakeFrame(), 'HANDSHAKE · ROUND 0');
    hint.textContent = 'RAISE PHONES FACE TO FACE · 20 CM';
  }
  const contact = $('#contact-handshake');
  if (state.peerHandshake) {
    contact.dataset.state = 'contact';
    contact.textContent = `CONTACT ✓ SESSION ${sessionHex()} · COMMIT ${hex(state.peerHandshake.commit).slice(0, 8)}…`;
    $('#btn-begin-round').disabled = false;
  } else {
    contact.dataset.state = 'waiting';
    contact.textContent = 'WAITING FOR CONTACT…';
    $('#btn-begin-round').disabled = true;
  }
  updateTopbar();
}

function beginRound() {
  state.round = 1;
  state.gate.expectRound(1);
  state.picks = [];
  state.incoming = null;
  state.phase = 'target';
  go('round');
}

// -------------------------------------------------------------- round ---

function resultsForOpponent() {
  // Results of the opponent's salvo this round, judged against my fleet.
  if (!state.incoming || state.incoming.type !== TYPE.SALVO) return null;
  const map = fleetCellMap(state.fleet);
  const hits = state.incoming.salvo.map((idx) => idx !== null && map.has(idx));
  return { present: true, hits };
}

function mySalvoFrame() {
  const salvo = [...state.picks];
  while (salvo.length < SALVO_SIZE) salvo.push(null);
  return { type: TYPE.SALVO, session: state.session, round: state.round, salvo, results: resultsForOpponent(), sunk: state.sunk };
}

function recomputeSunk() {
  const sunk = state.fleet.map((ship) => shipCells(ship).every((c) => state.shotsAtMe.get(c.index) === 'hit'));
  state.sunk = sunk;
  return sunk;
}

function setPhase(phase) {
  state.phase = phase;
  for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t.dataset.phase === phase));
  for (const p of $$('.phase')) p.hidden = p.dataset.phasePanel !== phase;
  if (phase === 'exchange') renderExchange();
  if (phase === 'reveal') renderReveal();
}

function renderRound() {
  $('#round-title').textContent = `SALVO ${state.round}`;
  renderTarget();
  setPhase(state.phase);
  updateTopbar();
}

function renderTarget() {
  renderBoard($('#board-enemy'), {
    marks: state.shotsByMe,
    picks: state.picks,
    onCell: (idx) => {
      if (state.shotsByMe.has(idx) && state.shotsByMe.get(idx) !== 'pending') return;
      const at = state.picks.indexOf(idx);
      if (at >= 0) state.picks.splice(at, 1);
      else if (state.picks.length < SALVO_SIZE) state.picks.push(idx);
      else { toast('THREE TARGETS MAX — TAP ONE TO CLEAR'); return; }
      renderTarget();
    },
  });
  const labels = [0, 1, 2].map((i) => (state.picks[i] !== undefined ? cellLabel(state.picks[i]) : '—'));
  $('#picks').textContent = labels.join(' ');
  $('#btn-fire').disabled = state.picks.length !== SALVO_SIZE;
}

function renderExchange() {
  $('#lamp-round').hidden = state.mode !== 'lamp';
  $('#sonar-shell').hidden = state.mode !== 'sonar';
  for (const m of $$('.mode')) m.setAttribute('aria-pressed', String(m.dataset.mode === state.mode));
  if (state.picks.length === SALVO_SIZE) {
    renderLamp($('#qr-round'), $('#caption-round'), mySalvoFrame(), `SALVO · ROUND ${state.round}`);
  } else {
    $('#qr-round').innerHTML = '';
    $('#caption-round').textContent = 'PICK 3 TARGETS FIRST';
  }
  renderContact($('#contact-round'), state.incoming ? { status: 'accepted', frame: state.incoming } : null);
}

function renderReveal() {
  const log = $('#reveal-log');
  log.textContent = '';
  const lines = [];
  const inc = state.incoming;
  if (!inc) lines.push({ text: 'No frame received this round.', cls: 'muted' });
  else {
    lines.push({ text: `RX ${describeFrame(inc)}` });
    inc.salvo.forEach((idx, i) => {
      if (idx === null) return;
      const hit = state.shotsAtMe.get(idx) === 'hit';
      lines.push({ text: `Incoming shell ${i + 1} → ${cellLabel(idx)} … ${hit ? 'HIT on my fleet' : 'splash'}`, cls: hit ? 'reveal__line--hit' : '' });
    });
    if (inc.results) {
      state.picks.forEach((idx, i) => {
        const hit = inc.results.hits[i];
        lines.push({ text: `My shell ${i + 1} → ${cellLabel(idx)} … ${hit ? 'HIT' : 'miss'}`, cls: hit ? 'reveal__line--hit' : '' });
      });
      inc.sunk.forEach((s, i) => { if (s) lines.push({ text: `Enemy ${SHIP_SIZES[i]}-ship reported SUNK`, cls: 'reveal__line--sunk' }); });
    } else {
      lines.push({ text: 'Opponent has not reported results for my salvo yet (their frame re-renders once they decode mine).', cls: 'muted' });
    }
  }
  for (const l of lines) {
    const d = document.createElement('div');
    d.className = 'reveal__line ' + (l.cls || '');
    d.textContent = l.text;
    log.appendChild(d);
  }
}

function nextRound() {
  state.round += 1;
  state.gate.expectRound(state.round);
  for (const idx of state.picks) if (!state.shotsByMe.has(idx)) state.shotsByMe.set(idx, 'pending');
  state.picks = [];
  state.incoming = null;
  state.phase = 'target';
  renderRound();
  dispatch('mw:round', { round: state.round });
}

// ----------------------------------------------------------- receive ---

function renderContact(el, res) {
  if (!res) { el.dataset.state = 'waiting'; el.textContent = 'WAITING FOR CONTACT…'; return; }
  if (res.status === 'accepted') {
    el.dataset.state = 'contact';
    el.textContent = `CONTACT ✓ ${res.frame.typeName} R${res.frame.round}`;
  } else if (res.status === 'duplicate') {
    el.dataset.state = 'duplicate';
    el.textContent = 'SAME FRAME AGAIN — ALREADY HAVE IT';
  } else {
    el.dataset.state = 'rejected';
    el.textContent = `SAY AGAIN · ${res.reason.replace(/_/g, ' ')}`;
  }
}

/** The single entry point for decoded text, whatever carried it. */
function injectText(text, meta = {}) {
  const res = state.gate.accept(text);
  const detail = { status: res.status, reason: res.reason, text, meta, frame: res.frame ? describeFrame(res.frame) : null, round: res.frame ? res.frame.round : null };
  dispatch('mw:frame', detail);
  const route = routeFromHash();
  const contactEl = route === 'handshake' ? $('#contact-handshake') : $('#contact-round');
  renderContact(contactEl, res);
  if (res.status === 'accepted') {
    vibrate([25, 30, 25]);
    handleAccepted(res.frame);
  } else if (res.status === 'rejected') {
    toast(`REJECTED · ${res.reason.replace(/_/g, ' ')}`);
  }
  return res;
}

function handleAccepted(frame) {
  if (frame.type === TYPE.HANDSHAKE) {
    state.peerHandshake = frame;
    if (state.session === null) {
      state.session = frame.session;
      state.role = state.role || 'guest';
    }
    if (routeFromHash() === 'handshake') renderHandshake();
    return;
  }
  if (frame.type === TYPE.SALVO) {
    state.incoming = frame;
    const map = fleetCellMap(state.fleet || []);
    for (const idx of frame.salvo) if (idx !== null) state.shotsAtMe.set(idx, map.has(idx) ? 'hit' : 'miss');
    recomputeSunk();
    if (frame.results) {
      state.picks.forEach((idx, i) => state.shotsByMe.set(idx, frame.results.hits[i] ? 'hit' : 'miss'));
    }
    // Spec: re-render my frame with the results filled in once theirs is decoded.
    if (routeFromHash() === 'round') { renderExchange(); if (state.phase === 'reveal') renderReveal(); }
    return;
  }
  if (frame.type === TYPE.REVEAL) {
    state.peerReveal = frame;
    toast('REVEAL RECEIVED — AUDIT LANDS TUESDAY');
  }
}

// ---------------------------------------------------------- scanners ---

function scannerFor(block) {
  const key = `${block.dataset.scan}`;
  if (scanners.has(key)) return scanners.get(key);
  const video = $('.scan__video', block);
  const status = $('[data-scan-status]', block);
  const sc = new Scanner(video, (text, meta) => injectText(text, { source: 'camera', ...meta }), {
    onStatus: (msg) => { status.textContent = msg; },
  });
  scanners.set(key, sc);
  return sc;
}

function wireScanBlocks() {
  for (const block of $$('.scan')) {
    const sc = scannerFor(block);
    $('[data-action="scan-toggle"]', block).addEventListener('click', async (e) => {
      if (sc.running) { sc.stop(); e.target.textContent = 'SCAN'; return; }
      try { await sc.start(); e.target.textContent = 'STOP'; } catch (err) { toast(err.message.toUpperCase().slice(0, 40)); }
    });
    const manual = $('[data-manual]', block);
    $('[data-action="manual-toggle"]', block).addEventListener('click', () => { manual.hidden = !manual.hidden; if (!manual.hidden) $('input', manual).focus(); });
    manual.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input', manual);
      const text = input.value.trim().toUpperCase();
      if (!text) return;
      injectText(text, { source: 'manual' });
      input.value = '';
    });
  }
}

// ---------------------------------------------------------- game over ---

function renderGameOver() {
  const marks = new Map(state.shotsAtMe);
  renderBoard($('#board-reveal'), { fleet: state.fleet || [], marks });
  const hits = Array.from(state.shotsAtMe.values()).filter((v) => v === 'hit').length;
  $('#tally').textContent = `${hits} OF 11 CELLS HIT ON MY FLEET · ${state.sunk.filter(Boolean).length} SUNK`;
}

function resetMatch({ keepSession = false } = {}) {
  state.round = 0;
  state.fleet = null;
  state.salt = null;
  state.commit = null;
  state.sunk = [false, false, false, false];
  state.picks = [];
  state.shotsAtMe.clear();
  state.shotsByMe.clear();
  state.incoming = null;
  state.peerHandshake = null;
  state.peerReveal = null;
  state.outgoing = { text: null, frame: null };
  if (!keepSession) { state.session = null; state.role = null; }
  state.gate = new FrameGate(keepSession && state.session !== null ? { session: state.session } : {});
  updateTopbar();
}

// ------------------------------------------------------ offline badge ---

async function offlineStatus() {
  const badge = $('#offline-badge');
  const text = $('#offline-badge-text');
  const set = (stateName, label) => { badge.dataset.state = stateName; text.textContent = label; document.body.classList.toggle('offline-ready', stateName === 'ready'); dispatch('mw:offline', { state: stateName, label }); };
  if (!('serviceWorker' in navigator)) { set('unsupported', 'NO SERVICE WORKER'); return; }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    const sw = reg.active || navigator.serviceWorker.controller;
    if (!sw) { set('partial', 'INSTALLING…'); return; }
    const status = await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => reject(new Error('no reply from service worker')), 8000);
      ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
      sw.postMessage({ type: 'CACHE_STATUS' }, [ch.port2]);
    });
    state.cacheStatus = status;
    if (status.missing.length === 0) set('ready', `OFFLINE READY ✓ ${status.cached}/${status.total} CACHED`);
    else set('partial', `CACHING ${status.cached}/${status.total}`);
    if (status.missing.length) setTimeout(offlineStatus, 2000);
  } catch (err) {
    set('missing', 'NOT CACHED · ' + err.message.toUpperCase().slice(0, 30));
  }
}

// -------------------------------------------------------------- wiring ---

function wire() {
  document.body.addEventListener('click', (e) => {
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) { go(goBtn.dataset.go); return; }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    switch (act.dataset.action) {
      case 'new-match':
        resetMatch();
        state.role = 'host';
        state.session = randomSession();
        state.gate = new FrameGate({ session: state.session });
        go('placement');
        break;
      case 'join-match':
        resetMatch();
        state.role = 'guest';
        go('placement');
        break;
      case 'reroll':
        state.fleet = randomFleet();
        renderPlacement();
        break;
      case 'lock':
        lockFleet();
        break;
      case 'begin-round':
        beginRound();
        break;
      case 'fire':
        setPhase('exchange');
        break;
      case 'next-round':
        nextRound();
        break;
      case 'rematch':
        resetMatch({ keepSession: false });
        state.role = 'host';
        state.session = randomSession();
        state.gate = new FrameGate({ session: state.session });
        go('placement');
        break;
      case 'next-challenger':
        resetMatch();
        go('home');
        break;
      default:
        break;
    }
  });
  for (const t of $$('.tab')) t.addEventListener('click', () => setPhase(t.dataset.phase));
  for (const m of $$('.mode')) m.addEventListener('click', () => { state.mode = m.dataset.mode; renderExchange(); });
  wireScanBlocks();
}

// Public surface for the dev harness, tests and the spike page.
window.MW = {
  state,
  go,
  injectText,
  currentText: () => state.outgoing.text,
  frameToText,
  textToFrame,
  describeFrame,
  setPicks: (labels) => { state.picks = labels.map((l) => (typeof l === 'number' ? l : parseLabel(l))); if (routeFromHash() === 'round') renderRound(); },
  devInstance: DEV_INSTANCE,
};

function parseLabel(l) {
  const col = l.toUpperCase().charCodeAt(0) - 65;
  const row = Number(l.slice(1)) - 1;
  return cellIndex(col, row);
}

wire();
updateTopbar();
showRoute(routeFromHash());
offlineStatus();

if (DEV_INSTANCE) {
  // Dev-only transport: BroadcastChannel in place of the camera. The module
  // lives outside app/ and is never precached, so it cannot ship by accident.
  import(new URL('../../dev/channel.js', import.meta.url).href)
    .then((m) => m.attach(window.MW, DEV_INSTANCE))
    .catch((err) => toast('DEV CHANNEL FAILED: ' + err.message.toUpperCase().slice(0, 30), 4000));
}
