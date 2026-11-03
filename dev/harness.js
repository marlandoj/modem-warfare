// Harness page controller: tails the dev BroadcastChannel and drives scripted
// play through the two iframes' public window.MW surfaces.
//
//   runScript()                 Monday's exchange: handshake both ways, one salvo both ways
//   runMatch({ cheat, transport })
//                               Tuesday: two automated players play a whole match to the stamp
//                               cheat: null | 'result' | 'fleet' | 'salt'  (B is always the cheat)
//                               Thursday: transport 'qr' (frames cross as the text the QR carries)
//                               or 'chirp' (text transport MUTED; every frame crosses as a chirp
//                               into the peer's loopback capture graph, re-sent if not heard)
//   runAdoption({ host, joiner })
//                               Thursday: the host's transport rides the handshake and the joiner adopts it
//   runChirp({ n })             Wednesday: the Salute crosses by chirp alone (text transport muted),
//                               then n salvo chirps A -> B through B's real capture pipeline
const log = document.getElementById('log');
const counts = document.getElementById('counts');
const frameA = document.getElementById('frame-a');
const frameB = document.getElementById('frame-b');
const channel = new BroadcastChannel('mw-dev');
let frames = 0;

export const lines = [];

function line(cls, text) {
  const ts = new Date().toISOString().slice(11, 23);
  const entry = `${ts} ${text}`;
  lines.push({ cls, text: entry });
  const span = document.createElement('div');
  span.className = 'l-' + cls;
  span.textContent = entry;
  log.appendChild(span);
  log.scrollTop = log.scrollHeight;
}

channel.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.kind === 'frame') {
    frames += 1;
    counts.textContent = `${frames} frames`;
    line('frame', `${m.from} → ${m.caption || 'frame'} ${m.text}`);
  } else if (m.kind === 'log' && m.event === 'decoded') {
    line(m.status, `${m.from} ← ${m.status.toUpperCase()} ${m.reason} ${m.frame || ''}`);
  } else if (m.kind === 'chirp') {
    line('frame', `${m.from} ♪ chirp ${m.text} (${Number(m.seconds).toFixed(2)} s at ${m.sampleRate} Hz, ${m.samples.length} samples)`);
  } else if (m.kind === 'card') {
    line('frame', `${m.from} → card ${m.id} hop ${m.hop} (${m.text.length} chars)`);
  } else if (m.kind === 'log' && m.event) {
    const { kind, from, at, event, ...rest } = m;
    line('script', `${from} · ${event} ${JSON.stringify(rest)}`);
  } else if (m.kind === 'hello') {
    line('script', `${m.from} online`);
  }
});

window.addEventListener('error', (e) => line('error', 'harness error: ' + e.message));

