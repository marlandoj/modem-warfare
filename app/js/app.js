// Modem Warfare — app controller.
//
// Screens are hash-routed. The match flow:
//   Home (TRANSPORT setting, Thursday) → Placement (LOCK fixes salt +
//   commitment) → Handshake (the Salute: session + commitment both ways; the
//   host's transport rides its frame and the joiner adopts it) → Round loop
//   (TARGET pick 3 → EXCHANGE over the one configured carrier → REVEAL
//   staggered) … until one fleet is fully sunk → Game over (reveal exchange,
//   audit, stamp).
//
// One decode entry point (injectText) feeds the FrameGate, whatever carried
// the text: camera, typed, the Sonar's chirp decoder, or the dev harness's
// BroadcastChannel. The gate decides accepted / duplicate / rejected; only an
// accepted frame touches state, so a failed decode, a misheard chirp or a
// re-scan can never fork the match. routeText() sits in front of it as the
// one entry every carrier calls.
//
// Thursday (the playtest rulings):
//   1. The transport — CHIRP (default) or QR — is a pre-game setting on Home.
//      It is persisted per phone, the host's choice goes into the handshake
//      frame, the joining phone adopts it, and inside a match only the
//      configured carrier is presented: every Salute screen has two carrier
//      blocks ([data-transport="qr"] = lamp + scanner, [data-transport=
//      "chirp"] = the Sonar row) and syncCarriers() hides the other. No
//      scan-or-chirp choice exists anywhere in the match flow. The frame and
//      its audit stay the truth whichever carrier moved it.
//   2. There is no stake note. Nothing here, in the frames or in the audit
//      copy mentions one.
//   3. Match play never scrolls: body[data-match] makes the viewport the
//      screen, and --avail (the screen area's real height, kept by a
//      ResizeObserver) sizes the boards, the sweep and the lamp.
// Everything that makes sound hangs off config.SOUND (see config.js); with
// it off the chirp carrier leaves the document and the only transport is QR.
import { SOUND } from './config.js';
import {
  TYPE, SALVO_SIZE, SHIP_SIZES, BOARD, cellIndex, cellLabel, frameToText, textToFrame,
  randomSession, FrameGate, describeFrame, hex, fleetIsValid, TRANSPORT, DEFAULT_TRANSPORT,
} from './frame.js';
import { randomFleet, rotateShip, fleetCellMap, newSalt, commitment, shipCells } from './fleet.js';
import { auditReveal, stampFor, VERDICT } from './audit.js';
import { qrSvg } from './qr.js';
import { Scanner } from './scanner.js';
import * as sfx from './audio.js';
import { sonar } from './sonar.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const params = new URLSearchParams(location.search);
const DEV_INSTANCE = params.get('dev');
const TRANSPORT_KEY = DEV_INSTANCE ? `mw.transport.v1.dev-${DEV_INSTANCE}` : 'mw.transport.v1';

// The reveal's pacing (Thursday: tightened). Each shell: a whump, a short
// flight, then the impact; the next shell follows REVEAL_STEP_MS after the
// previous one began.
const REVEAL_STEP_MS = 260;
const REVEAL_FLIGHT_MS = 80;
const REVEAL_SUNK_HOLD_MS = 650;
const REVEAL_HALF_PAUSE_MS = 220;

const MATCH_ROUTES = ['placement', 'handshake', 'round', 'gameover'];

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
    prevLamp: null,        // the previous step's frame, for RESEND
    outgoing: { text: null, frame: null },
    lastRejection: null,
    gate: new FrameGate(),
    phase: 'target',
    events: [],
    cacheStatus: null,
    transport: DEFAULT_TRANSPORT, // 'chirp' | 'qr' — set on Home, carried by the handshake
    transportSource: 'default',   // 'default' | 'stored' | 'setting' | 'handshake' | 'forced'
  };
}

const state = freshState();
const scanners = new Map();
let wakeLock = null;
let forfeitArmedAt = 0;

// --------------------------------------------------------- transport ---
// The one carrier the match presents. Chirp unless the phone's setting says
// QR; QR, and nothing else, when the build has no sound.

function loadTransport() {
  let stored = null;
  try { stored = globalThis.localStorage ? localStorage.getItem(TRANSPORT_KEY) : null; } catch { /* storage may be unavailable */ }
  if (!SOUND) { state.transport = TRANSPORT.QR; state.transportSource = 'forced'; return; }
  if (stored === TRANSPORT.QR || stored === TRANSPORT.CHIRP) { state.transport = stored; state.transportSource = 'stored'; }
  else { state.transport = DEFAULT_TRANSPORT; state.transportSource = 'default'; }
}

