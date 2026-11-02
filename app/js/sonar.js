// Modem Warfare — the Sonar: a Salute frame as an audible ggwave chirp.
//
// Spectacle, never foundation (SPEC.md "Channels"). The chirp carries the SAME
// base32 text the QR carries; a decoded chirp goes through the app's single
// receive entry point (injectText) and the FrameGate exactly as a camera scan
// would, so a misheard chirp is rejected or a duplicate and costs a re-send,
// never state. QR stays the source of truth; the Sonar row is a companion to
// the lamp on every Salute screen, never a replacement for it.
//
// Rules carried from the Monday spike (spike/spike.js) into the real flow:
//   - audible protocol only (GGWAVE_PROTOCOL_AUDIBLE_FAST, volume 50 —
//     the numbers that gave 10/10 in the browser loopback);
//   - the microphone is opened with echoCancellation / noiseSuppression /
//     autoGainControl all off, or voice processing eats the tones;
//   - the microphone is closed before transmitting and reopened afterwards
//     (iOS play-and-record reroutes output);
//   - capture through an AudioWorklet (sonar-worklet.js), decode on the main
//     thread; ScriptProcessorNode only as a reported fallback.
//
// Kill switch: with config.SOUND false the engine is disabled (enabled =
// false), nothing here ever loads ggwave or touches the microphone, and the
// app removes every Sonar element from the document at boot.
import { SOUND } from './config.js';
import { audioContext, WANTED_SAMPLE_RATE } from './audio.js';

export const PROTOCOL = 'GGWAVE_PROTOCOL_AUDIBLE_FAST';
export const VOLUME = 50;
export const FRAME_SAMPLES = 1024; // one ggwave frame at 48 kHz

export const MIC_CONSTRAINTS = Object.freeze({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  video: false,
});

const GGWAVE_URL = new URL('../vendor/ggwave/ggwave.js', import.meta.url).href;
const WORKLET_URL = new URL('./sonar-worklet.js', import.meta.url).href;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Linear resample (dev loopback only: both windows share one browser, so
 *  this is normally the identity). */
export function resample(wave, from, to) {
  if (from === to) return wave;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(wave.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const fr = x - i0;
    out[i] = wave[i0] * (1 - fr) + (wave[Math.min(i0 + 1, wave.length - 1)] || 0) * fr;
  }
  return out;
}

export class Sonar {
  constructor() {
    this.enabled = SOUND;
    this.gg = null;
    this.tx = null;
    this.rx = null;
    this.readyPromise = null;
    this.workletPromise = null;
    this.workletFailed = null;
    this.captureMode = 'none'; // 'worklet' | 'scriptprocessor' once listening
    this.listening = false;
    this.loopback = null; // MediaStreamAudioDestinationNode in dev loopback mode
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.micSettings = null;
    this.busy = false; // a chirp is playing
    this.onText = null; // (text, meta) => void
    this.onLevel = null; // (rms) => void
    this.onStatus = null; // (message) => void
    this.stats = { chirps: 0, decodes: 0, listens: 0, chunks: 0 };
    this.lastChirp = null;
    this.lastHeard = null;
  }

  status(msg) {
    if (this.onStatus) this.onStatus(msg);
  }

  /** Samples per capture chunk so that one chunk is one ggwave frame after resampling. */
  get chunkSize() {
    const ac = audioContext();
    return ac ? Math.round((FRAME_SAMPLES * ac.sampleRate) / WANTED_SAMPLE_RATE) : FRAME_SAMPLES;
  }