document.getElementById('btn-clear').addEventListener('click', () => { log.textContent = ''; lines.length = 0; frames = 0; counts.textContent = '0 frames'; });
document.getElementById('btn-reload').addEventListener('click', () => { frameA.contentWindow.location.reload(); frameB.contentWindow.location.reload(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 8000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) {
    try { const v = fn(); if (v) return v; } catch { /* iframe not ready */ }
    await sleep(40);
  }
  throw new Error('timeout waiting for ' + label);
}

function click(win, selector) {
  const el = win.document.querySelector(selector);
  if (!el) throw new Error('no element ' + selector);
  if (el.disabled) throw new Error('disabled element ' + selector);
  el.click();
}

async function instances() {
  const A = await waitFor(() => frameA.contentWindow.MW && frameA.contentWindow, 'instance A');
  const B = await waitFor(() => frameB.contentWindow.MW && frameB.contentWindow, 'instance B');
  const errors = [];
  for (const [name, win] of [['A', A], ['B', B]]) win.addEventListener('error', (e) => errors.push(`${name}: ${e.message}`));
  return { A, B, errors };
}

/** Both instances fresh on Home (the page may have run a previous script). */
async function toHome(win) {
  if (win.document.body.dataset.screen !== 'home') {
    win.MW.go('home');
    await waitFor(() => win.document.body.dataset.screen === 'home', 'home');
  }
}

/** The transport is a Home-screen setting: set it on both phones before NEW / JOIN. */
function setTransports(A, B, host, joiner) {
  if (host) A.MW.setTransport(host);
  if (joiner) B.MW.setTransport(joiner);
}

async function placeAndLock(A, B, fleets, { host = 'qr', joiner = host, byChirp = false } = {}) {
  setTransports(A, B, host, joiner);
  click(A, '[data-action="new-match"]');
  click(B, '[data-action="join-match"]');
  await waitFor(() => A.document.body.dataset.screen === 'placement' && B.document.body.dataset.screen === 'placement', 'placement screens');
  if (fleets) { A.MW.setFleet(fleets.A); B.MW.setFleet(fleets.B); }
  click(A, '[data-action="lock"]');
  click(B, '[data-action="lock"]');
  await waitFor(() => A.document.body.dataset.screen === 'handshake' && B.document.body.dataset.screen === 'handshake', 'handshake screens');
  if (byChirp) {
    // The Salute by sound alone: B listens, A chirps; then A listens, B chirps back.
    await chirpUntil(A, B, () => B.MW.state.session !== null && B.MW.state.session === A.MW.state.session, 'handshake A → B by chirp');
    await chirpUntil(B, A, () => A.MW.state.peerHandshake, 'handshake B → A by chirp');
  }
  await waitFor(() => B.MW.state.session !== null && B.MW.state.session === A.MW.state.session, 'B adopts A session');
  await waitFor(() => A.MW.state.peerHandshake && B.MW.state.peerHandshake, 'handshake both ways');
}

// ----------------------------------------------------- chirp carrier ---
// Only the air is replaced: a chirp's samples cross the BroadcastChannel and
// are played into the peer's loopback capture graph (MediaStream ->
// AudioWorklet -> ggwave -> routeText -> gate). A chirp that is not heard
// is sent again, as the game says to.

const CHIRP_TRIES = 4;

async function listenLoopback(...wins) {
  await Promise.all(wins.map((w) => w.MW.sonar.listen({ loopback: true })));
}

/** `from` chirps its current frame until `cond` holds on the other side. Returns the number of chirps. */
async function chirpUntil(from, to, cond, label) {
  for (let i = 1; i <= CHIRP_TRIES; i++) {
    await listenLoopback(to);
    await waitFor(() => from.MW.currentText(), `${label}: a frame to chirp`);
    const r = await from.MW.chirp();
    if (!r) throw new Error(`${label}: ${from.MW.devInstance} could not chirp`);
    try { await waitFor(cond, label, 5000); return i; } catch { line('script', `${label}: not heard, chirping again (${i}/${CHIRP_TRIES})`); }
  }
  throw new Error(`${label}: not heard after ${CHIRP_TRIES} chirps`);
}

/** Both phones chirp their current frame at each other until both conditions hold. */
async function exchangeByChirp(A, B, condA, condB, label, tally) {
  for (let i = 1; i <= CHIRP_TRIES; i++) {
    await listenLoopback(A, B);
    const [ra, rb] = await Promise.all([A.MW.chirp(), B.MW.chirp()]);
    if (!ra || !rb) throw new Error(`${label}: a phone could not chirp`);
    tally.chirps += 2;
    tally.airtimeSeconds += ra.seconds + rb.seconds;
    try { await waitFor(() => condA() && condB(), label, 6000); return; } catch { tally.resends += 1; line('script', `${label}: not heard both ways, chirping again (${i}/${CHIRP_TRIES})`); }
  }
  throw new Error(`${label}: not heard after ${CHIRP_TRIES} exchanges`);
}

/**
 * Monday's scripted exchange. Returns a summary object; throws on any failure.
 */
export async function runScript() {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  line('script', 'script: transport QR on both · A NEW MATCH, B JOIN MATCH, both LOCK');
  await placeAndLock(A, B, null, { host: 'qr' });
  line('script', `handshake converged: session ${A.MW.state.session.toString(16)}`);
  // Both phones now sit on the handshake screen. The channel must go quiet:
  // a duplicate must never cause a re-render (which would re-post, which
  // would produce another duplicate, forever).
  await sleep(400);
  const quietA = A.MW.state.gate.log.length;
  const quietB = B.MW.state.gate.log.length;
  await sleep(600);
  const idleTraffic = (A.MW.state.gate.log.length - quietA) + (B.MW.state.gate.log.length - quietB);
  line('script', `idle on handshake for 600 ms: ${idleTraffic} further gate events`);

  click(A, '[data-action="begin-round"]');
  click(B, '[data-action="begin-round"]');
  await waitFor(() => A.document.body.dataset.screen === 'round' && B.document.body.dataset.screen === 'round', 'round screens');
  A.MW.setPicks(['C4', 'E2', 'G7']);
  B.MW.setPicks(['A1', 'B2', 'C3']);
  click(A, '[data-action="fire"]');
  click(B, '[data-action="fire"]');
  // Each side renders its salvo; the other accepts it and re-renders with results; both then accept the result-bearing frame.
  await waitFor(() => A.MW.state.incoming && B.MW.state.incoming, 'salvo both ways');
  await waitFor(() => A.MW.state.incoming.results && B.MW.state.incoming.results, 'results both ways');
  const summary = {
    session: A.MW.state.session.toString(16),
    aIncoming: A.MW.describeFrame(A.MW.state.incoming),
    bIncoming: B.MW.describeFrame(B.MW.state.incoming),
    aGate: A.MW.state.gate.log.slice(),
    bGate: B.MW.state.gate.log.slice(),
    idleTraffic,
    errors,
  };
  line('script', `salvo converged: A got "${summary.aIncoming}", B got "${summary.bIncoming}"`);
  if (errors.length) line('error', errors.join(' | '));
  return summary;
}

// ----------------------------------------------------------- the match ---

// Fixed fleets so the script (and the test) know exactly where every ship is.
//   A: 4-ship A2-D2 · 3-ship G3-G5 · 2-ship C6-D6 · 2-ship E1-E2
//   B: 4-ship B1-B4 · 3-ship D5-F5 · 2-ship F1-G1 · 2-ship A7-B7
export const FLEETS = {
  A: [{ col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false }, { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false }],
  B: [{ col: 1, row: 0, horizontal: false }, { col: 3, row: 4, horizontal: true }, { col: 5, row: 0, horizontal: true }, { col: 0, row: 6, horizontal: true }],
};
const SIZES = [4, 3, 2, 2];

function shipCellLabels(ship, size) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(String.fromCharCode(65 + ship.col + (ship.horizontal ? i : 0)) + (ship.row + (ship.horizontal ? 0 : i) + 1));
  return out;
}

