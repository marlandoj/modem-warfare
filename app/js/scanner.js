// Camera scanner: rear camera -> downscaled frames -> decodeImage -> onText.
// Emits each distinct text once per sighting; the FrameGate decides what a
// re-scan means (a duplicate is a no-op by spec).
import { decodeImage, prepareDecoder, activeDecoder } from './qr.js';

// Camera choice: the Salute is screen-to-screen (both phones raised face to
// face, ~20 cm), so the FRONT camera is the one that sees the other screen.
// Default 'user'; flip() switches to the rear camera for the alternate
// geometry (phones side by side, each turned in turn). Unproven on hardware
// until the Tuesday phone session: see the Tuesday report.
export class Scanner {
  constructor(video, onText, { onStatus = () => {}, interval = 150, maxEdge = 640, facing = 'user' } = {}) {
    this.video = video;
    this.onText = onText;
    this.onStatus = onStatus;
    this.interval = interval;
    this.maxEdge = maxEdge;
    this.facing = facing;
    this.stream = null;
    this.timer = null;
    this.busy = false;
    this.lastText = null;
    this.lastAt = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  get running() {
    return !!this.stream;
  }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.onStatus('NO CAMERA API (needs https or localhost)');
      throw new Error('getUserMedia unavailable');
    }
    this.onStatus('STARTING CAMERA…');
    const decoder = await prepareDecoder();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.hidden = false;
    this.video.classList.toggle('scan__video--mirror', this.facing === 'user');
    await this.video.play();
    this.onStatus(`SCANNING · ${decoder} · ${this.facing === 'user' ? 'FRONT' : 'REAR'} CAM`);
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  /** Switch front/rear; restarts the stream if running. */
  async flip() {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    if (this.running) { this.stop(); await this.start(); }
    return this.facing;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.hidden = true;
    this.onStatus('SCANNER IDLE');
  }

  async tick() {
    if (this.busy || !this.stream || this.video.readyState < 2) return;
    this.busy = true;
    try {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const scale = Math.min(1, this.maxEdge / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.ctx.drawImage(this.video, 0, 0, w, h);
      const text = await decodeImage(this.ctx.getImageData(0, 0, w, h));
      if (text) {
        const now = performance.now();
        if (text !== this.lastText || now - this.lastAt > 1500) {
          this.lastText = text;
          this.lastAt = now;
          this.onText(text, { decoder: activeDecoder() });
        }
      }
    } catch (err) {
      this.onStatus(`DECODE ERROR: ${err.message}`);
    } finally {
      this.busy = false;
    }
  }
}
