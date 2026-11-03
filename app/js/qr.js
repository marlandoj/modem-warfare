// QR encode (qrcode-generator, vendored) and decode (BarcodeDetector where the
// browser has it, otherwise the vendored zxing-wasm reader).
//
// SPEC.md: base32 payload into a QR version 2–3 at error-correction M. The
// encoder tries version 2 first and falls back to 3; anything that does not
// fit version 3 is a bug in the caller, not something to silently upgrade.
// The version, error-correction and mode options exist for callers that
// need them explicitly; every match frame keeps the v2–3 rule.

const VENDOR_BASE = new URL('../vendor/', import.meta.url).href;

export const QR_MIN_VERSION = 2;
export const QR_MAX_VERSION = 3;
export const QR_EC_LEVEL = 'M';

export function buildQr(text, { minVersion = QR_MIN_VERSION, maxVersion = QR_MAX_VERSION, ec = QR_EC_LEVEL, mode = 'Alphanumeric' } = {}) {
  if (mode === 'Alphanumeric' && !/^[0-9A-Z $%*+\-./:]+$/.test(text)) throw new Error('QR payload must be alphanumeric-mode safe');
  const factory = globalThis.qrcode;
  if (typeof factory !== 'function') throw new Error('qrcode-generator not loaded');
  if (mode === 'Byte' && factory.stringToBytesFuncs && factory.stringToBytes !== factory.stringToBytesFuncs['UTF-8']) {
    factory.stringToBytes = factory.stringToBytesFuncs['UTF-8']; // the library's default is one byte per char code
  }
  let lastErr;
  for (let version = minVersion; version <= maxVersion; version++) {
    try {
      const qr = factory(version, ec);
      qr.addData(text, mode);
      qr.make();
      return { qr, version, modules: qr.getModuleCount() };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`payload of ${text.length} chars does not fit QR v${maxVersion}-${ec}: ${lastErr}`);
}

/** Render as an inline SVG string: black modules on white, 4-module quiet zone. */
export function qrSvg(text, { quiet = 4, ...opts } = {}) {
  const { qr, version, modules } = buildQr(text, opts);
  const size = modules + quiet * 2;
  let d = '';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" data-qr-version="${version}" data-qr-modules="${modules}" role="img" aria-label="QR frame">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
  return { svg, version, modules };
}

/** Draw onto a canvas 2D context (used by tests and by the Sonar page). */
export function qrToCanvas(text, canvas, { scale = 8, quiet = 4, ...opts } = {}) {
  const { qr, version, modules } = buildQr(text, opts);
  const size = (modules + quiet * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return { version, modules, size };
}

// ------------------------------------------------------------- decode ---

let detectorPromise = null;
let zxingPromise = null;
let decoderName = 'none';

export function activeDecoder() {
  return decoderName;
}

async function nativeDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    if (!('BarcodeDetector' in globalThis)) return null;
    try {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats();
      if (!formats.includes('qr_code')) return null;
      return new globalThis.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function zxing() {
  if (zxingPromise) return zxingPromise;
  zxingPromise = (async () => {
    if (!globalThis.ZXingWASM) await loadScript(VENDOR_BASE + 'zxing/zxing-reader.js');
    const Z = globalThis.ZXingWASM;
    // Point the Emscripten loader at the precached wasm, never at a CDN.
    await Z.prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? VENDOR_BASE + 'zxing/' + path : prefix + path) },
      fireImmediately: true,
    });
    return Z;
  })();
  return zxingPromise;
}

/** Warm whichever decoder this browser will use; returns its name. */
export async function prepareDecoder() {
  const det = await nativeDetector();
  if (det) { decoderName = 'BarcodeDetector'; return decoderName; }
  await zxing();
  decoderName = 'zxing-wasm';
  return decoderName;
}

/**
 * Decode one QR from an ImageData (preferred) or a canvas/video/bitmap.
 * Returns the raw text or null when nothing is found.
 */
export async function decodeImage(source) {
  const det = await nativeDetector();
  if (det) {
    decoderName = 'BarcodeDetector';
    const codes = await det.detect(source);
    return codes.length ? codes[0].rawValue : null;
  }
  const Z = await zxing();
  decoderName = 'zxing-wasm';
  const imageData = source instanceof ImageData ? source : toImageData(source);
  const results = await Z.readBarcodes(imageData, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
  return results.length ? results[0].text : null;
}

function toImageData(source) {
  const w = source.videoWidth || source.width;
  const h = source.videoHeight || source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