function allLabels() {
  const out = [];
  for (let r = 1; r <= 7; r++) for (let c = 0; c < 7; c++) out.push(String.fromCharCode(65 + c) + r);
  return out;
}

/**
 * An automated player with a plan: each round it fires `hitsPerRound` shells
 * at enemy ship cells (ship by ship, so ships sink one after another) and the
 * rest at water. Mixed hits and misses every round; sinkings before the end.
 */
function makePlayer(enemyFleet, hitsPerRound, seed) {
  const shipCells = enemyFleet.map((s, i) => shipCellLabels(s, SIZES[i]));
  const shipSet = new Set(shipCells.flat());
  const water = allLabels().filter((l) => !shipSet.has(l));
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const fired = new Set();
  const queue = shipCells.flat();
  return {
    pick() {
      const picks = [];
      while (picks.length < hitsPerRound && queue.length) picks.push(queue.shift());
      while (picks.length < 3) {
        const w = water.filter((l) => !fired.has(l));
        if (!w.length) { picks.push(queue.shift()); continue; }
        picks.push(w[Math.floor(rnd() * w.length)]);
      }
      picks.forEach((p) => fired.add(p));
      return picks;
    },
  };
}

/** Tamper functions for the cheat scenarios; applied to B's outgoing frames. */
function tamperFor(cheat, B) {
  const { frameToText, textToFrame } = B.MW;
  if (cheat === 'result') {
    // In round 2, report A's first shell as a miss whatever it was (and never admit a ship sunk early).
    return (text) => {
      const f = textToFrame(text);
      if (f.typeName === 'SALVO' && f.round === 2 && f.results) {
        f.results = { present: true, hits: [!f.results.hits[0], f.results.hits[1], f.results.hits[2]] };
        return frameToText(f);
      }
      return text;
    };
  }
  if (cheat === 'fleet') {
    // Reveal a fleet with the 2-ship moved (results were honest for the real fleet).
    return (text) => {
      const f = textToFrame(text);
      if (f.typeName === 'REVEAL') {
        f.fleet = f.fleet.map((s, i) => (i === 3 ? { ...s, col: 3, row: 6 } : s));
        return frameToText(f);
      }
      return text;
    };
  }
  if (cheat === 'salt') {
    return (text) => {
      const f = textToFrame(text);
      if (f.typeName === 'REVEAL') { f.salt = f.salt.slice(); f.salt[0] ^= 0x01; return frameToText(f); }
      return text;
    };
  }
  return null;
}

