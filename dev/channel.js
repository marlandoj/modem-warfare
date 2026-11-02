// Dev transport: BroadcastChannel in place of two cameras.
//
// Every frame the app renders as a QR is also posted, as the SAME base32
// text the QR carries, on BroadcastChannel 'mw-dev'. Every message received
// is fed to the app's single decode entry point (window.MW.injectText), so the
// codec and the receive gate are exercised exactly as a camera scan would.
// Not precached; only loaded when the app URL carries ?dev=<instance>.

export function attach(MW, instance) {
  const channel = new BroadcastChannel('mw-dev');
  const log = (entry) => channel.postMessage({ kind: 'log', from: instance, at: Date.now(), ...entry });

  window.addEventListener('mw:render', (e) => {
    const { text, caption } = e.detail;
    channel.postMessage({ kind: 'frame', from: instance, text, caption, at: Date.now() });
  });

  window.addEventListener('mw:frame', (e) => {
    log({ event: 'decoded', ...e.detail, meta: undefined });
  });

  channel.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (msg.from === instance) return;
    if (msg.kind === 'frame' && typeof msg.text === 'string') {
      MW.injectText(msg.text, { source: 'broadcast', from: msg.from });
    } else if (msg.kind === 'replay' && msg.to === instance && MW.currentText()) {
      channel.postMessage({ kind: 'frame', from: instance, text: MW.currentText(), caption: 'replay', at: Date.now() });
    }
  });

  MW.devChannel = channel;
  channel.postMessage({ kind: 'hello', from: instance, at: Date.now() });
}
