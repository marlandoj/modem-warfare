// ggwave spike: real SALVO frame -> audible chirp -> decoded frame.
//
// Rules carried from SPEC.md and the Monday brief:
//  - audible protocols only (ultrasound is cut);
//  - microphone opened with echoCancellation / noiseSuppression /
//    autoGainControl all false, or voice processing eats the tones;
//  - the microphone is closed before transmitting and reopened afterwards
//    (iOS play-and-record reroutes output; Android keeps the rule for parity);
//  - counts are honest: attempts and decodes per mode, nothing inferred.
import { TYPE, frameToText, textToFrame, parseCellLabel, describeFrame, bytesEqual, encodeFrame } from '../app/js/frame.js';

const $ = (s) => document.querySelector(s);
const logEl = $('#log');

function log(msg) {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
  state.lines.push(line);
}

const state = {
  gg: null, ac: null, tx: null, rx: null, proto: null,
  mic: { stream: null, source: null, node: null, sink: null, listening: false, settings: null },
  expected: null, expectedText: null,
  counts: { tx: { a: 0 }, mic: { d: 0 }, self: { a: 0, d: 0 }, webaudio: { a: 0, d: 0 }, direct: { a: 0, d: 0 } },
  stop: false,
  lines: [],
  lastHeard: null,
  waiters: new Set(),
};

// ------------------------------------------------------------ helpers ---

function toInt8(f32) {
  return new Int8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

function toF32(i8) {
  return new Float32Array(i8.buffer, i8.byteOffset, i8.byteLength / 4);
}

function setCount(mode, key, value, latency) {
  const row = document.querySelector(`#counts tr[data-mode="${mode}"]`);
  if (!row) return;
  if (key) row.querySelector('.' + key).textContent = String(value);
  if (latency !== undefined) row.querySelector('.l').textContent = latency === null ? '—' : `${latency} ms`;
}

function bump(mode, key, latency) {
  state.counts[mode][key] = (state.counts[mode][key] || 0) + 1;
  setCount(mode, key, state.counts[mode][key], latency);
}

// --------------------------------------------------------------- frame ---

function currentFrame() {
  const session = parseInt($('#f-session').value, 16) >>> 0;
  const round = Number($('#f-round').value) || 1;
  const cells = ['#f-c0', '#f-c1', '#f-c2'].map((s) => parseCellLabel($(s).value));
  const r = $('#f-results').value;
  const results = r ? { present: true, hits: r.split('').map((c) => c === '1') } : null;
  return { type: TYPE.SALVO, session, round, salvo: cells, results, sunk: [false, false, false, false] };
}

function refreshFrame() {
  try {
    const frame = currentFrame();
    state.expected = frame;
    state.expectedText = frameToText(frame);
    $('#f-text').textContent = `${state.expectedText}  (${encodeFrame(frame).length} bytes → ${state.expectedText.length} chars)`;
    $('#f-desc').textContent = describeFrame(textToFrame(state.expectedText));
    refreshAirtime();
  } catch (err) {
    $('#f-text').textContent = 'invalid frame: ' + err.message;
  }
}

// -------------------------------------------------------------- ggwave ---

async function ensureAudio() {
  if (!state.ac) {
    state.ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  }
  if (state.ac.state !== 'running') await state.ac.resume();
  if (!state.gg) {
    state.gg = await window.ggwave_factory();
    state.gg.disableLog();
    $('#env').textContent = `ggwave ready · AudioContext ${state.ac.sampleRate} Hz · ${navigator.userAgent}`;
  }
  if (!state.tx) {
    const p = state.gg.getDefaultParameters();
    p.sampleRateInp = state.ac.sampleRate;
    p.sampleRateOut = state.ac.sampleRate;
    p.sampleFormatInp = state.gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    p.sampleFormatOut = state.gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    state.tx = state.gg.init(p);
    state.rx = state.gg.init(p);
  }
  return state.gg;
}

function protocolId() {
  return state.gg.ProtocolId[$('#protocol').value];
}

function encodeWave(text) {
  const vol = Number($('#volume').value);
  const i8 = state.gg.encode(state.tx, text, protocolId(), vol);
  return toF32(i8);
}

function refreshAirtime() {
  if (!state.gg || !state.expectedText) return;
  const wave = encodeWave(state.expectedText);
  $('#airtime').textContent = `airtime: ${(wave.length / state.ac.sampleRate).toFixed(2)} s at ${state.ac.sampleRate} Hz (${$('#protocol').value.replace('GGWAVE_PROTOCOL_', '')})`;
}

/** Feed captured samples into the decoder; resolves any waiting loopback. */
function feedDecoder(f32, source) {
  const res = state.gg.decode(state.rx, toInt8(f32));
  if (!res || !res.length) return null;
  const text = new TextDecoder().decode(res);
  let desc = '(not a frame)';
  let match = false;
  try {
    const frame = textToFrame(text);
    desc = describeFrame(frame);
    match = state.expected ? bytesEqual(frame.bytes, encodeFrame(state.expected)) : false;
  } catch (err) {
    desc = `undecodable: ${err.code || err.message}`;
  }
  state.lastHeard = { text, desc, match, source, at: performance.now() };
  const heard = $('#heard');
  heard.textContent = `HEARD: ${text} · ${desc}${match ? ' · MATCHES SENT FRAME' : ''}`;
  heard.classList.toggle('ok', match);
  log(`[${source}] decoded "${text}" → ${desc}${match ? ' ✓' : ''}`);
  for (const w of state.waiters) w(state.lastHeard);
  return state.lastHeard;
}

function waitForDecode(timeoutMs) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { state.waiters.delete(fn); resolve(null); }, timeoutMs);
    const fn = (heard) => { clearTimeout(t); state.waiters.delete(fn); resolve(heard); };
    state.waiters.add(fn);
  });
}