/**
 * Play a complete match. A fires 2 ship cells + 1 water shell per round, B
 * fires 1 ship cell + 2 water, so A wins in 6 rounds with sinkings along the
 * way. Both phones end on the game-over screen with a stamp.
 *
 * transport 'qr': frames cross the dev channel as the text the QR carries.
 * transport 'chirp': the text transport is muted on both phones and every
 * frame — handshake, salvo, results, reveal — crosses as a chirp.
 */
export async function runMatch({ cheat = null, transport = 'qr' } = {}) {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  const byChirp = transport === 'chirp';
  if (byChirp && (!A.MW.sound || !B.MW.sound)) throw new Error('chirp match: sound is OFF in this build');
  A.MW.devTamper = null;
  B.MW.devTamper = tamperFor(cheat, B);
  A.MW.devMuteFrames = byChirp;
  B.MW.devMuteFrames = byChirp;
  const tally = { chirps: 0, resends: 0, airtimeSeconds: 0 };
  const ev0 = { a: A.MW.state.events.length, b: B.MW.state.events.length }; // this match's events only
  const framesBy = (win, from, source) => win.MW.state.events.slice(from).filter((e) => e.name === 'mw:frame' && e.meta && e.meta.source === source).length;
  try {
    line('script', `match: transport=${transport} cheat=${cheat || 'none'} · A NEW MATCH, B JOIN MATCH, fixed fleets, both LOCK`);
    await placeAndLock(A, B, FLEETS, { host: transport, byChirp });
    if (byChirp) tally.chirps += 2;
    const t0 = performance.now();
    const transportOnBoth = { a: A.MW.transport(), b: B.MW.transport() };
    line('script', `transport on both phones: A ${transportOnBoth.a} · B ${transportOnBoth.b}`);

    click(A, '[data-action="begin-round"]');
    click(B, '[data-action="begin-round"]');
    await waitFor(() => A.document.body.dataset.screen === 'round' && B.document.body.dataset.screen === 'round', 'round screens');

    const playerA = makePlayer(FLEETS.B, 2, 7);
    const playerB = makePlayer(FLEETS.A, 1, 11);
    const rounds = [];
    for (let round = 1; round <= 20; round++) {
      const pa = playerA.pick();
      const pb = playerB.pick();
      A.MW.setPicks(pa);
      B.MW.setPicks(pb);
      click(A, '[data-action="fire"]');
      click(B, '[data-action="fire"]');
      if (byChirp) {
        // Salvo both ways, then the result-bearing re-render both ways.
        await exchangeByChirp(A, B, () => A.MW.state.incoming, () => B.MW.state.incoming, `round ${round} salvos by chirp`, tally);
        await exchangeByChirp(A, B, () => A.MW.converged(), () => B.MW.converged(), `round ${round} results by chirp`, tally);
      }
      await waitFor(() => A.MW.converged() && B.MW.converged(), `round ${round} converged`);
      // Both phones show contact: flip and watch the staggered reveal.
      click(A, '[data-action="reveal"]');
      click(B, '[data-action="reveal"]');
      await waitFor(() => A.MW.state.revealDone && B.MW.state.revealDone, `round ${round} reveal played`, 15000);
      const ra = A.MW.state.history[A.MW.state.history.length - 1];
      const rb = B.MW.state.history[B.MW.state.history.length - 1];
      rounds.push({ round, a: { picks: pa, hits: ra.hits, enemySunk: ra.enemySunk }, b: { picks: pb, hits: rb.hits, enemySunk: rb.enemySunk } });
      line('script', `round ${round}: A ${pa.join(' ')} → ${ra.hits.map((h) => (h ? 'HIT' : 'miss')).join('/')}${ra.enemySunkNow.some(Boolean) ? ' SUNK ' + ra.enemySunkNow.map((s, i) => (s ? SIZES[i] : '')).join('') : ''} · B ${pb.join(' ')} → ${rb.hits.map((h) => (h ? 'HIT' : 'miss')).join('/')}${rb.enemySunkNow.some(Boolean) ? ' SUNK ' + rb.enemySunkNow.map((s, i) => (s ? SIZES[i] : '')).join('') : ''}`);
      if (A.MW.state.outcome || B.MW.state.outcome) break;
      click(A, '[data-action="next-round"]');
      click(B, '[data-action="next-round"]');
      await waitFor(() => A.MW.state.round === round + 1 && B.MW.state.round === round + 1, `round ${round + 1} ready`);
    }
    await waitFor(() => A.MW.state.outcome && B.MW.state.outcome, 'both phones know the outcome');
    click(A, '[data-action="to-audit"]');
    click(B, '[data-action="to-audit"]');
    await waitFor(() => A.document.body.dataset.screen === 'gameover' && B.document.body.dataset.screen === 'gameover', 'game over screens');
    if (byChirp) await exchangeByChirp(A, B, () => A.MW.state.audit, () => B.MW.state.audit, 'reveal by chirp', tally);
    await waitFor(() => A.MW.state.audit && B.MW.state.audit, 'reveal both ways, audits run', 10000);

    const stampOf = (win) => ({ word: win.document.querySelector('#stamp-word').textContent, sub: win.document.querySelector('#stamp-sub').textContent, verdict: win.document.querySelector('#stamp').dataset.verdict, stage: win.document.querySelector('#screen-gameover').dataset.stage });
    const summary = {
      cheat,
      transport: transportOnBoth,
      session: A.MW.state.session.toString(16),
      rounds,
      outcome: { a: A.MW.state.outcome, b: B.MW.state.outcome },
      audit: { a: { verdict: A.MW.state.audit.verdict, findings: A.MW.state.audit.findings, checked: A.MW.state.audit.checked }, b: { verdict: B.MW.state.audit.verdict, findings: B.MW.state.audit.findings, checked: B.MW.state.audit.checked } },
      stamp: { a: stampOf(A), b: stampOf(B) },
      commits: { aOfB: hexOf(A.MW.state.peerHandshake.commit), bActual: hexOf(B.MW.state.commit), bOfA: hexOf(B.MW.state.peerHandshake.commit), aActual: hexOf(A.MW.state.commit) },
      gate: { a: tallyGate(A.MW.state.gate.log), b: tallyGate(B.MW.state.gate.log) },
      sonar: byChirp ? { ...tally, airtimeSeconds: Math.round(tally.airtimeSeconds * 10) / 10, decodes: { a: A.MW.sonar.stats.decodes, b: B.MW.sonar.stats.decodes }, chirpsSent: { a: A.MW.sonar.stats.chirps, b: B.MW.sonar.stats.chirps }, textFramesSeen: { a: framesBy(A, ev0.a, 'broadcast'), b: framesBy(B, ev0.b, 'broadcast') }, sonarFramesSeen: { a: framesBy(A, ev0.a, 'sonar'), b: framesBy(B, ev0.b, 'sonar') } } : null,
      seconds: Math.round((performance.now() - t0) / 100) / 10,
      errors,
    };
    line('script', `match over in ${rounds.length} rounds / ${summary.seconds} s: A ${summary.outcome.a.result} · B ${summary.outcome.b.result} · A stamps B: ${summary.stamp.a.word} (${summary.stamp.a.sub}) · B stamps A: ${summary.stamp.b.word} (${summary.stamp.b.sub})${byChirp ? ` · ${tally.chirps} chirps, ${tally.resends} re-sends` : ''}`);
    if (errors.length) line('error', errors.join(' | '));
    return summary;
  } finally {
    B.MW.devTamper = null;
    A.MW.devMuteFrames = false;
    B.MW.devMuteFrames = false;
    if (byChirp) { try { A.MW.sonar.stop(); B.MW.sonar.stop(); } catch { /* fine */ } }
  }
}