/** The player's own setting (Home). Persisted; the next match starts from it. */
function setTransport(t, { source = 'setting', persist = true } = {}) {
  if (t !== TRANSPORT.QR && t !== TRANSPORT.CHIRP) return state.transport;
  if (t === TRANSPORT.CHIRP && !SOUND) { t = TRANSPORT.QR; source = 'forced'; }
  state.transport = t;
  state.transportSource = source;
  if (persist) { try { localStorage.setItem(TRANSPORT_KEY, t); } catch { /* fine */ } }
  syncCarriers();
  dispatch('mw:transport', { transport: t, source });
  return t;
}

/** The host's choice, read from its handshake: the joiner adopts it for this match. */
function adoptTransport(t) {
  if (t === state.transport) return;
  if (t === TRANSPORT.CHIRP && !SOUND) {
    setTransport(TRANSPORT.QR, { source: 'forced', persist: false });
    toast('THE HOST PLAYS BY CHIRP · THIS BUILD HAS NO SOUND · PLAYING BY QR', 3200);
    return;
  }
  setTransport(t, { source: 'handshake', persist: false });
  toast(`TRANSPORT · ${t.toUpperCase()} · SET BY THE HOST`, 2400);
}

/** Show the configured carrier on every Salute screen and hide the other. */
function syncCarriers() {
  const t = state.transport;
  document.body.dataset.transport = t;
  for (const el of $$('[data-transport]')) el.hidden = el.dataset.transport !== t;
  for (const b of $$('[data-transport-choice]')) b.setAttribute('aria-checked', String(b.dataset.transportChoice === t));
  const sub = $('#join-sub');
  if (sub) sub.textContent = t === TRANSPORT.CHIRP ? 'LISTEN' : 'SCAN';
  const hint = $('#transport-hint');
  if (hint) {
    hint.textContent = !SOUND ? 'THIS BUILD PLAYS BY QR · THE LAMP IS THE ONLY CARRIER'
      : t === TRANSPORT.CHIRP ? 'SET BEFORE THE MATCH · THE HOST\'S CHOICE RIDES THE HANDSHAKE · PHONES FLAT, SPEAKER TO MIC'
        : 'SET BEFORE THE MATCH · THE HOST\'S CHOICE RIDES THE HANDSHAKE · PHONES FACE TO FACE, 20 CM';
  }
  // The other carrier's machinery stops when it is not the one presented.
  if (t !== TRANSPORT.QR) for (const sc of scanners.values()) sc.stop();
  if (t !== TRANSPORT.CHIRP && SOUND && sonar.listening) { sonar.stop(); syncSonarUI(); }
}

// ------------------------------------------------------------ router ---

const ROUTES = ['home', 'placement', 'handshake', 'round', 'gameover'];
const TITLES = { home: 'MODEM WARFARE', placement: 'PLACEMENT', handshake: 'HANDSHAKE', round: 'ROUND LOOP', gameover: 'GAME OVER' };

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
  if (MATCH_ROUTES.includes(route)) document.body.dataset.match = '1'; else delete document.body.dataset.match;
  $('#topbar-title').textContent = TITLES[route];
  $('#nav-back').hidden = route === 'home';
  for (const [key, sc] of scanners) if (!key.startsWith(route)) sc.stop();
  if (SOUND && sonar.listening) { sonar.stop(); syncSonarUI(); } // the mic never stays open across screens
  for (const m of $$('[data-manual]')) m.hidden = true;
  syncCarriers();
  if (route === 'handshake') renderHandshake();
  if (route === 'round') renderRound();
  if (route === 'placement') renderPlacement();
  if (route === 'gameover') renderGameOver();
  if (route === 'handshake' || route === 'round' || route === 'gameover') requestWakeLock(); else releaseWakeLock();
  window.scrollTo(0, 0);
  measureAvail();
  dispatch('mw:route', { route });
  autoListen();
}

window.addEventListener('hashchange', () => showRoute(routeFromHash()));

// -------------------------------------------------------- the viewport ---
// --avail is the height the screen area really has (after the top bar and
// any safe-area inset). Every sized thing on a match screen is a share of it.

function measureAvail() {
  const el = $('#screens');
  if (!el) return;
  const h = el.clientHeight;
  if (h > 0) el.style.setProperty('--avail', `${h}px`);
}

if (globalThis.ResizeObserver) {
  new ResizeObserver(() => measureAvail()).observe($('#screens'));
} else {
  window.addEventListener('resize', measureAvail);
}

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

// ------------------------------------------------------------- boards ---

/**
 * renderBoard(el, { fleet, marks, picks, sunkShips, onCell })
 *   fleet      ships to draw (my own, or the enemy's once revealed)
 *   marks      Map index -> 'hit' | 'miss' | 'pending'
 *   sunkShips  [bool×4] in fleet order: whole ship drawn as a settled wreck
 */
