// Dev transport: BroadcastChannel in place of two cameras (and, Wednesday,
// in place of the air between a speaker and a microphone).
//
// Every frame the app renders as a QR is also posted, as the SAME base32
// text the QR carries, on BroadcastChannel 'mw-dev'. Every message received
// is fed to the app's single decode entry point (window.MW.routeText ->
// injectText), so the codec and the receive gate are exercised exactly as a
// camera scan would.
//
// Three things make it behave like a camera rather than a message queue:
//   - replay: a phone's camera keeps seeing the other phone's QR for as long
//     as it is held up. Here, whenever this instance renders a new frame it
//     also asks the peer to re-post its current frame, so a frame that was
//     rejected a moment ago as FUTURE_ROUND (we were a step behind) arrives
//     again once we have caught up. The gate turns true repeats into no-ops.
//   - tamper: MW.devTamper, when set to (text) => text, rewrites this
//     instance's OUTGOING frames. Tests use it to play a cheat (a false
//     result, a moved fleet, a wrong salt) without any cheat code in app/.
//   - mute: MW.devMuteFrames = true stops this instance from posting or
//     accepting frame text, so the chirp gate can prove a Salute crossed by
//     sound alone.
//
// Wednesday additions:
//   - chirp: when this instance chirps (app event mw:chirp) the waveform
//     samples are posted; a peer listening in loopback mode plays them into
//     its own capture graph (MediaStream -> AudioWorklet -> ggwave -> gate),
//     the same path the microphone feeds. Only the air is replaced.
//
// Not precached; only loaded when the app URL carries ?dev=<instance>.

export function attach(MW, instance) {
  const channel = new BroadcastChannel('mw-dev');
  const peer = instance === 'A' ? 'B' : 'A';
  const log = (entry) => channel.postMessage({ kind: 'log', from: instance, at: Date.now(), ...entry });

  const outgoing = (text) => {
    if (typeof MW.devTamper !== 'function') return text;
    try { return MW.devTamper(text) || text; } catch (err) { log({ event: 'tamper-error', message: err.message }); return text; }
  };

  const post = (text, caption) => channel.postMessage({ kind: 'frame', from: instance, text: outgoing(text), caption, at: Date.now() });

  window.addEventListener('mw:render', (e) => {
    if (MW.devMuteFrames) return;
    const { text, caption } = e.detail;
    post(text, caption);
    channel.postMessage({ kind: 'replay', from: instance, to: peer, at: Date.now() });
  });

  window.addEventListener('mw:chirp', (e) => {
    const { text, seconds, sampleRate, samples } = e.detail;
    channel.postMessage({ kind: 'chirp', from: instance, text, seconds, sampleRate, samples, at: Date.now() });
  });

  window.addEventListener('mw:frame', (e) => {
    log({ event: 'decoded', ...e.detail, meta: undefined });
  });
  for (const name of ['mw:transport', 'mw:fire', 'mw:round-record', 'mw:gameover', 'mw:audit', 'mw:stamp', 'mw:sonar', 'mw:chirped', 'mw:listen-failed']) {
    window.addEventListener(name, (e) => log({ event: name.slice(3), ...e.detail }));
  }

  channel.addEventListener('message', (e) => {
    const msg = e.data || {};
    if (msg.from === instance) return;
    if (msg.kind === 'frame' && typeof msg.text === 'string') {
      if (MW.devMuteFrames) return;
      MW.routeText(msg.text, { source: 'broadcast', from: msg.from });
    } else if (msg.kind === 'replay' && msg.to === instance && MW.currentText()) {
      if (MW.devMuteFrames) return;
      post(MW.currentText(), 'replay');
    } else if (msg.kind === 'chirp' && msg.samples) {
      if (MW.sonar && MW.sonar.listening && MW.sonar.loopback) {
        MW.sonar.injectLoopback(msg.samples, msg.sampleRate)
          .then(() => log({ event: 'chirp-played', text: msg.text, seconds: msg.seconds }))
          .catch((err) => log({ event: 'chirp-error', message: err.message }));
      } else {
        log({ event: 'chirp-ignored', text: msg.text, reason: MW.sonar ? 'not listening in loopback' : 'sound off' });
      }
    }
  });

  MW.devChannel = channel;
  channel.postMessage({ kind: 'hello', from: instance, at: Date.now() });
}