/**
 * The transport rides the handshake: the host's setting goes into its
 * frame, the joiner — set the other way beforehand — adopts it, and the
 * joiner's own handshake then carries the adopted value. Over the text
 * transport (carrier-neutral), so both directions can be proven with or
 * without sound.
 */
export async function runAdoption({ host = 'qr', joiner = 'chirp' } = {}) {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  setTransports(A, B, host, joiner);
  const before = { a: A.MW.transport(), b: B.MW.transport(), aChecked: checkedChoice(A), bChecked: checkedChoice(B) };
  line('script', `adoption: host set ${before.a}, joiner set ${before.b}`);
  A.MW.devMuteFrames = false; B.MW.devMuteFrames = false;
  await placeAndLock(A, B, FLEETS, { host: null, joiner: null });
  const hostFrame = A.MW.textToFrame(A.MW.currentText());
  const joinerFrame = B.MW.textToFrame(B.MW.currentText());
  const after = { a: A.MW.transport(), b: B.MW.transport(), source: { a: A.MW.state.transportSource, b: B.MW.state.transportSource } };
  const summary = {
    host, joiner, before, after,
    hostFrame: { transport: hostFrame.transport, described: A.MW.describeFrame(hostFrame) },
    joinerFrame: { transport: joinerFrame.transport, described: B.MW.describeFrame(joinerFrame) },
    aHoldsBAs: A.MW.state.peerHandshake.transport,
    bHoldsAAs: B.MW.state.peerHandshake.transport,
    presented: { a: presentedCarriers(A), b: presentedCarriers(B) },
    errors,
  };
  line('script', `adoption: host frame by ${summary.hostFrame.transport} → joiner now ${after.b} (${after.source.b}); joiner frame by ${summary.joinerFrame.transport}`);
  return summary;
}

