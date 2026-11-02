# Vendored libraries

Everything the app loads at runtime lives in this repository. Nothing is
fetched from a CDN, a font service or an analytics endpoint. Each file below
was copied verbatim from the published npm tarball on 2026-11-02.

| File | Package | Version | Licence | md5 |
|---|---|---|---|---|
| `qrcode-generator.js` | `qrcode-generator` (Kazuhiko Arase) | 2.0.4 | MIT | fbb6b69bce6abf116d6eb147ad5484a5 |
| `zxing/zxing-reader.js` | `zxing-wasm` (`dist/iife/reader/index.js`) | 3.1.6 | MIT (zxing-cpp Apache-2.0) | 614362e15c72f12b4adcdb064848072f |
| `zxing/zxing_reader.wasm` | `zxing-wasm` (`dist/reader/zxing_reader.wasm`) | 3.1.6 | MIT (zxing-cpp Apache-2.0) | 7c2406aa35ecad8cc1c0cb7ec7cb3f61 |
| `ggwave/ggwave.js` | `ggwave` (Georgi Gerganov, Emscripten single-file Wasm build, binary embedded as a data URI) | 0.4.0 | MIT | 4975352f893a2ec550ce17122f24ac15 |

Notes

- `zxing-reader.js` contains a default `locateFile` that points at jsDelivr.
  The app never uses it: `app/js/qr.js` calls `prepareZXingModule` with an
  override that resolves `zxing_reader.wasm` to `./vendor/zxing/` before the
  first decode, and the page's Content-Security-Policy (`connect-src 'self'`)
  would block a CDN fetch anyway.
- `ggwave.js` is not in the Monday precache list; it is loaded by the spike
  page only. Wednesday's Sonar integration adds it to `sw.js`.
- BarcodeDetector is a browser API and needs no vendoring; it is used when the
  browser reports `qr_code` support, otherwise zxing-wasm decodes.