function makeCaptureNode(label) {
  const node = state.ac.createScriptProcessor(1024, 1, 1);
  node.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    feedDecoder(new Float32Array(data), label);
  };
  // ScriptProcessor only runs when connected to the destination; a muted
  // gain keeps captured audio from being played back out of the speaker.
  const sink = state.ac.createGain();
  sink.gain.value = 0;
  node.connect(sink);
  sink.connect(state.ac.destination);
  return { node, sink };
}

// ---------------------------------------------------------------- mic ---

export const MIC_CONSTRAINTS = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  video: false,
};

async function openMic() {
  await ensureAudio();
  if (state.mic.listening) return state.mic.settings;
  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  const { node, sink } = makeCaptureNode('mic');
  const source = state.ac.createMediaStreamSource(stream);
  source.connect(node);
  Object.assign(state.mic, { stream, source, node, sink, listening: true, settings });
  $('#mic-status').textContent = `mic: OPEN · EC=${settings.echoCancellation} NS=${settings.noiseSuppression} AGC=${settings.autoGainControl} · ${settings.sampleRate || '?'} Hz`;
  $('#btn-listen').setAttribute('aria-pressed', 'true');
  log(`mic opened: ${JSON.stringify({ echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl, sampleRate: settings.sampleRate })}`);
  return settings;
}

function closeMic() {
  if (!state.mic.listening) return;
  state.mic.source.disconnect();
  state.mic.node.disconnect();
  state.mic.sink.disconnect();
  state.mic.stream.getTracks().forEach((t) => t.stop());
  Object.assign(state.mic, { stream: null, source: null, node: null, sink: null, listening: false });
  $('#mic-status').textContent = 'mic: closed';
  $('#btn-listen').setAttribute('aria-pressed', 'false');
  log('mic closed');
}

// ------------------------------------------------------------- playback ---

function playWave(f32, destination) {
  const buffer = state.ac.createBuffer(1, f32.length, state.ac.sampleRate);
  buffer.getChannelData(0).set(f32);
  const src = state.ac.createBufferSource();
  src.buffer = buffer;
  src.connect(destination);
  return new Promise((resolve) => { src.onended = resolve; src.start(); });
}

/** Transmit once through the speaker, closing the mic first (spec rule). */
async function transmit({ keepMic = false } = {}) {
  await ensureAudio();
  const wasListening = state.mic.listening;
  if (wasListening && !keepMic) closeMic();
  const wave = encodeWave(state.expectedText);
  bump('tx', 'a');
  log(`transmit ${state.expectedText} (${(wave.length / state.ac.sampleRate).toFixed(2)} s)${keepMic && wasListening ? ' — mic kept open (loopback mode)' : ''}`);
  await playWave(wave, state.ac.destination);
  if (wasListening && !keepMic) await openMic();
}

