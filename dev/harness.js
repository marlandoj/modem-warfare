// Harness page controller: tails the dev BroadcastChannel and drives scripted
// play through the two iframes' public window.MW surfaces.
//
//   runScript()                 Monday's exchange: handshake both ways, one salvo both ways
//   runMatch({ cheat })         Tuesday: two automated players play a whole match to the stamp
//                               cheat: null | 'result' | 'fleet' | 'salt'  (B is always the cheat)
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

async function placeAndLock(A, B, fleets) {
  click(A, '[data-action="new-match"]');
  click(B, '[data-action="join-match"]');
  await waitFor(() => A.document.body.dataset.screen === 'placement' && B.document.body.dataset.screen === 'placement', 'placement screens');
  if (fleets) { A.MW.setFleet(fleets.A); B.MW.setFleet(fleets.B); }
  click(A, '[data-action="lock"]');
  click(B, '[data-action="lock"]');
  await waitFor(() => B.MW.state.session !== null && B.MW.state.session === A.MW.state.session, 'B adopts A session');
  await waitFor(() => A.MW.state.peerHandshake && B.MW.state.peerHandshake, 'handshake both ways');
}

/**
 * Monday's scripted exchange. Returns a summary object; throws on any failure.
 */
export async function runScript() {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  line('script', 'script: A NEW MATCH, B JOIN MATCH, both LOCK');
  await placeAndLock(A, B, null);
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
 */
export async function runMatch({ cheat = null, wager = 'LOSER DOES THE DISHES' } = {}) {
  const { A, B, errors } = await instances();
  await toHome(A); await toHome(B);
  A.MW.devTamper = null;
  B.MW.devTamper = tamperFor(cheat, B);
  line('script', `match: cheat=${cheat || 'none'} · A NEW MATCH, B JOIN MATCH, fixed fleets, both LOCK`);
  await placeAndLock(A, B, FLEETS);
  const t0 = performance.now();

  // Wager: the host types it and sends after contact; the guest echoes it.
  A.MW.setWager(wager);
  await waitFor(() => B.MW.state.wager === A.MW.state.wager && A.MW.state.wagerConfirmed, 'wager on both phones');
  line('script', `wager on both phones: "${B.MW.state.wager}"`);

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
    await waitFor(() => A.MW.converged() && B.MW.converged(), `round ${round} converged`);
    // Both phones chimed: flip and watch the staggered reveal.
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
  await waitFor(() => A.MW.state.audit && B.MW.state.audit, 'reveal both ways, audits run', 10000);

  const stampOf = (win) => ({ word: win.document.querySelector('#stamp-word').textContent, sub: win.document.querySelector('#stamp-sub').textContent, verdict: win.document.querySelector('#stamp').dataset.verdict });
  const summary = {
    cheat,
    session: A.MW.state.session.toString(16),
    wager: { a: A.MW.state.wager, b: B.MW.state.wager },
    rounds,
    outcome: { a: A.MW.state.outcome, b: B.MW.state.outcome },
    audit: { a: { verdict: A.MW.state.audit.verdict, findings: A.MW.state.audit.findings, checked: A.MW.state.audit.checked }, b: { verdict: B.MW.state.audit.verdict, findings: B.MW.state.audit.findings, checked: B.MW.state.audit.checked } },
    stamp: { a: stampOf(A), b: stampOf(B) },
    commits: { aOfB: hexOf(A.MW.state.peerHandshake.commit), bActual: hexOf(B.MW.state.commit), bOfA: hexOf(B.MW.state.peerHandshake.commit), aActual: hexOf(A.MW.state.commit) },
    gate: { a: tallyGate(A.MW.state.gate.log), b: tallyGate(B.MW.state.gate.log) },
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    errors,
  };
  line('script', `match over in ${rounds.length} rounds / ${summary.seconds} s: A ${summary.outcome.a.result} · B ${summary.outcome.b.result} · A stamps B: ${summary.stamp.a.word} (${summary.stamp.a.sub}) · B stamps A: ${summary.stamp.b.word} (${summary.stamp.b.sub})`);
  if (errors.length) line('error', errors.join(' | '));
  B.MW.devTamper = null;
  return summary;
}

function hexOf(bytes) { return Array.from(bytes || [], (b) => b.toString(16).padStart(2, '0')).join(''); }
function tallyGate(logEntries) {
  const t = { accepted: 0, duplicate: 0, rejected: 0, rejectedReasons: {} };
  for (const l of logEntries) { t[l.status] += 1; if (l.status === 'rejected') t.rejectedReasons[l.reason] = (t.rejectedReasons[l.reason] || 0) + 1; }
  return t;
}

document.getElementById('btn-script').addEventListener('click', () => runScript().catch((e) => line('error', e.message)));
document.getElementById('btn-match').addEventListener('click', () => runMatch().catch((e) => line('error', e.message)));
document.getElementById('btn-cheat').addEventListener('click', () => runMatch({ cheat: 'result' }).catch((e) => line('error', e.message)));
window.harness = { runScript, runMatch, lines, FLEETS };
