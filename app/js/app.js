// Modem Warfare — app controller (Tuesday: the game is playable end to end).
//
// Screens are hash-routed. The match flow:
//   Home → Placement (LOCK fixes salt + commitment) → Handshake (Salute:
//   session + commitment both ways, host sends the wager) → Round loop
//   (TARGET pick 3 → EXCHANGE over the Lamp → REVEAL staggered) … until one
//   fleet is fully sunk → Game over (reveal exchange, audit, stamp).
//
// One decode entry point (injectText) feeds the FrameGate, whatever carried
// the text: camera, typed, or the dev harness's BroadcastChannel. The gate
// decides accepted / duplicate / rejected; only an accepted frame touches
// state, so a failed decode or a re-scan can never fork the match.
import {
  TYPE, SALVO_SIZE, SHIP_SIZES, BOARD, cellIndex, cellLabel, frameToText, textToFrame,
  randomSession, FrameGate, describeFrame, hex, normaliseWager, fleetIsValid,
} from './frame.js';
import { randomFleet, rotateShip, fleetCellMap, newSalt, commitment, shipCells } from './fleet.js';
import { auditReveal, stampFor, VERDICT } from './audit.js';
import { qrSvg } from './qr.js';
import { Scanner } from './scanner.js';
import * as sfx from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const params = new URLSearchParams(location.search);
const DEV_INSTANCE = params.get('dev');
const REVEAL_STEP_MS = 250;

// ------------------------------------------------------------- state ---

function freshState() {
  return {
    role: null,            // 'host' | 'guest'
    session: null,
    round: 0,
    fleet: null,
    salt: null,
    commit: null,
    locked: false,
    wager: '',             // the stake note shown on both phones
    wagerConfirmed: false, // the other phone echoed it back
    sunk: [false, false, false, false],      // my ships, by my own count
    enemySunk: [false, false, false, false], // their ships, as they report them
    picks: [],             // my 3 target indices this round
    fired: false,          // picks are frozen once the salvo frame has shown
    shotsAtMe: new Map(),  // index -> 'hit' | 'miss'  (their shells on my fleet)
    shotsByMe: new Map(),  // index -> 'hit' | 'miss' | 'pending'
    incoming: null,        // their accepted SALVO frame this round
    history: [],           // one record per completed round (see finishRound)
    revealedRound: 0,      // last round whose reveal has played
    revealDone: false,
    outcome: null,         // { result: 'win'|'loss'|'draw'|'forfeit', finalRound }
    peerHandshake: null,
    peerReveal: null,
    audit: null,           // auditReveal() result, or { verdict: 'FORFEIT' }
    prevLamp: null,        // the previous step's frame, for RESEND LAST
    outgoing: { text: null, frame: null },
    lastRejection: null,
    gate: new FrameGate(),
    phase: 'target',
    mode: 'lamp',
    events: [],
    cacheStatus: null,
  };
}

const state = freshState();
const scanners = new Map();
let wakeLock = null;
let forfeitArmedAt = 0;

// ------------------------------------------------------------ router ---

const ROUTES = ['home', 'placement', 'handshake', 'round', 'gameover', 'sealed'];
const TITLES = { home: 'MODEM WARFARE', placement: 'PLACEMENT', handshake: 'HANDSHAKE', round: 'ROUND LOOP', gameover: 'GAME OVER', sealed: 'SEALED ORDERS' };

function routeFromHash() {
  const r = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(r) ? r : 'home';
}

function go(route) {
  if (!ROUTES.includes(route)) route = 'home';
  if (routeFromHash() !== route) location.hash = '#/' + route;
  else showRoute(route);
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
  if (route === 'handshake' || route === 'round' || route === 'gameover') requestWakeLock(); else releaseWakeLock();
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* iOS has none */ }
}

const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function wagerText() {
  return state.wager ? `WAGER · ${state.wager}` : 'NO WAGER';
}

function renderWagerStrips() {
  for (const id of ['#wager-round', '#wager-gameover']) {
    const el = $(id);
    el.textContent = wagerText();
    el.dataset.state = state.wager ? 'set' : 'none';
  }
}

// ------------------------------------------------------------- boards ---

/**
 * renderBoard(el, { fleet, marks, picks, sunkShips, onCell })
 *   fleet      ships to draw (my own, or the enemy's once revealed)
 *   marks      Map index -> 'hit' | 'miss' | 'pending'
 *   sunkShips  [bool×4] in fleet order: whole ship drawn as wreck
 */