function checkedChoice(win) {
  const el = win.document.querySelector('[data-transport-choice][aria-checked="true"]');
  return el ? el.dataset.transportChoice : null;
}

/** Which carrier blocks are actually visible on the current screen (not hidden, laid out). */
function presentedCarriers(win) {
  const screen = win.document.querySelector('.screen:not([hidden])');
  const vis = (el) => !el.hidden && el.offsetParent !== null;
  return {
    screen: screen && screen.dataset.route,
    qr: Array.from(screen.querySelectorAll('[data-transport="qr"]')).filter(vis).length,
    chirp: Array.from(screen.querySelectorAll('[data-transport="chirp"]')).filter(vis).length,
    scanButtons: Array.from(screen.querySelectorAll('[data-action="scan-toggle"]')).filter(vis).length,
    chirpButtons: Array.from(screen.querySelectorAll('[data-action="chirp"],[data-action="listen"]')).filter(vis).length,
    qrSvg: Array.from(screen.querySelectorAll('.lamp__qr svg')).filter((e) => vis(e.parentElement)).length,
  };
}

// ----------------------------------------------------------- the chirp ---

/**
 * The Salute by sound alone. Both instances mute the text transport, so the
 * only way A's handshake frame can reach B is A's chirp, carried as samples
 * into B's loopback capture graph (MediaStream -> AudioWorklet -> ggwave ->
 * routeText -> gate). Then B answers the same way. Then n salvo chirps A -> B
 * for the numbers (decodes / attempts, latency per chirp, airtime).
 */
