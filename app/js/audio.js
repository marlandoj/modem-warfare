// Modem Warfare — the feel, in sound. Everything is synthesised with WebAudio
// at call time; there are no audio files to cache wrong (SPEC.md, "The feel").
//
//   lamp()    QR "lamp opens": filtered-noise shutter clack
//   contact() decode complete: two-note bell 880 -> 1320 Hz
//   whump()   an incoming shell, low thump
//   splash()  miss: bright noise through a falling filter
//   hit()     60 Hz thud + crackle
//   sunk()    descending three-tone horn
//   stamp()   the end stamp slams in: a heavier thud
//
// Every call is a no-op when the AudioContext is unavailable or still locked
// by the autoplay policy; unlock() is called from the first user gesture.

let ctx = null;
let noiseBuf = null;

function context() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

export function unlock() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function ready() {
  return !!(ctx && ctx.state === 'running');
}

function noise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 1.0);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(c, gainNode, t0, peak, attack, decay) {
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(c, { freq, type = 'sine', at = 0, peak = 0.25, attack = 0.01, decay = 0.3, slideTo = null }) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + attack + decay);
  env(c, g, t0, peak, attack, decay);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

function burst(c, { at = 0, peak = 0.3, attack = 0.005, decay = 0.25, filter = 'lowpass', from = 4000, to = 200, q = 0.8 }) {
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + attack + decay);
  const g = c.createGain();
  env(c, g, t0, peak, attack, decay);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + attack + decay + 0.05);
}

function safe(fn) {
  return (...args) => {
    const c = context();
    if (!c || c.state !== 'running') return false;
    try { fn(c, ...args); return true; } catch { return false; }
  };
}

export const lamp = safe((c) => {
  burst(c, { peak: 0.18, attack: 0.004, decay: 0.12, filter: 'bandpass', from: 2400, to: 900, q: 2 });
});

export const contact = safe((c) => {
  tone(c, { freq: 880, type: 'triangle', peak: 0.22, attack: 0.008, decay: 0.28 });
  tone(c, { freq: 1320, type: 'triangle', at: 0.13, peak: 0.22, attack: 0.008, decay: 0.42 });
});

export const whump = safe((c) => {
  tone(c, { freq: 110, type: 'sine', peak: 0.3, attack: 0.01, decay: 0.18, slideTo: 45 });
});

export const splash = safe((c) => {
  burst(c, { peak: 0.26, attack: 0.01, decay: 0.42, filter: 'lowpass', from: 6000, to: 300 });
});

export const hit = safe((c) => {
  tone(c, { freq: 60, type: 'sine', peak: 0.6, attack: 0.005, decay: 0.32, slideTo: 38 });
  burst(c, { peak: 0.22, attack: 0.002, decay: 0.2, filter: 'highpass', from: 1500, to: 3500, q: 0.5 });
});

export const sunk = safe((c) => {
  const notes = [392, 311, 233];
  notes.forEach((f, i) => tone(c, { freq: f, type: 'sawtooth', at: i * 0.22, peak: 0.16, attack: 0.02, decay: 0.34 }));
});

export const stamp = safe((c) => {
  tone(c, { freq: 80, type: 'sine', peak: 0.7, attack: 0.004, decay: 0.45, slideTo: 30 });
  burst(c, { peak: 0.2, attack: 0.002, decay: 0.1, filter: 'lowpass', from: 3000, to: 150 });
});
