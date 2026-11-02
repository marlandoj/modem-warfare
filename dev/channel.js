// Dev transport: BroadcastChannel in place of two cameras.
//
// Every frame the app renders as a QR is also posted, as the SAME base32
// text the QR carries, on BroadcastChannel 'mw-dev'. Every message received
// is fed to the app's single decode entry point (window.MW.injectText), so the
// codec and the receive gate are exercised exactly as a camera scan would.
//
// Two things make it behave like a camera rather than a message queue:
//   - replay: a phone's camera keeps seeing the other phone's QR for as long
//     as it is held up. Here, whenever this instance renders a new frame it
//     also asks the peer to re-post its current frame, so a frame that was
//     rejected a moment ago as FUTURE_ROUND (we were a step behind) arrives
//     again once we have caught up. The gate turns true repeats into no-ops.
//   - tamper: MW.devTamper, when set to (text) => text, rewrites this
//     instance's OUTGOING frames. Tests use it to play a cheat (a false
//     result, a moved fleet, a wrong salt) without any cheat code in app/.
//
// Not precached; only loaded when the app URL carries ?dev=<instance>.

export function attach(MW, instance) {
  const channel = new BroadcastChannel('mw-dev');
  const log = (entry) => channel.postMessage({ kind: 'log', from: instance, at: Date.now(), ...entry });

  const outgoing = (text) => {
    if (typeof MW.devTamper !== 'function') return text;
    try { return MW.devTamper(text) || text; } catch (err) { log({ event: 'tamper-error', message: err.message }); return text; }
  };

  const post = (text, caption) => channel.postMessage({ kind: 'frame', from: instance, text: outgoing(text), caption, at: Date.now() });

  window.addEventListener('mw:render', (e) => {
    const { text, caption } = e.detail;
    post(text, caption);
    channel.postMessage({ kind: 'replay', from: instance, to: instance === 'A' ? 'B' : 'A', at: Date.now() });
  });

  window.addEventListener('mw:frame', (e) => {
    log({ event: 'decoded', ...e.detail, meta: undefined });
  });
  for (const name of ['mw:wager', 'mw:fire', 'mw:round-record', 'mw:gameover', 'mw:audit']) {
    window.addEventListener(name, (e) => log({ event: name.slice(3), ...e.detail }));
  }

  channel.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (msg.from === instance) return;
    if (msg.kind === 'frame' && typeof msg.text === 'string') {
      MW.injectText(msg.text, { source: 'broadcast', from: msg.from });
    } else if (msg.kind === 'replay' && msg.to === instance && MW.currentText()) {
      post(MW.currentText(), 'replay');
    }
  });

  MW.devChannel = channel;
  channel.postMessage({ kind: 'hello', from: instance, at: Date.now() });
}
