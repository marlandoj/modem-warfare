// QR pixel round-trip in the browser: frame -> base32 -> QR modules on a
// canvas -> ImageData -> decoder (BarcodeDetector if present, else the
// vendored zxing-wasm) -> base32 -> frame. Also decodes a shrunk and slightly
// rotated copy, since a camera never hands back exact pixels.
import { startServer, launch, capture, assert, banner } from './lib.js';

export async function run() {
  banner('qr: encode -> pixels -> decode round-trip');
  const srv = await startServer();
  const { context, close } = await launch();
  const page = await context.newPage();
  const cap = capture(page, 'qr');
  try {
    await page.goto(`${srv.base}/app/`);
    const results = await page.evaluate(async () => {
      const F = await import('./js/frame.js');
      const Q = await import('./js/qr.js');
      const decoder = await Q.prepareDecoder();
      const commit = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);
      const salt = Uint8Array.from({ length: 16 }, (_, i) => (255 - i * 13) & 0xff);
      const fleet = [
        { col: 0, row: 1, horizontal: true }, { col: 6, row: 2, horizontal: false },
        { col: 2, row: 5, horizontal: true }, { col: 4, row: 0, horizontal: false },
      ];
      const cases = {
        handshake: { type: F.TYPE.HANDSHAKE, session: 0xa1b2c3d4, round: 0, commit },
        salvo: { type: F.TYPE.SALVO, session: 0xa1b2c3d4, round: 4, salvo: ['C4', 'E2', 'G7'].map(F.parseCellLabel), results: { present: true, hits: [true, false, true] }, sunk: [false, true, false, false] },
        reveal: { type: F.TYPE.REVEAL, session: 0xa1b2c3d4, round: 11, fleet, salt, sunk: [true, true, false, true] },
      };
      const out = { decoder, cases: {} };
      for (const [name, frame] of Object.entries(cases)) {
        const text = F.frameToText(frame);
        const canvas = document.createElement('canvas');
        const { version, modules, size } = Q.qrToCanvas(text, canvas, { scale: 6 });
        const ctx = canvas.getContext('2d');
        const t0 = performance.now();
        const got = await Q.decodeImage(ctx.getImageData(0, 0, size, size));
        const ms = Math.round(performance.now() - t0);
        // Camera-ish copy: 45% scale, 6 degrees, grey backdrop.
        const c2 = document.createElement('canvas');
        c2.width = 320; c2.height = 320;
        const x2 = c2.getContext('2d');
        x2.fillStyle = '#777'; x2.fillRect(0, 0, 320, 320);
        x2.translate(160, 160); x2.rotate(6 * Math.PI / 180);
        const s = size * 0.45; x2.drawImage(canvas, -s / 2, -s / 2, s, s);
        const got2 = await Q.decodeImage(x2.getImageData(0, 0, 320, 320));
        const back = got ? F.textToFrame(got) : null;
        out.cases[name] = {
          text, version, modules, got, got2, ms,
          roundTrip: got === text,
          roundTripSkewed: got2 === text,
          decoded: back ? F.describeFrame(back) : null,
          bytesEqual: back ? F.bytesEqual(back.bytes, F.encodeFrame(frame)) : false,
        };
      }
      return out;
    });
    console.log('decoder in this browser:', results.decoder);
    for (const [name, r] of Object.entries(results.cases)) {
      console.log(`  ${name}: QR v${r.version}-M (${r.modules}x${r.modules}) text=${r.text}`);
      console.log(`    decoded in ${r.ms} ms -> ${r.got} | skewed copy -> ${r.got2}`);
      console.log(`    frame: ${r.decoded}`);
      assert(r.roundTrip, `${name} straight round-trip`);
      assert(r.roundTripSkewed, `${name} skewed round-trip`);
      assert(r.bytesEqual, `${name} decoded bytes equal encoded bytes`);
      assert(r.version >= 2 && r.version <= 3, `${name} QR version in 2..3`);
    }
    assert(cap.errors.length === 0, 'no console/page errors: ' + cap.errors.join(' | '));
    console.log('qr: PASS');
    return { ok: true, results };
  } finally {
    await close();
    await srv.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('qr-roundtrip.js')) run().catch((e) => { console.error(e); process.exit(1); });