export async function runChirp({ n = 10 } = {}) {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  if (!A.MW.sound || !B.MW.sound) { line('script', 'chirp: sound is OFF in this build, nothing to run'); return { skipped: 'sound off', errors }; }
  const lastSonar = (win) => { const ev = win.MW.state.events.filter((e) => e.name === 'mw:sonar'); return ev[ev.length - 1] || null; };
  const summary = { captureMode: null, sampleRate: null, handshake: {}, reply: {}, salvo: { sent: null, attempts: 0, decodes: 0, identical: 0, latenciesMs: [], airtimeSeconds: null }, gate: {}, errors };
  A.MW.devMuteFrames = true;
  B.MW.devMuteFrames = true;
  try {
    line('script', 'chirp: text transport MUTED on both · transport CHIRP on both · A NEW MATCH, B JOIN MATCH, fixed fleets, both LOCK');
    setTransports(A, B, 'chirp', 'chirp');
    click(A, '[data-action="new-match"]');
    click(B, '[data-action="join-match"]');
    await waitFor(() => A.document.body.dataset.screen === 'placement' && B.document.body.dataset.screen === 'placement', 'placement screens');
    A.MW.setFleet(FLEETS.A); B.MW.setFleet(FLEETS.B);
    click(A, '[data-action="lock"]');
    click(B, '[data-action="lock"]');
    await waitFor(() => A.document.body.dataset.screen === 'handshake' && B.document.body.dataset.screen === 'handshake', 'handshake screens');
    await sleep(300);
    if (B.MW.state.session !== null) throw new Error('B learned the session without a chirp: the text transport is not muted');

    // B listens (loopback: the harness plays A's samples into B's capture graph). A chirps its handshake.
    summary.captureMode = await B.MW.sonar.listen({ loopback: true });
    const sent = A.MW.currentText();
    let t0 = performance.now();
    const tx = await A.MW.chirp();
    if (!tx) throw new Error('A could not chirp (see the toast in A)');
    summary.sampleRate = tx.sampleRate;
    await waitFor(() => B.MW.state.session !== null && B.MW.state.session === A.MW.state.session, 'B adopts A\'s session from the chirp alone', 10000);
    const hs = lastSonar(B);
    summary.handshake = { sent, heard: B.MW.sonar.lastHeard && B.MW.sonar.lastHeard.text, identical: !!(B.MW.sonar.lastHeard && B.MW.sonar.lastHeard.text === sent), status: hs && hs.status, airtimeSeconds: tx.seconds, ms: Math.round(performance.now() - t0), sampleRate: tx.sampleRate, capture: hs && hs.capture };
    line('script', `chirp: handshake A → B by sound: ${summary.handshake.identical ? 'IDENTICAL' : 'DIFFERENT'} · gate ${summary.handshake.status} · ${summary.handshake.airtimeSeconds.toFixed(2)} s airtime · ${summary.handshake.ms} ms`);

    // B now renders its own handshake; A listens; B chirps back.
    B.MW.sonar.stop();
    await A.MW.sonar.listen({ loopback: true });
    await waitFor(() => B.MW.currentText(), 'B renders its handshake frame');
    const sentB = B.MW.currentText();
    t0 = performance.now();
    const txB = await B.MW.chirp();
    if (!txB) throw new Error('B could not chirp (see the toast in B)');
    await waitFor(() => A.MW.state.peerHandshake, 'A holds B\'s commitment from the chirp alone', 10000);
    const rp = lastSonar(A);
    summary.reply = { sent: sentB, heard: A.MW.sonar.lastHeard && A.MW.sonar.lastHeard.text, identical: !!(A.MW.sonar.lastHeard && A.MW.sonar.lastHeard.text === sentB), status: rp && rp.status, airtimeSeconds: txB.seconds, ms: Math.round(performance.now() - t0) };
    line('script', `chirp: handshake B → A by sound: ${summary.reply.identical ? 'IDENTICAL' : 'DIFFERENT'} · gate ${summary.reply.status} · ${summary.reply.ms} ms`);
    A.MW.sonar.stop();

    // Round 1: A fires; its salvo frame is chirped n times into B's pipeline.
    click(A, '[data-action="begin-round"]');
    click(B, '[data-action="begin-round"]');
    await waitFor(() => A.document.body.dataset.screen === 'round' && B.document.body.dataset.screen === 'round', 'round screens');
    A.MW.setPicks(['C4', 'E2', 'G7']);
    click(A, '[data-action="fire"]');
    await waitFor(() => A.MW.currentText(), 'A renders its salvo frame');
    await B.MW.sonar.listen({ loopback: true });
    const salvoText = A.MW.currentText();
    summary.salvo.sent = salvoText;
    for (let i = 0; i < n; i++) {
      const before = B.MW.sonar.stats.decodes;
      const t = performance.now();
      summary.salvo.attempts += 1;
      const r = await A.MW.chirp();
      if (summary.salvo.airtimeSeconds === null && r) summary.salvo.airtimeSeconds = r.seconds;
      let heard = null;
      try {
        await waitFor(() => B.MW.sonar.stats.decodes > before, `chirp ${i + 1} decoded`, 4000);
        heard = B.MW.sonar.lastHeard.text;
      } catch { /* missed */ }
      if (heard !== null) summary.salvo.decodes += 1;
      if (heard === salvoText) { summary.salvo.identical += 1; summary.salvo.latenciesMs.push(Math.round(performance.now() - t)); }
      const ev = lastSonar(B);
      line('script', `chirp ${i + 1}/${n}: ${heard === null ? 'MISSED' : heard === salvoText ? 'identical' : 'DIFFERENT ' + heard} · gate ${ev ? ev.status + ' ' + ev.reason : '—'} · ${Math.round(performance.now() - t)} ms`);
      await sleep(150);
    }
    B.MW.sonar.stop();
    summary.gate = { a: tallyGate(A.MW.state.gate.log), b: tallyGate(B.MW.state.gate.log) };
    summary.bIncoming = B.MW.state.incoming ? B.MW.describeFrame(B.MW.state.incoming) : null;
    line('script', `chirp: salvo ×${n}: ${summary.salvo.decodes} decoded, ${summary.salvo.identical} identical · B holds "${summary.bIncoming}" · B gate ${JSON.stringify(summary.gate.b)}`);
    if (errors.length) line('error', errors.join(' | '));
    return summary;
  } finally {
    try { A.MW.sonar.stop(); B.MW.sonar.stop(); } catch { /* fine */ }
    A.MW.devMuteFrames = false;
    B.MW.devMuteFrames = false;
  }
}

function hexOf(bytes) { return Array.from(bytes || [], (b) => b.toString(16).padStart(2, '0')).join(''); }
function tallyGate(logEntries) {
  const t = { accepted: 0, duplicate: 0, rejected: 0, rejectedReasons: {} };
  for (const l of logEntries) { t[l.status] += 1; if (l.status === 'rejected') t.rejectedReasons[l.reason] = (t.rejectedReasons[l.reason] || 0) + 1; }
  return t;
}

document.getElementById('btn-script').addEventListener('click', () => runScript().catch((e) => line('error', e.message)));
document.getElementById('btn-match').addEventListener('click', () => runMatch({ transport: 'qr' }).catch((e) => line('error', e.message)));
document.getElementById('btn-match-chirp').addEventListener('click', () => runMatch({ transport: 'chirp' }).catch((e) => line('error', e.message)));
document.getElementById('btn-cheat').addEventListener('click', () => runMatch({ cheat: 'result' }).catch((e) => line('error', e.message)));
document.getElementById('btn-chirp').addEventListener('click', () => runChirp().catch((e) => line('error', e.message)));
window.harness = { runScript, runMatch, runAdoption, runChirp, presentedCarriers, lines, FLEETS };