function renderBoard(el, { fleet = null, marks = new Map(), onCell = null, picks = [], sunkShips = [] } = {}) {
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
        if (sunkShips[ship.shipIndex]) cell.classList.add('cell--sunk');
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

function renderOwnBoard(el) {
  renderBoard(el, { fleet: state.fleet || [], marks: state.shotsAtMe, sunkShips: state.sunk });
}

// ---------------------------------------------------------- placement ---

function renderPlacement() {
  if (!state.fleet) state.fleet = randomFleet();
  renderBoard($('#board-placement'), {
    fleet: state.fleet,
    onCell: (idx, cell) => {
      if (cell.dataset.ship === undefined || state.locked) return;
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
  $('#placement-hint').textContent = state.role === 'guest'
    ? 'LOCK SEALS YOUR FLEET · THEN SCAN THE HOST'
    : 'LOCK SEALS YOUR FLEET · THE COMMITMENT IS FIXED HERE, BEFORE ANY SALUTE';
}

function lockFleet() {
  if (!state.fleet || !fleetIsValid(state.fleet)) { toast('FLEET INVALID — REROLL'); return; }
  state.salt = newSalt();
  state.commit = commitment(state.fleet, state.salt);
  state.locked = true;
  state.sunk = [false, false, false, false];
  state.shotsAtMe.clear();
  state.shotsByMe.clear();
  dispatch('mw:locked', { fleet: state.fleet, commit: hex(state.commit) });
  go('handshake');
}

// ---------------------------------------------------------- handshake ---

function myHandshakeFrame() {
  return { type: TYPE.HANDSHAKE, session: state.session, round: 0, commit: state.commit };
}

function myWagerFrame() {
  return { type: TYPE.WAGER, session: state.session, round: 0, wager: state.wager };
}

function renderLamp(qrEl, captionEl, frame, caption) {
  const text = frameToText(frame);
  const changed = qrEl.dataset.text !== text;
  const { svg, version } = qrSvg(text);
  qrEl.innerHTML = svg;
  qrEl.dataset.text = text;
  captionEl.textContent = `${caption} · QR v${version}-M · ${text}`;
  state.outgoing = { text, frame, caption };
  if (changed) sfx.lamp();
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
  } else if (state.wager && (state.role === 'host' || state.wagerConfirmed)) {
    // The wager frame replaces the handshake frame on the lamp once the
    // handshake has crossed (host) or once the note has been received (guest).
    renderLamp(qrEl, cap, myWagerFrame(), 'WAGER · ROUND 0');
    hint.textContent = 'WAGER ON THE LAMP · HOLD UNTIL THE OTHER PHONE SHOWS IT';
  } else {
    renderLamp(qrEl, cap, myHandshakeFrame(), 'HANDSHAKE · ROUND 0');
    hint.textContent = 'RAISE PHONES FACE TO FACE · 20 CM';
  }
  renderHandshakeStatus();
}

/** Status half of the handshake screen: never renders the lamp, so a
 *  duplicate scan can update the contact line without re-posting a frame. */
function renderHandshakeStatus() {
  $('#commit-line').textContent = state.commit
    ? `MY COMMITMENT · ${hex(state.commit)} · FIXED AT LOCK`
    : 'COMMITMENT — LOCK A FLEET FIRST';
  const contact = $('#contact-handshake');
  if (state.peerHandshake) {
    contact.dataset.state = 'contact';
    contact.textContent = `CONTACT ✓ SESSION ${sessionHex()} · THEIR COMMIT ${hex(state.peerHandshake.commit).slice(0, 8)}…`;
    $('#btn-begin-round').disabled = false;
  } else {
    contact.dataset.state = 'waiting';
    contact.textContent = 'WAITING FOR CONTACT…';
    $('#btn-begin-round').disabled = true;
  }
  // Wager: the host types and sends after contact; the guest sees it land.
  const input = $('#wager-input');
  const isHost = state.role === 'host';
  input.disabled = !isHost;
  $('#btn-wager').disabled = !(isHost && state.peerHandshake);
  $('#wager-role-hint').textContent = isHost
    ? '· TYPE IT, SEND AFTER CONTACT · SHOWN ON BOTH PHONES ALL MATCH'
    : '· THE HOST SENDS IT · AGREE OUT LOUD · SHOWN ON BOTH PHONES ALL MATCH';
  const shown = $('#wager-shown');
  if (!state.wager) { shown.dataset.state = 'none'; shown.textContent = 'NO WAGER YET'; }
  else if (state.wagerConfirmed) { shown.dataset.state = 'confirmed'; shown.textContent = `${state.wager} ✓ ON BOTH PHONES`; }
  else { shown.dataset.state = 'set'; shown.textContent = isHost ? `${state.wager} · WAITING FOR THEIR PHONE` : state.wager; }
  updateTopbar();
}

function sendWager() {
  if (state.role !== 'host' || !state.peerHandshake) return;
  const note = normaliseWager($('#wager-input').value);
  if (!note) { toast('TYPE A STAKE FIRST'); return; }
  state.wager = note;
  state.wagerConfirmed = false;
  $('#wager-input').value = note;
  dispatch('mw:wager', { wager: note, source: 'local' });
  renderHandshake();
}

function beginRound() {
  if (!state.peerHandshake) return;
  state.prevLamp = state.outgoing.frame ? { frame: state.outgoing.frame, caption: state.outgoing.caption } : null;
  state.round = 1;
  state.gate.expectRound(1);
  state.picks = [];
  state.fired = false;
  state.incoming = null;
  state.revealDone = false;
  state.phase = 'target';
  renderWagerStrips();
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
  state.sunk = state.fleet.map((ship) => shipCells(ship).every((c) => state.shotsAtMe.get(c.index) === 'hit'));
  return state.sunk;
}

function converged() {
  return !!(state.incoming && state.incoming.results);
}

function setPhase(phase) {
  state.phase = phase;
  for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t.dataset.phase === phase));
  for (const p of $$('.phase')) p.hidden = p.dataset.phasePanel !== phase;
  if (phase === 'target') renderTarget();
  if (phase === 'exchange') renderExchange();
  if (phase === 'reveal') renderReveal();
  dispatch('mw:phase', { phase, round: state.round });
}

function renderRound() {
  $('#round-title').textContent = `SALVO ${state.round}`;
  renderWagerStrips();
  renderTarget();
  setPhase(state.phase);
  updateTopbar();
}

function renderTarget() {
  renderBoard($('#board-enemy'), {
    marks: state.shotsByMe,
    picks: state.picks,
    onCell: (idx) => {
      if (state.fired) { toast('SALVO ALREADY FIRED THIS ROUND'); return; }
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
  $('#btn-fire').textContent = state.fired ? 'FIRED → EXCHANGE' : 'FIRE → EXCHANGE';
  $('#target-hint').textContent = state.fired ? 'SALVO FIRED · GO TO EXCHANGE' : 'PICK 3 TARGETS';
  renderOwnBoard($('#board-own-target'));
}

function fire() {
  if (state.picks.length !== SALVO_SIZE) return;
  state.fired = true;
  dispatch('mw:fire', { round: state.round, picks: state.picks.slice() });
  setPhase('exchange');
}

function renderExchange() {
  $('#lamp-round').hidden = state.mode !== 'lamp';
  $('#sonar-shell').hidden = state.mode !== 'sonar';
  for (const m of $$('.mode')) m.setAttribute('aria-pressed', String(m.dataset.mode === state.mode));
  const qrEl = $('#qr-round');
  const cap = $('#caption-round');
  if (state.fired) {
    renderLamp(qrEl, cap, mySalvoFrame(), `SALVO · ROUND ${state.round}${converged() ? ' · RESULTS IN' : ''}`);
  } else if (state.resending && state.prevLamp) {
    renderLamp(qrEl, cap, state.prevLamp.frame, `RESEND · ${state.prevLamp.caption}`);
  } else {
    qrEl.innerHTML = '';
    qrEl.dataset.text = '';
    cap.textContent = 'PICK 3 TARGETS AND FIRE FIRST';
  }
  $('#btn-resend').disabled = !state.prevLamp;
  $('#btn-reveal').disabled = !converged();
  renderContactState();
}

function resendLast() {
  if (!state.prevLamp) return;
  if (state.fired) {
    // Show the previous step for a few seconds, then come back to this round's frame.
    renderLamp($('#qr-round'), $('#caption-round'), state.prevLamp.frame, `RESEND · ${state.prevLamp.caption}`);
    clearTimeout(resendLast.t);
    resendLast.t = setTimeout(() => { if (routeFromHash() === 'round' && state.phase === 'exchange') renderExchange(); }, 6000);
  } else {
    state.resending = true;
    renderExchange();
  }
}

function renderContactState() {
  const route = routeFromHash();
  const el = route === 'handshake' ? $('#contact-handshake') : route === 'gameover' ? $('#contact-gameover') : $('#contact-round');
  const rej = state.lastRejection;
  if (rej && Date.now() - rej.at < 2500) {
    el.dataset.state = rej.reason === 'STALE_ROUND' ? 'stale' : 'rejected';
    el.textContent = rej.reason === 'STALE_ROUND' ? 'THEIR PHONE IS A STEP BEHIND · ASK FOR RESEND LAST'
      : rej.reason === 'FUTURE_ROUND' ? 'THEIR PHONE IS A STEP AHEAD · THEY CAN RESEND LAST'
        : `SAY AGAIN · ${rej.reason.replace(/_/g, ' ')}`;
    return;
  }
  if (route === 'gameover') {
    if (state.peerReveal) { el.dataset.state = 'contact'; el.textContent = 'REVEAL RECEIVED ✓ AUDIT COMPLETE'; }
    else { el.dataset.state = 'waiting'; el.textContent = 'WAITING FOR THEIR REVEAL…'; }
    return;
  }
  if (route === 'handshake') { renderHandshakeStatus(); return; }
  if (converged()) {
    el.dataset.state = 'contact';
    el.textContent = `CONTACT ✓ ROUND ${state.round} · HOLD UNTIL BOTH PHONES CHIME · THEN REVEAL`;
  } else if (state.incoming) {
    el.dataset.state = 'duplicate';
    el.textContent = 'THEIR SALVO IS IN · WAITING FOR THEIR RESULTS';
  } else {
    el.dataset.state = 'waiting';
    el.textContent = state.fired ? 'WAITING FOR CONTACT…' : 'FIRE FIRST';
  }
}

// -------------------------------------------------------------- reveal ---

function markCell(boardEl, idx, mark, extra) {
  const cell = boardEl.querySelector(`[data-cell="${idx}"]`);
  if (!cell) return;
  cell.classList.remove('cell--pending', 'cell--pick');
  cell.classList.add('cell--' + mark);
  if (extra && !reducedMotion()) cell.classList.add(extra);
}

function shakeBoard(boardEl) {
  if (reducedMotion()) return;
  boardEl.classList.remove('board--shake');
  void boardEl.offsetWidth; // restart the animation
  boardEl.classList.add('board--shake');
}

function showBanner(text, own = false) {
  const b = $('#banner');
  b.textContent = text;
  b.className = 'banner' + (own ? ' banner--own' : '');
  b.hidden = false;
}

function logLine(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'reveal__line ' + cls;
  d.textContent = text;
  $('#reveal-log').appendChild(d);
}

function renderReveal() {
  const log = $('#reveal-log');
  log.textContent = '';
  $('#banner').hidden = true;
  $('#btn-next-round').disabled = !state.revealDone;
  $('#btn-next-round').hidden = !!state.outcome;
  $('#btn-to-audit').hidden = !state.outcome;
  if (!converged()) {
    renderBoard($('#board-reveal-enemy'), { marks: state.shotsByMe, picks: state.picks });
    renderOwnBoard($('#board-reveal-own'));
    logLine(state.incoming ? 'Their salvo is in; waiting for their results of yours. Both phones must chime.' : 'No contact yet this round. Hold the Salute.', 'muted');
    return;
  }
  if (state.revealedRound === state.round) {
    // Already played: static view of the round.
    renderBoard($('#board-reveal-enemy'), { marks: state.shotsByMe });
    renderOwnBoard($('#board-reveal-own'));
    const rec = state.history[state.history.length - 1];
    if (rec) describeRound(rec).forEach((l) => logLine(l.text, l.cls));
    return;
  }
  playReveal();
}

function describeRound(rec) {
  const lines = [];
  rec.picks.forEach((idx, i) => { if (idx !== null) lines.push({ text: `My shell ${i + 1} → ${cellLabel(idx)} … ${rec.hits[i] ? 'HIT' : 'splash'}`, cls: rec.hits[i] ? 'reveal__line--hit' : '' }); });
  rec.enemySunkNow.forEach((s, i) => { if (s) lines.push({ text: `Enemy ${SHIP_SIZES[i]}-ship SUNK`, cls: 'reveal__line--sunk' }); });
  rec.theirSalvo.forEach((idx, i) => { if (idx !== null) lines.push({ text: `Incoming shell ${i + 1} → ${cellLabel(idx)} … ${rec.theirHits[i] ? 'HIT on my fleet' : 'splash'}`, cls: rec.theirHits[i] ? 'reveal__line--hit' : '' }); });
  rec.mySunkNow.forEach((s, i) => { if (s) lines.push({ text: `My ${SHIP_SIZES[i]}-ship SUNK`, cls: 'reveal__line--sunk' }); });
  return lines;
}

/** Record the round, then play it back: my shells first, then the incoming ones. */
async function playReveal() {
  const inc = state.incoming;
  const prev = state.history[state.history.length - 1];
  const prevEnemySunk = prev ? prev.enemySunk : [false, false, false, false];
  const prevMySunk = prev ? prev.mySunk : [false, false, false, false];
  const theirHits = resultsForOpponent().hits;
  const rec = {
    round: state.round,
    picks: state.picks.slice(),
    hits: inc.results.hits.slice(),
    enemySunk: inc.sunk.slice(),
    enemySunkNow: inc.sunk.map((s, i) => s && !prevEnemySunk[i]),
    theirSalvo: inc.salvo.slice(),
    theirHits,
    mySunk: state.sunk.slice(),
    mySunkNow: state.sunk.map((s, i) => s && !prevMySunk[i]),
  };
  state.history.push(rec);
  state.revealedRound = state.round;
  state.revealDone = false;
  dispatch('mw:round-record', { record: rec });

  // Boards start as they were before this round's shells.
  const enemyMarks = new Map(state.shotsByMe);
  for (const idx of rec.picks) enemyMarks.delete(idx);
  const ownMarks = new Map(state.shotsAtMe);
  for (const idx of rec.theirSalvo) if (idx !== null) ownMarks.delete(idx);
  const enemyBoard = $('#board-reveal-enemy');
  const ownBoard = $('#board-reveal-own');
  renderBoard(enemyBoard, { marks: enemyMarks, picks: rec.picks });
  renderBoard(ownBoard, { fleet: state.fleet, marks: ownMarks, sunkShips: prevMySunk });
  const round = state.round;
  const still = () => routeFromHash() === 'round' && state.phase === 'reveal' && state.round === round;

  // My shells on the enemy: splash / splash / HIT, 250 ms apart.
  for (let i = 0; i < rec.picks.length; i++) {
    const idx = rec.picks[i];
    if (idx === null) continue;
    if (!still()) return;
    sfx.whump();
    await sleep(90);
    if (rec.hits[i]) { sfx.hit(); vibrate([40, 30, 80]); markCell(enemyBoard, idx, 'hit', 'cell--burn'); shakeBoard(enemyBoard); }
    else { sfx.splash(); markCell(enemyBoard, idx, 'miss', 'cell--splash'); }
    logLine(`My shell ${i + 1} → ${cellLabel(idx)} … ${rec.hits[i] ? 'HIT' : 'splash'}`, rec.hits[i] ? 'reveal__line--hit' : '');
    await sleep(REVEAL_STEP_MS - 90);
  }
  if (rec.enemySunkNow.some(Boolean)) {
    if (!still()) return;
    sfx.sunk();
    vibrate([300]);
    const names = rec.enemySunkNow.map((s, i) => (s ? `${SHIP_SIZES[i]}-SHIP` : null)).filter(Boolean).join(' + ');
    showBanner(`SUNK · ENEMY ${names}`);
    rec.enemySunkNow.forEach((s, i) => { if (s) logLine(`Enemy ${SHIP_SIZES[i]}-ship SUNK`, 'reveal__line--sunk'); });
    await sleep(700);
  }
  await sleep(300);

  // Their shells on my fleet.
  for (let i = 0; i < rec.theirSalvo.length; i++) {
    const idx = rec.theirSalvo[i];
    if (idx === null) continue;
    if (!still()) return;
    sfx.whump();
    await sleep(90);
    if (rec.theirHits[i]) { sfx.hit(); vibrate([40, 30, 80]); markCell(ownBoard, idx, 'hit', 'cell--burn'); shakeBoard(ownBoard); }
    else { sfx.splash(); markCell(ownBoard, idx, 'miss', 'cell--splash'); }
    logLine(`Incoming shell ${i + 1} → ${cellLabel(idx)} … ${rec.theirHits[i] ? 'HIT on my fleet' : 'splash'}`, rec.theirHits[i] ? 'reveal__line--hit' : '');
    await sleep(REVEAL_STEP_MS - 90);
  }
  if (rec.mySunkNow.some(Boolean)) {
    if (!still()) return;
    sfx.sunk();
    vibrate([300]);
    const names = rec.mySunkNow.map((s, i) => (s ? `${SHIP_SIZES[i]}-SHIP` : null)).filter(Boolean).join(' + ');
    showBanner(`YOUR ${names} SUNK`, true);
    rec.mySunkNow.forEach((s, i) => {
      if (!s) return;
      logLine(`My ${SHIP_SIZES[i]}-ship SUNK`, 'reveal__line--sunk');
      for (const c of shipCells(state.fleet[i])) markCell(ownBoard, c.index, 'sunk', 'cell--flash');
    });
    await sleep(700);
  }
  if (!still()) return;
  finishRound(rec);
}

function finishRound(rec) {
  state.revealDone = true;
  const mineGone = state.sunk.every(Boolean);
  const theirsGone = state.enemySunk.every(Boolean);
  if (mineGone || theirsGone) {
    state.outcome = { result: mineGone && theirsGone ? 'draw' : theirsGone ? 'win' : 'loss', finalRound: state.round };
    // From here on only the REVEAL frame (round N+1) is expected; an early
    // one from the other phone is accepted and audited before we even arrive.
    state.gate.expectRound(state.round + 1);
    logLine(state.outcome.result === 'win' ? 'ENEMY FLEET DESTROYED — TO THE AUDIT' : state.outcome.result === 'loss' ? 'ALL HANDS LOST — TO THE AUDIT' : 'BOTH FLEETS LOST — TO THE AUDIT', 'reveal__line--sunk');
    $('#btn-next-round').hidden = true;
    $('#btn-to-audit').hidden = false;
    dispatch('mw:gameover', { outcome: state.outcome });
  } else {
    $('#btn-next-round').disabled = false;
  }
  dispatch('mw:reveal-done', { round: rec.round, outcome: state.outcome });
}

function nextRound() {
  if (!state.revealDone || state.outcome) return;
  state.prevLamp = { frame: mySalvoFrame(), caption: `SALVO · ROUND ${state.round}` };
  state.round += 1;
  state.gate.expectRound(state.round);
  for (const idx of state.picks) if (!state.shotsByMe.has(idx)) state.shotsByMe.set(idx, 'pending');
  state.picks = [];
  state.fired = false;
  state.resending = false;
  state.incoming = null;
  state.revealDone = false;
  state.phase = 'target';
  renderRound();
  dispatch('mw:round', { round: state.round });
}

// ----------------------------------------------------------- receive ---

/** The single entry point for decoded text, whatever carried it. */
function injectText(text, meta = {}) {
  const res = state.gate.accept(text);
  const detail = { status: res.status, reason: res.reason, text, meta, frame: res.frame ? describeFrame(res.frame) : null, round: res.frame ? res.frame.round : null };
  dispatch('mw:frame', detail);
  if (res.status === 'rejected') state.lastRejection = { reason: res.reason, at: Date.now() };
  if (res.status === 'accepted') {
    state.lastRejection = null;
    vibrate([25, 30, 25]);
    handleAccepted(res.frame);
  }
  const route = routeFromHash();
  if (route === 'handshake' || route === 'round' || route === 'gameover') renderContactState();
  return res;
}

function handleAccepted(frame) {
  if (frame.type === TYPE.HANDSHAKE) {
    state.peerHandshake = frame;
    if (state.session === null) {
      state.session = frame.session;
      state.role = state.role || 'guest';
    }
    sfx.contact();
    if (routeFromHash() === 'handshake') renderHandshake();
    return;
  }
  if (frame.type === TYPE.WAGER) {
    const mine = state.wager === frame.wager;
    state.wager = frame.wager;
    state.wagerConfirmed = true; // either their note landed here, or they echoed mine
    if (!mine) sfx.contact();
    dispatch('mw:wager', { wager: frame.wager, source: 'peer' });
    renderWagerStrips();
    if (routeFromHash() === 'handshake') renderHandshake(); // guest now echoes the note back
    return;
  }
  if (frame.type === TYPE.SALVO) {
    if (state.outcome || frame.round !== state.round) return; // nothing to do with it
    const wasConverged = converged();
    state.incoming = frame;
    const map = fleetCellMap(state.fleet || []);
    for (const idx of frame.salvo) if (idx !== null) state.shotsAtMe.set(idx, map.has(idx) ? 'hit' : 'miss');
    recomputeSunk();
    if (frame.results) {
      state.picks.forEach((idx, i) => state.shotsByMe.set(idx, frame.results.hits[i] ? 'hit' : 'miss'));
      state.enemySunk = frame.sunk.slice();
    }
    if (converged() && !wasConverged) sfx.contact();
    // Spec: re-render my frame with their results filled in once theirs is decoded.
    if (routeFromHash() === 'round') {
      if (state.phase === 'exchange') renderExchange();
      else if (state.phase === 'target') renderTarget();
      else if (state.phase === 'reveal') renderReveal();
    }
    return;
  }
  if (frame.type === TYPE.REVEAL) {
    state.peerReveal = frame;
    runAudit();
    if (routeFromHash() === 'gameover') renderGameOver();
  }
}

// ---------------------------------------------------------- game over ---

function auditRounds() {
  return state.history.map((r) => ({ round: r.round, picks: r.picks, hits: r.hits, sunk: r.enemySunk }));
}

function runAudit() {
  if (!state.peerReveal || !state.peerHandshake) return null;
  state.audit = auditReveal({ commit: state.peerHandshake.commit, fleet: state.peerReveal.fleet, salt: state.peerReveal.salt, rounds: auditRounds() });
  sfx.stamp();
  vibrate(state.audit.verdict === VERDICT.VERIFIED ? [60] : [80, 60, 80, 60, 200]);
  dispatch('mw:audit', { verdict: state.audit.verdict, findings: state.audit.findings, checked: state.audit.checked });
  return state.audit;
}

function myRevealFrame() {
  const finalRound = state.outcome ? state.outcome.finalRound : state.round;
  return { type: TYPE.REVEAL, session: state.session, round: finalRound + 1, fleet: state.fleet, salt: state.salt, sunk: state.sunk };
}

function renderGameOver() {
  const out = state.outcome;
  const title = $('#gameover-title');
  const outcomeEl = $('#outcome');
  if (!out) { title.textContent = 'GAME OVER'; outcomeEl.textContent = 'NO MATCH IN PROGRESS'; outcomeEl.dataset.result = ''; }
  else {
    title.textContent = out.result === 'win' ? 'VICTORY' : out.result === 'loss' ? 'DEFEAT' : 'DRAW';
    outcomeEl.dataset.result = out.result;
    const byForfeit = state.audit && state.audit.verdict === VERDICT.FORFEIT ? ' · BY FORFEIT' : '';
    outcomeEl.textContent = out.result === 'win' ? `ENEMY FLEET DESTROYED · ROUND ${out.finalRound}${byForfeit}`
      : out.result === 'loss' ? `ALL HANDS LOST · ROUND ${out.finalRound}` : `BOTH FLEETS LOST · ROUND ${out.finalRound}`;
  }
  renderWagerStrips();
  renderOwnBoard($('#board-final-own'));
  if (state.peerReveal) {
    renderBoard($('#board-final-enemy'), { fleet: state.peerReveal.fleet.map((s, i) => ({ ...s, size: SHIP_SIZES[i] })), marks: state.shotsByMe, sunkShips: state.enemySunk });
    $('#final-enemy-hint').textContent = 'ENEMY FLEET · REVEALED';
  } else {
    renderBoard($('#board-final-enemy'), { marks: state.shotsByMe });
    $('#final-enemy-hint').textContent = 'ENEMY FLEET · AWAITING REVEAL';
  }

  const stamp = stampFor(state.audit);
  const stampEl = $('#stamp');
  stampEl.className = 'stamp';
  stampEl.dataset.verdict = stamp.cls;
  $('#stamp-word').textContent = stamp.word;
  $('#stamp-sub').textContent = stamp.sub;

  const hitsByMe = Array.from(state.shotsByMe.values()).filter((v) => v === 'hit').length;
  const hitsOnMe = Array.from(state.shotsAtMe.values()).filter((v) => v === 'hit').length;
  const shotsByMe = Array.from(state.shotsByMe.values()).filter((v) => v !== 'pending').length;
  $('#tally').textContent = `ROUNDS ${state.history.length} · MY SHELLS ${hitsByMe}/${shotsByMe} HIT · ${state.enemySunk.filter(Boolean).length} ENEMY SUNK · THEIRS ${hitsOnMe}/${state.shotsAtMe.size} HIT · ${state.sunk.filter(Boolean).length} OF MINE SUNK`;

  const detail = $('#audit-detail');
  detail.textContent = '';
  if (state.audit && state.audit.verdict !== VERDICT.FORFEIT) {
    detail.hidden = false;
    const head = document.createElement('div');
    head.className = state.audit.verdict === VERDICT.VERIFIED ? 'good' : 'bad';
    head.textContent = `AUDIT: ${state.audit.checked} checks against the revealed fleet · commitment ${state.audit.recomputed && state.peerHandshake && hex(state.audit.recomputed) === hex(state.peerHandshake.commit) ? 'matches' : 'MISMATCH'} · ${state.audit.findings.length} finding${state.audit.findings.length === 1 ? '' : 's'}`;
    detail.appendChild(head);
    for (const f of state.audit.findings.slice(0, 6)) {
      const d = document.createElement('div');
      d.className = 'bad';
      d.textContent = `${f.round ? 'round ' + f.round + ' · ' : ''}${f.code.replace(/_/g, ' ')} — ${f.detail}`;
      detail.appendChild(d);
    }
  } else if (state.audit && state.audit.verdict === VERDICT.FORFEIT) {
    detail.hidden = false;
    const d = document.createElement('div');
    d.className = 'bad';
    d.textContent = 'The other phone never showed its reveal. Refusing to reveal is a forfeit.';
    detail.appendChild(d);
  } else detail.hidden = true;

  if (state.session !== null && state.fleet && state.salt) {
    renderLamp($('#qr-reveal'), $('#caption-reveal'), myRevealFrame(), `REVEAL · FLEET + SALT`);
  } else {
    $('#qr-reveal').innerHTML = '';
    $('#caption-reveal').textContent = 'NO FLEET TO REVEAL';
  }
  $('#btn-forfeit').hidden = !!state.peerReveal || !out || (state.audit && state.audit.verdict === VERDICT.FORFEIT);
  $('#btn-forfeit').textContent = 'NO REVEAL? CLAIM FORFEIT';
  $('#lamp-reveal').hidden = false;
  renderContactState();
  updateTopbar();
}

function claimForfeit() {
  if (state.peerReveal || !state.outcome) return;
  const now = Date.now();
  if (now - forfeitArmedAt > 4000) {
    forfeitArmedAt = now;
    $('#btn-forfeit').textContent = 'TAP AGAIN TO STAMP FORFEIT';
    toast('THEIR REVEAL NEVER CAME? TAP AGAIN');
    return;
  }
  forfeitArmedAt = 0;
  state.audit = { verdict: VERDICT.FORFEIT, findings: [], checked: 0, recomputed: null };
  state.outcome = { ...state.outcome, result: 'win' };
  sfx.stamp();
  dispatch('mw:audit', { verdict: VERDICT.FORFEIT, findings: [], checked: 0 });
  renderGameOver();
}

function resetMatch({ keepRole = false } = {}) {
  const keep = { role: state.role, mode: state.mode, events: state.events, cacheStatus: state.cacheStatus, wagerDraft: state.wager };
  Object.assign(state, freshState());
  state.mode = keep.mode;
  state.events = keep.events;
  state.cacheStatus = keep.cacheStatus;
  if (keepRole) {
    state.role = keep.role;
    if (keep.role === 'host') {
      state.session = randomSession();
      state.gate = new FrameGate({ session: state.session });
    }
  }
  $('#wager-input').value = keep.wagerDraft || '';
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
    $('[data-action="scan-flip"]', block).addEventListener('click', async () => {
      try { const f = await sc.flip(); toast(f === 'user' ? 'FRONT CAMERA' : 'REAR CAMERA'); } catch (err) { toast(err.message.toUpperCase().slice(0, 40)); }
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

// -------------------------------------------------------------- wiring ---

function wire() {
  document.body.addEventListener('click', (e) => {
    sfx.unlock();
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
        if (!state.locked) { state.fleet = randomFleet(); renderPlacement(); }
        break;
      case 'lock':
        if (!state.locked) lockFleet(); else go('handshake');
        break;
      case 'begin-round':
        beginRound();
        break;
      case 'fire':
        fire();
        break;
      case 'resend-last':
        resendLast();
        break;
      case 'reveal':
        if (converged()) setPhase('reveal');
        break;
      case 'next-round':
        nextRound();
        break;
      case 'to-audit':
        if (state.outcome) go('gameover');
        break;
      case 'claim-forfeit':
        claimForfeit();
        break;
      case 'rematch':
        resetMatch({ keepRole: true });
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
  $('#wager-form').addEventListener('submit', (e) => { e.preventDefault(); sendWager(); });
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
  setPicks: (labels) => {
    if (state.fired) return false;
    state.picks = labels.map((l) => (typeof l === 'number' ? l : parseLabel(l)));
    if (routeFromHash() === 'round') renderRound();
    return true;
  },
  setFleet: (fleet) => {
    if (state.locked) return false;
    const f = fleet.map((s, i) => ({ size: SHIP_SIZES[i], col: s.col, row: s.row, horizontal: !!s.horizontal }));
    if (!fleetIsValid(f)) throw new Error('setFleet: invalid fleet');
    state.fleet = f;
    if (routeFromHash() === 'placement') renderPlacement();
    return true;
  },
  setWager: (text) => { $('#wager-input').value = text; sendWager(); return state.wager; },
  converged,
  auditRounds,
  devTamper: null, // dev channel hook: (text) => text, applied to outgoing frames only
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
