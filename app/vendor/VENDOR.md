# Vendored libraries

Everything the app loads at runtime lives in this repository. Nothing is
fetched from a CDN, a font service or an analytics endpoint. Each file below
was copied from the published npm tarball on 2026-11-02; all are verbatim
except `ggwave/ggwave.js`, which carries the three documented edits below.

| File | Package | Version | Licence | md5 |
|---|---|---|---|---|
| `qrcode-generator.js` | `qrcode-generator` (Kazuhiko Arase) | 2.0.4 | MIT | fbb6b69bce6abf116d6eb147ad5484a5 |
| `zxing/zxing-reader.js` | `zxing-wasm` (`dist/iife/reader/index.js`) | 3.1.6 | MIT (zxing-cpp Apache-2.0) | 614362e15c72f12b4adcdb064848072f |
| `zxing/zxing_reader.wasm` | `zxing-wasm` (`dist/reader/zxing_reader.wasm`) | 3.1.6 | MIT (zxing-cpp Apache-2.0) | 7c2406aa35ecad8cc1c0cb7ec7cb3f61 |
| `ggwave/ggwave.js` | `ggwave` (Georgi Gerganov, Emscripten single-file Wasm build, binary embedded as a data URI) | 0.4.0 | MIT | verbatim 4975352f893a2ec550ce17122f24ac15 → patched 262f124e74a4340cde1949037d110d74 |

Notes

- `zxing-reader.js` contains a default `locateFile` that points at jsDelivr.
  The app never uses it: `app/js/qr.js` calls `prepareZXingModule` with an
  override that resolves `zxing_reader.wasm` to `./vendor/zxing/` before the
  first decode, and the page's Content-Security-Policy (`connect-src 'self'`)
  would block a CDN fetch anyway.
- `qrcode-generator` converts strings to bytes one char code per byte by
  default; `app/js/qr.js` switches it to the library's own UTF-8 converter
  whenever a caller asks for Byte mode. Frames stay Alphanumeric.
- BarcodeDetector is a browser API and needs no vendoring; it is used when the
  browser reports `qr_code` support, otherwise zxing-wasm decodes.

## ggwave.js: the Wednesday patch (CSP, no `'unsafe-eval'`)

The npm build's Emscripten glue cannot run under the app shell's policy
(`script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`) as published:
embind compiles JavaScript source at init, and the glue `fetch()`es its own
`data:` URI. Rather than relax the policy, `tools/patch-ggwave.js` applies
three edits to the vendored file (idempotent; re-run it to verify):

1. `createNamedFunction` — embind wraps every constructor in `new Function(...)`
   purely to give it a readable name. Replaced by Emscripten's own
   `-sDYNAMIC_EXECUTION=0` form of the same helper:
   `Object.defineProperty(body, "name", { value: name })`.
2. `getBinaryPromise` — the web branch tried `fetch(wasmBinaryFile)` (then
   XHR) even for a `data:` URI; `connect-src 'self'` refuses that with a
   console error before the code falls back to decoding the URI inline.
   Guarded with `!isDataURI(wasmBinaryFile)`, as newer Emscripten does, so
   the embedded binary is decoded from the string and nothing is requested.
3. `craftInvokerFunction` — embind assembled each bound function's invoker as
   source text and compiled it with `new_(Function, ...)`. Replaced by the
   closure Emscripten emits with `-sDYNAMIC_EXECUTION=0`: the same
   argument-count check, `toWireType` on `this` and each argument, the call,
   the destructors, `fromWireType` on the result.

After the edits the file has no `new Function`, `Function(` or `eval(` call
site (the patch tool and `tests/browser/sonar.js` both assert it), and the
module loads, encodes and decodes under the unchanged shell CSP with zero
console errors (`tests/browser/sonar.js`). The spike page (`/spike/`), which
had allowed `'unsafe-eval'` for the verbatim file, runs the patched file too.
The wasm binary itself is untouched.