  /** Load ggwave against the shared AudioContext (once). */
  async ready() {
    if (!this.enabled) throw new Error('sound is off');
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      const ac = audioContext();
      if (!ac) throw new Error('no AudioContext');
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      if (!globalThis.ggwave_factory) await loadScript(GGWAVE_URL);
      const gg = await globalThis.ggwave_factory();
      gg.disableLog();
      const p = gg.getDefaultParameters();
      p.sampleRateInp = ac.sampleRate;
      p.sampleRateOut = ac.sampleRate;
      p.sampleFormatInp = gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
      p.sampleFormatOut = gg.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
      this.gg = gg;
      this.tx = gg.init(p);
      this.rx = gg.init(p);
      return this;
    })();
    this.readyPromise.catch(() => { this.readyPromise = null; });
    return this.readyPromise;
  }

  /** Encode text to a waveform at the context's sample rate (a copy, not a wasm-heap view). */
  encode(text) {
    if (!this.gg) throw new Error('sonar not ready');
    const i8 = this.gg.encode(this.tx, text, this.gg.ProtocolId[PROTOCOL], VOLUME);
    return new Float32Array(i8.buffer, i8.byteOffset, i8.byteLength / 4).slice();
  }

  airtime(text) {
    return this.encode(text).length / audioContext().sampleRate;
  }

  play(wave, destination) {
    const ac = audioContext();
    const buffer = ac.createBuffer(1, wave.length, ac.sampleRate);
    buffer.getChannelData(0).set(wave);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(destination);
    return new Promise((resolve) => {
      // onended never fires while the context is suspended; never hang on it.
      const t = setTimeout(resolve, (wave.length / ac.sampleRate) * 1000 + 800);
      src.onended = () => { clearTimeout(t); resolve(); };
      src.start();
    });
  }

  /**
   * Chirp a frame's text through the speaker. Closes the microphone first
   * and reopens it afterwards. Fires 'mw:chirp' on the window with the
   * samples so the dev transport can carry them to the other window.
   */
  async transmit(text) {
    if (!this.enabled || this.busy) return null;
    await this.ready();
    const ac = audioContext();
    const micWasOpen = this.listening && !this.loopback;
    this.busy = true;
    try {
      if (micWasOpen) this.stop();
      const wave = this.encode(text);
      const seconds = wave.length / ac.sampleRate;
      this.stats.chirps += 1;
      this.lastChirp = { text, seconds, at: Date.now() };
      this.status(`CHIRPING · ${seconds.toFixed(1)} S · ${text.length} CHARS`);
      window.dispatchEvent(new CustomEvent('mw:chirp', { detail: { text, seconds, sampleRate: ac.sampleRate, samples: wave } }));
      await this.play(wave, ac.destination);
      return { text, seconds, samples: wave.length, sampleRate: ac.sampleRate };
    } finally {
      this.busy = false;
      if (micWasOpen) {
        try { await this.listen(); } catch (err) { this.status(`MIC DID NOT REOPEN · ${err.message.toUpperCase().slice(0, 30)}`); }
      } else if (!this.listening) this.status('SONAR IDLE');
      else this.status(this.loopback ? `LISTENING · LOOPBACK · ${this.captureMode.toUpperCase()}` : this.micLine());
    }
  }

  micLine() {
    const s = this.micSettings || {};
    return `LISTENING · ${this.captureMode.toUpperCase()} · EC=${s.echoCancellation === undefined ? '?' : s.echoCancellation ? 'ON' : 'OFF'} NS=${s.noiseSuppression === undefined ? '?' : s.noiseSuppression ? 'ON' : 'OFF'} AGC=${s.autoGainControl === undefined ? '?' : s.autoGainControl ? 'ON' : 'OFF'}`;
  }

  /**
   * Open the microphone (or, for the dev harness, a loopback destination
   * that the other window's chirp is played into) and start decoding.
   * Returns the capture mode in use.
   */
  async listen({ loopback = false } = {}) {
    if (!this.enabled) throw new Error('sound is off');
    if (this.listening) return this.captureMode;
    await this.ready();
    const ac = audioContext();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    let stream;
    if (loopback) {
      this.loopback = ac.createMediaStreamDestination();
      stream = this.loopback.stream;
      this.micSettings = null;
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('NO MICROPHONE API (needs https or localhost)');
      this.status('OPENING MIC…');
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      this.micSettings = stream.getAudioTracks()[0].getSettings();
    }
    await this.attachCapture(stream);
    this.stream = stream;
    this.listening = true;
    this.stats.listens += 1;
    this.status(loopback ? `LISTENING · LOOPBACK · ${this.captureMode.toUpperCase()}` : this.micLine());
    return this.captureMode;
  }

  async attachCapture(stream) {
    const ac = audioContext();
    const source = ac.createMediaStreamSource(stream);
    const sink = ac.createGain();
    sink.gain.value = 0; // the capture node must reach the destination to be pulled; nothing is heard
    let node = null;
    if (ac.audioWorklet && !this.workletFailed) {
      try {
        if (!this.workletPromise) this.workletPromise = ac.audioWorklet.addModule(WORKLET_URL);
        await this.workletPromise;
        node = new AudioWorkletNode(ac, 'mw-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { chunk: this.chunkSize } });
        node.port.onmessage = (e) => this.feed(e.data.samples, e.data.rms);
        this.captureMode = 'worklet';
      } catch (err) {
        this.workletFailed = err.message || String(err);
        this.workletPromise = null;
        node = null;
      }
    }
    if (!node) {
      // Fallback: the deprecated ScriptProcessorNode (Monday's spike path),
      // re-chunked to one ggwave frame. Reported in the status line, never silent.
      const chunk = this.chunkSize;
      let buf = new Float32Array(chunk);
      let n = 0;
      node = ac.createScriptProcessor(1024, 1, 1);
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let i = 0;
        while (i < data.length) {
          const take = Math.min(data.length - i, chunk - n);
          buf.set(data.subarray(i, i + take), n);
          n += take;
          i += take;
          if (n === chunk) {
            let sum = 0;
            for (let k = 0; k < chunk; k++) sum += buf[k] * buf[k];
            this.feed(buf, Math.sqrt(sum / chunk));
            buf = new Float32Array(chunk);
            n = 0;
          }
        }
      };
      this.captureMode = 'scriptprocessor';
    }
    source.connect(node);
    node.connect(sink).connect(ac.destination);
    this.source = source;
    this.node = node;
    this.sink = sink;
  }

  /** One captured chunk: level for the sweep, then ggwave decode. */
  feed(samples, rms) {
    this.stats.chunks += 1;
    if (this.onLevel) this.onLevel(rms);
    if (!this.gg || !this.listening) return;
    const res = this.gg.decode(this.rx, new Int8Array(samples.buffer, samples.byteOffset, samples.byteLength));
    if (!res || !res.length) return;
    const text = new TextDecoder().decode(res);
    this.stats.decodes += 1;
    this.lastHeard = { text, at: Date.now(), loopback: !!this.loopback };
    if (this.onText) this.onText(text, { source: 'sonar', capture: this.captureMode, loopback: !!this.loopback });
  }

  stop() {
    if (!this.listening) return;
    for (const n of [this.source, this.node, this.sink]) { try { n.disconnect(); } catch { /* already gone */ } }
    if (this.node && this.node.port) this.node.port.onmessage = null;
    if (this.node && 'onaudioprocess' in this.node) this.node.onaudioprocess = null;
    if (this.stream && !this.loopback) this.stream.getTracks().forEach((t) => t.stop());
    this.source = this.node = this.sink = this.stream = this.loopback = null;
    this.listening = false;
    this.status('SONAR IDLE');
  }

  /** Dev/test only: play the other window's chirp into this window's capture
   *  graph (listen({ loopback: true }) first). Same graph as the microphone
   *  from the MediaStream onwards: source -> worklet -> decode -> gate. */
  async injectLoopback(samples, sampleRate) {
    if (!this.listening || !this.loopback) throw new Error('not listening in loopback mode');
    const ac = audioContext();
    let wave = samples instanceof Float32Array ? samples : new Float32Array(samples);
    if (sampleRate && sampleRate !== ac.sampleRate) wave = resample(wave, sampleRate, ac.sampleRate);
    await this.play(wave, this.loopback);
  }
}

export const sonar = new Sonar();