// ------------------------------------------------------------ loopbacks ---

async function runSelfLoopback(n) {
  await ensureAudio();
  await openMic();
  state.stop = false;
  log(`speaker→mic loopback ×${n} (mic stays open — test mode only)`);
  for (let i = 0; i < n && !state.stop; i++) {
    const wave = encodeWave(state.expectedText);
    const t0 = performance.now();
    bump('self', 'a');
    const waiter = waitForDecode(wave.length / state.ac.sampleRate * 1000 + 2500);
    playWave(wave, state.ac.destination);
    const heard = await waiter;
    if (heard && heard.match) bump('self', 'd', Math.round(performance.now() - t0)); else setCount('self', null, null, null);
    await new Promise((r) => setTimeout(r, 300));
  }
  return state.counts.self;
}

async function runWebAudioLoopback(n) {
  await ensureAudio();
  state.stop = false;
  log(`WebAudio MediaStream loopback ×${n} (no microphone)`);
  const dest = state.ac.createMediaStreamDestination();
  const { node, sink } = makeCaptureNode('webaudio');
  const source = state.ac.createMediaStreamSource(dest.stream);
  source.connect(node);
  try {
    for (let i = 0; i < n && !state.stop; i++) {
      const wave = encodeWave(state.expectedText);
      const t0 = performance.now();
      bump('webaudio', 'a');
      const waiter = waitForDecode(wave.length / state.ac.sampleRate * 1000 + 2500);
      playWave(wave, dest);
      const heard = await waiter;
      if (heard && heard.match) bump('webaudio', 'd', Math.round(performance.now() - t0)); else setCount('webaudio', null, null, null);
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    source.disconnect();
    node.disconnect();
    sink.disconnect();
  }
  return state.counts.webaudio;
}

async function runDirect(n) {
  await ensureAudio();
  state.stop = false;
  log(`direct buffer ×${n}`);
  for (let i = 0; i < n && !state.stop; i++) {
    const wave = encodeWave(state.expectedText);
    bump('direct', 'a');
    const t0 = performance.now();
    let heard = null;
    for (let off = 0; off < wave.length && !heard; off += 1024) {
      const chunk = new Float32Array(1024);
      chunk.set(wave.subarray(off, Math.min(off + 1024, wave.length)));
      heard = feedDecoder(chunk, 'direct');
    }
    if (heard && heard.match) bump('direct', 'd', Math.round(performance.now() - t0)); else setCount('direct', null, null, null);
    await new Promise((r) => setTimeout(r, 0));
  }
  return state.counts.direct;
}

// --------------------------------------------------------------- wiring ---

for (const id of ['#f-session', '#f-round', '#f-c0', '#f-c1', '#f-c2', '#f-results']) $(id).addEventListener('input', refreshFrame);
$('#protocol').addEventListener('change', refreshAirtime);
$('#volume').addEventListener('input', () => { $('#volume-v').textContent = $('#volume').value; });

$('#btn-listen').addEventListener('click', async () => {
  try { if (state.mic.listening) closeMic(); else await openMic(); } catch (err) { log('mic error: ' + err.message); }
});
$('#btn-tx').addEventListener('click', () => transmit().catch((e) => log('tx error: ' + e.message)));
$('#btn-self').addEventListener('click', () => runSelfLoopback(Number($('#n').value)).catch((e) => log('error: ' + e.message)));
$('#btn-webaudio').addEventListener('click', () => runWebAudioLoopback(Number($('#n').value)).catch((e) => log('error: ' + e.message)));
$('#btn-direct').addEventListener('click', () => runDirect(Number($('#n').value)).catch((e) => log('error: ' + e.message)));
$('#btn-stop').addEventListener('click', () => { state.stop = true; });

refreshFrame();
ensureAudio().then(refreshFrame).catch((e) => { $('#env').textContent = 'ggwave failed to load: ' + e.message; log('ggwave load error: ' + e.message); });

// Test surface.
window.SPIKE = {
  state,
  ensureAudio,
  openMic,
  closeMic,
  transmit,
  runSelfLoopback,
  runWebAudioLoopback,
  runDirect,
  counts: () => JSON.parse(JSON.stringify(state.counts)),
  lines: () => state.lines.slice(),
  expectedText: () => state.expectedText,
  micSettings: () => state.mic.settings,
};
