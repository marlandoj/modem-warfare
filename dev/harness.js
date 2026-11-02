// Harness page controller: tails the dev BroadcastChannel and can drive a
// scripted exchange through the two iframes' public window.MW surfaces.
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
    await sleep(50);
  }
  throw new Error('timeout waiting for ' + label);
}

function click(win, selector) {
  const el = win.document.querySelector(selector);
  if (!el) throw new Error('no element ' + selector);
  el.click();
}

/**
 * Scripted exchange. Returns a summary object; throws on any failure.
 * Exercised by tests/browser/harness.js and by the button on this page.
 */
export async function runScript() {
  const A = await waitFor(() => frameA.contentWindow.MW && frameA.contentWindow, 'instance A');
  const B = await waitFor(() => frameB.contentWindow.MW && frameB.contentWindow, 'instance B');
  const errors = [];
  for (const [name, win] of [['A', A], ['B', B]]) win.addEventListener('error', (e) => errors.push(`${name}: ${e.message}`));
  line('script', 'script: A NEW MATCH, B JOIN MATCH, both LOCK');
  click(A, '[data-action="new-match"]');
  click(B, '[data-action="join-match"]');
  await waitFor(() => A.document.body.dataset.screen === 'placement' && B.document.body.dataset.screen === 'placement', 'placement screens');
  click(A, '[data-action="lock"]');
  click(B, '[data-action="lock"]');
  // A renders its handshake on arrival; B (guest) adopts A's session from the broadcast, then renders its own.
  await waitFor(() => B.MW.state.session !== null && B.MW.state.session === A.MW.state.session, 'B adopts A session');
  await waitFor(() => A.MW.state.peerHandshake && B.MW.state.peerHandshake, 'handshake both ways');
  line('script', `handshake converged: session ${A.MW.state.session.toString(16)}`);

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
    errors,
  };
  line('script', `salvo converged: A got "${summary.aIncoming}", B got "${summary.bIncoming}"`);
  if (errors.length) line('error', errors.join(' | '));
  return summary;
}

document.getElementById('btn-script').addEventListener('click', () => runScript().catch((e) => line('error', e.message)));
window.harness = { runScript, lines };
