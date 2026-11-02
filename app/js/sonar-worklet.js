// Modem Warfare — Sonar capture AudioWorklet (runs on the audio rendering
// thread, loaded with audioWorklet.addModule under the shell's script-src
// 'self'; precached like every other app asset).
//
// It does one thing: batches the 128-sample render quanta into fixed-size
// Float32 chunks and posts each chunk to the main thread with its RMS level.
// The chunk size is chosen by the main thread so that one chunk resamples to
// exactly one ggwave frame (1024 samples at 48 kHz): 1024 on a 48 kHz device,
// 941 on a 44.1 kHz one. ggwave itself (an Emscripten module) decodes on the
// main thread; keeping only the capture here is what takes the deprecated
// ScriptProcessorNode and its main-thread misses (Monday §6.5) out of the
// path. The output is silence; the node is routed through a muted gain to
// the destination only so the graph pulls it.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.chunk = Math.max(128, Math.min(8192, Number(opts.chunk) || 1024));
    this.buf = new Float32Array(this.chunk);
    this.n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch || !ch.length) return true;
    let i = 0;
    while (i < ch.length) {
      const take = Math.min(ch.length - i, this.chunk - this.n);
      this.buf.set(ch.subarray(i, i + take), this.n);
      this.n += take;
      i += take;
      if (this.n === this.chunk) {
        let sum = 0;
        for (let k = 0; k < this.chunk; k++) sum += this.buf[k] * this.buf[k];
        const out = this.buf;
        this.port.postMessage({ samples: out, rms: Math.sqrt(sum / this.chunk) }, [out.buffer]);
        this.buf = new Float32Array(this.chunk);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('mw-capture', CaptureProcessor);