function renderBoard(el, { fleet = null, marks = new Map(), onCell = null, picks = [], sunkShips = [] } = {}) {
  el.textContent = '';
  const frag = document.createDocumentFragment();
  const mini = el.classList.contains('board--mini');
  if (!mini) {
    const corner = document.createElement('div');
    corner.className = 'board__label';
    frag.appendChild(corner);
    for (let c = 0; c < BOARD; c++) {
      const l = document.createElement('div');
      l.className = 'board__label';
      l.textContent = String.fromCharCode(65 + c);
      frag.appendChild(l);
    }
  }
  const shipMap = fleet ? fleetCellMap(fleet) : new Map();
  for (let r = 0; r < BOARD; r++) {
    if (!mini) {
      const l = document.createElement('div');
      l.className = 'board__label';
      l.textContent = String(r + 1);
      frag.appendChild(l);
    }
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
        if (sunkShips[ship.shipIndex]) cell.classList.add('cell--sunk', 'cell--settled');
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

function renderOwnBoard(el, { sunkShips = state.sunk } = {}) {
  renderBoard(el, { fleet: state.fleet || [], marks: state.shotsAtMe, sunkShips });
}

/** The fleet strip: one line per ship, a block per cell, hit cells burning,
 *  a sunk ship dark. Compact enough to sit beside the mini board. */
function renderFleet(el, { sunkShips = state.sunk } = {}) {
  el.textContent = '';
  if (!state.fleet) return;
  state.fleet.forEach((ship, i) => {
    const line = document.createElement('div');
    line.className = 'fleet__ship' + (sunkShips[i] ? ' fleet__ship--sunk' : '');
    line.dataset.ship = i;
    const name = document.createElement('span');
    name.className = 'fleet__name';
    name.textContent = `${SHIP_SIZES[i]}-SHIP`;
    line.appendChild(name);
    let hits = 0;
    for (const c of shipCells(ship)) {
      const b = document.createElement('i');
      b.className = 'fleet__cell';
      b.dataset.cell = c.index;
      if (state.shotsAtMe.get(c.index) === 'hit') { b.classList.add('fleet__cell--hit'); hits += 1; }
      line.appendChild(b);
    }
    const st = document.createElement('span');
    st.className = 'fleet__state';
    st.textContent = sunkShips[i] ? 'SUNK' : hits ? `${hits}/${SHIP_SIZES[i]} HIT` : 'AFLOAT';
    line.appendChild(st);
    el.appendChild(line);
  });
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
    ? `LOCK SEALS YOUR FLEET · THEN ${state.transport === TRANSPORT.CHIRP ? 'LISTEN FOR' : 'SCAN'} THE HOST`
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
  return { type: TYPE.HANDSHAKE, session: state.session, round: 0, commit: state.commit, transport: state.transport };
}

/**
 * Put a frame on the configured carrier of a Salute screen (key = handshake
 * | round | gameover): the QR on the lamp, or the frame text on the Sonar
 * row. Either way it becomes state.outgoing and is announced as mw:render,
 * which is what CHIRP sends and what the dev transport carries.
 */
const LAMP_IDS = { handshake: ['qr-handshake', 'caption-handshake'], round: ['qr-round', 'caption-round'], gameover: ['qr-reveal', 'caption-reveal'] };

function renderFrame(key, frame, caption) {
  const text = frameToText(frame);
  const changed = state.outgoing.text !== text;
  state.outgoing = { text, frame, caption };
  const qrEl = $('#' + LAMP_IDS[key][0]);
  const cap = $('#' + LAMP_IDS[key][1]);
  if (state.transport === TRANSPORT.QR) {
    if (qrEl.dataset.text !== text) {
      const { svg, version } = qrSvg(text);
      qrEl.innerHTML = svg;
      qrEl.dataset.text = text;
      qrEl.dataset.version = String(version);
    }
    cap.textContent = `${caption} · QR v${qrEl.dataset.version}-M · ${text}`;
  } else {
    qrEl.innerHTML = '';
    qrEl.dataset.text = '';
    cap.textContent = '';
  }
  const block = $(`[data-sonar="${key}"]`);
  if (block) {
    const ft = $('[data-frame-text]', block);
    ft.textContent = `${caption} · ${text}`;
    ft.dataset.text = text;
  }
  if (changed) sfx.lamp();
  dispatch('mw:render', { text, frame, caption });
  return text;
}

/** Nothing to carry yet on this Salute screen: say why. */
function clearFrame(key, message) {
  const qrEl = $('#' + LAMP_IDS[key][0]);
  qrEl.innerHTML = '';
  qrEl.dataset.text = '';
  $('#' + LAMP_IDS[key][1]).textContent = message;
  const block = $(`[data-sonar="${key}"]`);
  if (block) { const ft = $('[data-frame-text]', block); ft.textContent = message; ft.dataset.text = ''; }
}

function renderHandshake() {
  const hint = $('#handshake-hint');
  const byChirp = state.transport === TRANSPORT.CHIRP;
  if (state.session === null) {
    clearFrame('handshake', byChirp ? 'LISTEN FOR THE HOST FIRST — YOUR FRAME RENDERS ONCE THE SESSION IS KNOWN' : 'SCAN THE HOST FIRST — YOUR FRAME RENDERS ONCE THE SESSION IS KNOWN');
    hint.textContent = byChirp ? 'GUEST · LISTEN · THE HOST CHIRPS FIRST' : 'GUEST · SCAN THE HOST’S CODE';
  } else {
    renderFrame('handshake', myHandshakeFrame(), 'HANDSHAKE · ROUND 0');
    hint.textContent = byChirp
      ? (state.role === 'host' ? 'PHONES FLAT · THE GUEST LISTENS · CHIRP · THEN YOU LISTEN' : 'PHONES FLAT · NOW CHIRP YOURS BACK')
      : 'RAISE PHONES FACE TO FACE · 20 CM';
  }
  renderHandshakeStatus();
}

/** Status half of the handshake screen: never renders the frame, so a
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
  updateTopbar();
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
  if (phase !== 'exchange') {
    const manual = $('#screen-round [data-manual]');
    if (manual) manual.hidden = true;
    for (const sc of scanners.values()) sc.stop();
    if (SOUND && sonar.listening) { sonar.stop(); syncSonarUI(); }
  }
  dispatch('mw:phase', { phase, round: state.round });
  autoListen();
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
  $('#btn-fire').textContent = state.fired ? 'FIRED →' : 'FIRE';
  $('#target-hint').textContent = state.fired ? 'SALVO FIRED · GO TO EXCHANGE' : 'PICK 3 TARGETS';
  renderOwnBoard($('#board-own-target'));
  renderFleet($('#fleet-target'));
}

function fire() {
  if (state.picks.length !== SALVO_SIZE) return;
  state.fired = true;
  sfx.fire();
  dispatch('mw:fire', { round: state.round, picks: state.picks.slice() });
  setPhase('exchange');
}

function renderExchange() {
  if (state.fired) {
    renderFrame('round', mySalvoFrame(), `SALVO · ROUND ${state.round}${converged() ? ' · RESULTS IN' : ''}`);
  } else if (state.resending && state.prevLamp) {
    renderFrame('round', state.prevLamp.frame, `RESEND · ${state.prevLamp.caption}`);
  } else {
    clearFrame('round', 'PICK 3 TARGETS AND FIRE FIRST');
  }
  $('#btn-resend').disabled = !state.prevLamp;
  $('#btn-reveal').disabled = !converged();
  renderContactState();
}

function resendLast() {
  if (!state.prevLamp) return;
  if (state.fired) {
    // Show the previous step for a few seconds, then come back to this round's frame.
    renderFrame('round', state.prevLamp.frame, `RESEND · ${state.prevLamp.caption}`);
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
    el.textContent = rej.reason === 'STALE_ROUND' ? 'THEIR PHONE IS A STEP BEHIND · ASK FOR RESEND'
      : rej.reason === 'FUTURE_ROUND' ? 'THEIR PHONE IS A STEP AHEAD · THEY CAN RESEND'
        : `SAY AGAIN · ${rej.reason.replace(/_/g, ' ')}`;
    return;
  }
  if (route === 'gameover') {
    if (state.peerReveal) { el.dataset.state = 'contact'; el.textContent = 'REVEAL RECEIVED ✓ AUDIT COMPLETE'; }
    else { el.dataset.state = 'waiting'; el.textContent = 'WAITING FOR THEIR REVEAL…'; }
    return;
  }
  if (route === 'handshake') { renderHandshakeStatus(); return; }
  const again = state.transport === TRANSPORT.CHIRP ? 'CHIRP AGAIN' : 'HOLD';
  if (converged()) {
    el.dataset.state = 'contact';
    el.textContent = `CONTACT ✓ ROUND ${state.round} · BOTH PHONES SHOW CONTACT · THEN REVEAL`;
  } else if (state.incoming) {
    el.dataset.state = 'duplicate';
    el.textContent = `THEIR SALVO IS IN · ${again} · WAITING FOR THEIR RESULTS`;
  } else {
    el.dataset.state = 'waiting';
    el.textContent = state.fired ? 'WAITING FOR CONTACT…' : 'FIRE FIRST';
  }
}

// -------------------------------------------------------------- reveal ---
// Thursday's theatre: a ring bursts from every landing shell, a hit jolts
// the whole screen, a sunk ship lists and slips under cell by cell, and the
// log keeps the words.

function cellAt(boardEl, idx) {
  return boardEl ? boardEl.querySelector(`[data-cell="${idx}"]`) : null;
}

function markCell(boardEl, idx, mark, extra) {
  const cell = cellAt(boardEl, idx);
  if (!cell) return;
  cell.classList.remove('cell--pending', 'cell--pick');
  cell.classList.add('cell--' + mark);
  if (extra && !reducedMotion()) cell.classList.add(extra);
}

/** The splash: a ring bursts out of the cell where the shell landed. */
function impact(boardEl, idx, kind) {
  const cell = cellAt(boardEl, idx);
  if (!cell || reducedMotion()) return;
  const ring = document.createElement('i');
  ring.className = `impact impact--${kind}`;
  ring.addEventListener('animationend', () => ring.remove());
  cell.appendChild(ring);
  setTimeout(() => ring.remove(), 900);
}

function shakeBoard(boardEl) {
  if (reducedMotion()) return;
  boardEl.classList.remove('board--shake');
  void boardEl.offsetWidth; // restart the animation
  boardEl.classList.add('board--shake');
}

/** The screen-shake: the whole screen area jolts (hit) or thuds (stamp). */
function shakeScreen(kind = 'shake') {
  if (reducedMotion()) return;
  const el = $('#screens');
  el.classList.remove('screens--shake', 'screens--thud');
  void el.offsetWidth;
  el.classList.add(`screens--${kind}`);
  clearTimeout(shakeScreen.t);
  shakeScreen.t = setTimeout(() => el.classList.remove('screens--shake', 'screens--thud'), 500);
}

/** A ship goes down: its cells sink one after the other from the stern. */
function sinkShip(boardEl, ship, shipIndex) {
  const cells = shipCells(ship);
  cells.forEach((c, k) => {
    const cell = cellAt(boardEl, c.index);
    if (!cell) return;
    cell.classList.remove('cell--burn', 'cell--pending', 'cell--pick');
    cell.classList.add('cell--sunk');
    if (reducedMotion()) { cell.classList.add('cell--settled'); return; }
    cell.style.animationDelay = `${k * 110}ms`;
    cell.classList.add('cell--sinking');
  });
  for (const strip of $$('.fleet')) {
    const line = strip.querySelector(`[data-ship="${shipIndex}"]`);
    if (line) { line.classList.add('fleet__ship--sunk'); if (!reducedMotion()) line.classList.add('fleet__ship--sinking'); line.querySelector('.fleet__state').textContent = 'SUNK'; }
  }
}

function showBanner(text, own = false) {
  const b = $('#banner');
  b.textContent = text;
  b.className = 'banner' + (own ? ' banner--own' : '');
  b.hidden = false;
}

function logLine(text, cls = '') {
  const log = $('#reveal-log');
  const d = document.createElement('div');
  d.className = 'reveal__line ' + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
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
    renderFleet($('#fleet-reveal'));
    logLine(state.incoming ? 'Their salvo is in; waiting for their results of yours. Both phones must show contact.' : 'No contact yet this round. Hold the Salute.', 'muted');
    return;
  }
  if (state.revealedRound === state.round) {
    // Already played: static view of the round.
    renderBoard($('#board-reveal-enemy'), { marks: state.shotsByMe });
    renderOwnBoard($('#board-reveal-own'));
    renderFleet($('#fleet-reveal'));
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
  // The strip shows the fleet before this round's incoming shells.
  const savedShots = state.shotsAtMe;
  state.shotsAtMe = ownMarks;
  renderFleet($('#fleet-reveal'), { sunkShips: prevMySunk });
  state.shotsAtMe = savedShots;
  const strip = $('#fleet-reveal');
  const round = state.round;
  const still = () => routeFromHash() === 'round' && state.phase === 'reveal' && state.round === round;

  // My shells on the enemy: splash / splash / HIT.
  for (let i = 0; i < rec.picks.length; i++) {
    const idx = rec.picks[i];
    if (idx === null) continue;
    if (!still()) return;
    sfx.whump();
    await sleep(REVEAL_FLIGHT_MS);
    if (rec.hits[i]) { sfx.hit(); vibrate([40, 30, 80]); markCell(enemyBoard, idx, 'hit', 'cell--burn'); impact(enemyBoard, idx, 'hit'); shakeBoard(enemyBoard); shakeScreen('shake'); }
    else { sfx.splash(); markCell(enemyBoard, idx, 'miss', 'cell--splash'); impact(enemyBoard, idx, 'miss'); }
    logLine(`My shell ${i + 1} → ${cellLabel(idx)} … ${rec.hits[i] ? 'HIT' : 'splash'}`, rec.hits[i] ? 'reveal__line--hit' : '');
    await sleep(REVEAL_STEP_MS - REVEAL_FLIGHT_MS);
  }
  if (rec.enemySunkNow.some(Boolean)) {
    if (!still()) return;
    sfx.sunk();
    sfx.sink();
    vibrate([300]);
    const names = rec.enemySunkNow.map((s, i) => (s ? `${SHIP_SIZES[i]}-SHIP` : null)).filter(Boolean).join(' + ');
    showBanner(`SUNK · ENEMY ${names}`);
    shakeScreen('thud');
    rec.enemySunkNow.forEach((s, i) => { if (s) logLine(`Enemy ${SHIP_SIZES[i]}-ship SUNK`, 'reveal__line--sunk'); });
    await sleep(REVEAL_SUNK_HOLD_MS);
  }
  await sleep(REVEAL_HALF_PAUSE_MS);

  // Their shells on my fleet.
  for (let i = 0; i < rec.theirSalvo.length; i++) {
    const idx = rec.theirSalvo[i];
    if (idx === null) continue;
    if (!still()) return;
    sfx.whump();
    await sleep(REVEAL_FLIGHT_MS);
    if (rec.theirHits[i]) {
      sfx.damage(); vibrate([40, 30, 80]);
      markCell(ownBoard, idx, 'hit', 'cell--burn'); impact(ownBoard, idx, 'hit'); shakeBoard(ownBoard); shakeScreen('shake');
      const b = strip.querySelector(`.fleet__cell[data-cell="${idx}"]`);
      if (b) { b.classList.add('fleet__cell--hit'); const line = b.closest('.fleet__ship'); const hits = line.querySelectorAll('.fleet__cell--hit').length; line.querySelector('.fleet__state').textContent = `${hits}/${line.querySelectorAll('.fleet__cell').length} HIT`; }
    } else { sfx.splash(); markCell(ownBoard, idx, 'miss', 'cell--splash'); impact(ownBoard, idx, 'miss'); }
    logLine(`Incoming shell ${i + 1} → ${cellLabel(idx)} … ${rec.theirHits[i] ? 'HIT on my fleet' : 'splash'}`, rec.theirHits[i] ? 'reveal__line--hit' : '');
    await sleep(REVEAL_STEP_MS - REVEAL_FLIGHT_MS);
  }
  if (rec.mySunkNow.some(Boolean)) {
    if (!still()) return;
    sfx.sunk();
    sfx.sink();
    vibrate([300]);
    const names = rec.mySunkNow.map((s, i) => (s ? `${SHIP_SIZES[i]}-SHIP` : null)).filter(Boolean).join(' + ');
    showBanner(`YOUR ${names} SUNK`, true);
    shakeScreen('thud');
    rec.mySunkNow.forEach((s, i) => {
      if (!s) return;
      logLine(`My ${SHIP_SIZES[i]}-ship SUNK`, 'reveal__line--sunk');
      sinkShip(ownBoard, state.fleet[i], i);
    });
    await sleep(REVEAL_SUNK_HOLD_MS);
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
    if (state.outcome.result === 'win') sfx.victory(); else sfx.defeat();
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
    // The host's transport rides its handshake; the joiner adopts it.
    if (state.role === 'guest' && frame.transport) adoptTransport(frame.transport);
    sfx.contact();
    if (routeFromHash() === 'handshake') { renderHandshake(); autoListen(); }
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

/** Two stages on one screen: the reveal exchange, then the verdict. */
function gameoverStage() {
  return state.audit ? 'verdict' : 'reveal';
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
  const stage = gameoverStage();
  const section = $('#screen-gameover');
  const stageChanged = section.dataset.stage !== stage;
  section.dataset.stage = stage;
  for (const p of $$('.stage', section)) p.hidden = p.dataset.stagePanel !== stage;

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
  const landed = stampEl.dataset.verdict !== 'pending' || stamp.cls === 'pending';
  stampEl.className = 'stamp';
  stampEl.dataset.verdict = stamp.cls;
  $('#stamp-word').textContent = stamp.word;
  $('#stamp-sub').textContent = stamp.sub;
  if (stamp.cls !== 'pending' && (!landed || stageChanged)) {
    // The stamp lands: big, overshoot, settle — and the screen takes the blow.
    if (!reducedMotion()) { void stampEl.offsetWidth; stampEl.classList.add('stamp--land'); }
    shakeScreen('thud');
    dispatch('mw:stamp', { verdict: stamp.cls, word: stamp.word });
  }

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
    renderFrame('gameover', myRevealFrame(), 'REVEAL · FLEET + SALT');
  } else {
    clearFrame('gameover', 'NO FLEET TO REVEAL');
  }
  $('#btn-forfeit').hidden = !!state.peerReveal || !out || (state.audit && state.audit.verdict === VERDICT.FORFEIT);
  $('#btn-forfeit').textContent = 'NO REVEAL? CLAIM FORFEIT';
  $('#reveal-exchange-hint').textContent = state.transport === TRANSPORT.CHIRP ? 'THE REVEAL · PHONES FLAT · CHIRP IT ACROSS' : 'THE REVEAL · RAISE PHONES ONCE MORE';
  renderContactState();
  updateTopbar();
  if (stage === 'verdict') {
    $('#screen-gameover [data-manual]').hidden = true;
    for (const sc of scanners.values()) sc.stop();
    if (SOUND && sonar.listening) { sonar.stop(); syncSonarUI(); }
  }
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
  const keep = { role: state.role, events: state.events, cacheStatus: state.cacheStatus, transport: state.transport, transportSource: state.transportSource };
  Object.assign(state, freshState());
  state.events = keep.events;
  state.cacheStatus = keep.cacheStatus;
  // The phone's own setting comes back for the next match; a transport
  // adopted from a host lasted that match only.
  if (keep.transportSource === 'handshake') loadTransport();
  else { state.transport = keep.transport; state.transportSource = keep.transportSource; }
  if (keepRole) {
    state.role = keep.role;
    if (keep.role === 'host') {
      state.session = randomSession();
      state.gate = new FrameGate({ session: state.session });
    }
  }
  $('#stamp').dataset.verdict = 'pending';
  syncCarriers();
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

// ------------------------------------------------------------ routing ---

/**
 * Every carrier lands here: camera, typed text, the Sonar decoder and the
 * dev channel. Everything is a match frame for injectText and the gate.
 */
function routeText(text, meta = {}) {
  return injectText(text.toUpperCase(), meta);
}

// ------------------------------------------------------------- sonar ---
// The chirp carrier: CHIRP sends the frame as sound; the microphone opens by
// itself on every Salute screen in chirp mode (LISTEN / STOP toggles it). A
// decoded chirp is routed like any scan; the row shows the gate's verdict in
// character (HEARD ✓ / HEARD AGAIN / NEAR MISS).

function activeSonarBlock() {
  const route = routeFromHash();
  return $$('[data-sonar]').find((b) => b.dataset.sonar === route) || null;
}

function syncSonarUI() {
  for (const b of $$('[data-sonar]')) {
    $('[data-action="listen"]', b).textContent = sonar.listening ? 'STOP' : 'LISTEN';
    b.classList.toggle('sonar-row--listening', sonar.listening);
  }
}

function blip(block, kind) {
  if (!block || reducedMotion()) return;
  const sweep = $('.sweep', block);
  sweep.classList.remove('sweep--hit', 'sweep--again', 'sweep--miss');
  void sweep.offsetWidth;
  sweep.classList.add('sweep--' + kind);
}

async function chirpCurrent(block) {
  const text = state.outgoing.text;
  if (!text) { toast('NOTHING TO CHIRP YET'); return null; }
  try {
    block.classList.add('sonar-row--chirping');
    const r = await sonar.transmit(text);
    dispatch('mw:chirped', { text, seconds: r ? r.seconds : null, sampleRate: r ? r.sampleRate : null });
    return r;
  } catch (err) {
    toast('CHIRP FAILED · ' + err.message.toUpperCase().slice(0, 36), 3000);
    return null;
  } finally {
    block.classList.remove('sonar-row--chirping');
    syncSonarUI();
  }
}

async function toggleListen() {
  if (sonar.listening) { sonar.stop(); syncSonarUI(); autoListen.paused = true; return; }
  autoListen.paused = false;
  try {
    const mode = await sonar.listen();
    sfx.ping();
    dispatch('mw:listen', { capture: mode, mic: sonar.micSettings, auto: false });
  } catch (err) {
    toast(err.message.toUpperCase().slice(0, 44), 3200);
  }
  syncSonarUI();
}

/** Is this a moment the mic should be open: a Salute screen, in chirp mode? */
function salutePhase() {
  const r = routeFromHash();
  return r === 'handshake' || (r === 'round' && state.phase === 'exchange') || (r === 'gameover' && !state.audit);
}

/**
 * Thursday: the sweep runs while the phone listens, and in chirp mode the
 * phone listens whenever a Salute screen is up — nobody has to remember to
 * tap LISTEN. A failed open says so on the row and leaves LISTEN to the
 * player; STOP pauses it until the next screen.
 */
async function autoListen() {
  if (!SOUND || state.transport !== TRANSPORT.CHIRP || !salutePhase()) return;
  if (sonar.listening || autoListen.opening || autoListen.paused) return;
  if (autoListen.failedAt && Date.now() - autoListen.failedAt < 4000) return;
  autoListen.opening = true;
  try {
    const mode = await sonar.listen();
    if (!salutePhase() || state.transport !== TRANSPORT.CHIRP) { sonar.stop(); return; }
    sfx.ping();
    dispatch('mw:listen', { capture: mode, mic: sonar.micSettings, auto: true });
  } catch (err) {
    autoListen.failedAt = Date.now();
    const b = activeSonarBlock();
    if (b) $('[data-sonar-status]', b).textContent = `MIC NOT OPEN · TAP LISTEN · ${err.message.toUpperCase().slice(0, 28)}`;
    dispatch('mw:listen-failed', { message: err.message, auto: true });
  } finally {
    autoListen.opening = false;
    syncSonarUI();
  }
}

/** The gate's verdict on a chirp, shown on the row: spectacle, never state. */
function sonarHeard(text, res, meta) {
  const block = activeSonarBlock();
  const heard = block ? $('[data-sonar-heard]', block) : null;
  let desc = text.length > 48 ? text.slice(0, 48) + '…' : text;
  try { desc = describeFrame(textToFrame(text)); } catch { /* not a frame: say what was heard */ }
  if (res.status === 'accepted') {
    if (heard) { heard.dataset.state = 'heard'; heard.textContent = `HEARD ✓ ${desc}`; }
    sfx.ping();
    blip(block, 'hit');
  } else if (res.status === 'duplicate') {
    if (heard) { heard.dataset.state = 'again'; heard.textContent = `HEARD AGAIN · ALREADY HAVE IT · ${desc}`; }
    blip(block, 'again');
  } else {
    // Near miss: the chirp decoded to something the gate will not take.
    // Nothing moved; the frame still rules; say again.
    const why = (res.reason || 'SAY AGAIN').replace(/_/g, ' ');
    if (heard) { heard.dataset.state = 'miss'; heard.textContent = `NEAR MISS · ${why} · ${desc} · CHIRP AGAIN`; }
    sfx.nearMiss();
    vibrate([30, 40, 30]);
    blip(block, 'miss');
  }
  dispatch('mw:sonar', { text, status: res.status, reason: res.reason, capture: meta.capture, loopback: !!meta.loopback });
}

function wireSonarBlocks() {
  if (!SOUND) return;
  sonar.onText = (text, meta) => {
    const res = routeText(text, { source: 'sonar', ...meta });
    sonarHeard(text, res, meta);
  };
  sonar.onLevel = (rms) => {
    const b = activeSonarBlock();
    if (b) b.style.setProperty('--level', Math.min(1, rms * 6).toFixed(3));
  };
  sonar.onStatus = (msg) => {
    const b = activeSonarBlock();
    if (b) $('[data-sonar-status]', b).textContent = msg;
  };
  for (const block of $$('[data-sonar]')) {
    $('[data-action="chirp"]', block).addEventListener('click', () => chirpCurrent(block));
    $('[data-action="listen"]', block).addEventListener('click', () => toggleListen());
  }
}

// ---------------------------------------------------------- scanners ---

function scannerFor(block) {
  const key = `${block.dataset.scan}`;
  if (scanners.has(key)) return scanners.get(key);
  const video = $('.scan__video', block);
  const status = $('[data-scan-status]', block);
  const sc = new Scanner(video, (text, meta) => routeText(text, { source: 'camera', block: key, ...meta }), {
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
  }
}

/** TYPE: one manual frame-text entry per screen, whichever carrier is up.
 *  It is the same decode path as a scan or a chirp, not a transport. */
function wireManualForms() {
  for (const btn of $$('[data-action="manual-toggle"]')) {
    btn.addEventListener('click', () => {
      const manual = $('[data-manual]', btn.closest('.screen'));
      if (!manual) return;
      manual.hidden = !manual.hidden;
      if (!manual.hidden) $('input', manual).focus();
    });
  }
  for (const manual of $$('[data-manual]')) {
    manual.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input', manual);
      const text = input.value.trim();
      if (!text) return;
      routeText(text, { source: 'manual', block: manual.dataset.manualBlock });
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
    const choice = e.target.closest('[data-transport-choice]');
    if (choice) { setTransport(choice.dataset.transportChoice); return; }
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
  for (const t of $$('.tab')) t.addEventListener('click', () => setPhase(t.dataset.phase));
  wireScanBlocks();
  wireManualForms();
  wireSonarBlocks();
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
  setTransport: (t) => setTransport(t),
  transport: () => state.transport,
  converged,
  auditRounds,
  routeText,
  sound: SOUND,
  sonar: SOUND ? sonar : null,
  chirp: () => { const b = activeSonarBlock(); return b ? chirpCurrent(b) : Promise.resolve(null); },
  devTamper: null, // dev channel hook: (text) => text, applied to outgoing frames only
  devMuteFrames: false, // dev channel hook: true = frames do not cross the text transport (chirp gate)
  devInstance: DEV_INSTANCE,
};

function parseLabel(l) {
  const col = l.toUpperCase().charCodeAt(0) - 65;
  const row = Number(l.slice(1)) - 1;
  return cellIndex(col, row);
}

// The kill switch, applied before anything is wired: with SOUND off every
// sound affordance leaves the document (the chirp carrier, the CHIRP
// setting), so there is nothing to grey out and the only transport is QR.
if (!SOUND) for (const el of $$('[data-needs-sound]')) el.remove();

// Two dev instances share one origin, so they would share one localStorage;
// each keeps its transport under its own key, as two phones would.
loadTransport();
wire();
syncCarriers();
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
