# Modem Warfare — Radio Silence

Two phones in airplane mode fight a naval war by screaming dial-up noise at
each other. A two-player hidden-fleet duel (7×7, fleet 4/3/2/2, simultaneous
three-shot salvos) for phones with every radio off. Moves cross the table as a
static QR code (the Lamp, the source of truth) or as an audible modem chirp
(the Sonar, the spectacle). No internet, no Wi-Fi, no Bluetooth, no server,
no account. Install once, then never again.

Hackyard Yard #6 (theme: Offline), build week Mon 2026-11-02 → Fri 2026-11-06.
Design is locked in `SPEC.md` (kept in the dispatch workspace, not this repo).

## Status — Monday (day 1)

| deliverable | state |
|---|---|
| PWA shell: six screens, hand-written precache service worker, manifest | done, cold offline launch proven |
| Frame codec (12-byte base32 frame → QR v2–3 EC-M) + round-trip tests | done, 15 unit tests + pixel round-trip |
| Desktop two-window dev harness (BroadcastChannel) | done, handshake + salvo exchange proven |
| Android ggwave spike | page done; browser loopback 10/10; acoustic phone test pending |

Later days (salvo loop, commitment audit and stamp, Sonar integration, Sealed
Orders, feel pass) are honest shells in the UI. Full evidence:
`docs/MONDAY-REPORT.md`.

## Layout

```
app/        the product — vanilla HTML/CSS/JS, no framework, no build step
  sw.js     precache service worker (explicit list; bump VERSION on change)
  js/frame.js   frame codec + receive gate (also runs under Node for tests)
  js/qr.js      QR render (qrcode-generator) and decode (BarcodeDetector → zxing-wasm)
  vendor/   every third-party file the app loads, verbatim (see vendor/VENDOR.md)
dev/        two-window harness — dev tool, not precached
spike/      ggwave Sonar spike — dev tool, not precached
tests/      node --test unit tests + Playwright browser gates
tools/      zero-dependency static server, icon rasteriser
campaign/   Monday task manifests with personas
docs/       the Monday report
```

## Run it

```sh
# serve the repo root (no dependencies)
node tools/serve.js 8080            # http://127.0.0.1:8080/app/
node tools/serve.js 8080 --bind 0.0.0.0   # reachable from phones on the LAN
```

- App shell: `http://<host>:8080/app/` — open once online, wait for the
  Home badge to read **OFFLINE READY ✓ 16/16 CACHED**, add to home screen,
  then switch the radios off.
- Dev harness: `http://<host>:8080/dev/harness.html` — two instances side by
  side; press **Run scripted exchange** or drive them by hand.
- ggwave spike: `http://<host>:8080/spike/` — on two Android phones, one
  **LISTEN (MIC)**, the other **TRANSMIT ×1**; counters are on the page.

Camera and microphone need a secure context: `localhost`, or `https`. On a
LAN, Chrome on Android can be told to trust the laptop's origin via
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, or use a local
TLS proxy. The QR codec and the offline shell do not need either.

## Test it

```sh
npm run test:unit                     # node --test, no dependencies
npm install && npx playwright install chromium
npm run test:browser                  # shell, QR pixels, cold offline launch, harness, spike
npm test                              # both; this is the trusted check in .verity.json
```

The browser runner finds Chromium in `$PLAYWRIGHT_BROWSERS_PATH`, else a
repo-local `.browsers/`, else `../_tools/browsers/` (the factory workspace
layout), else Playwright's default cache. To keep the browsers inside the
repo: `PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium`.

`.verity.json` names `npm test` as the trusted check for the factory's
Verity gate. The gate only honours it at the base revision of a dispatch, so
it takes effect from the first dispatch that starts on top of this commit.

## Claims discipline

Say: no internet, no Wi-Fi, no Bluetooth, no server, no account; install once,
then never again; cheating is provable — the end-of-game stamp is real.
Never say: "secure" or "encrypted" about Sealed Orders (it is plaintext to
anyone who can see the screen, and the app says so), "unhackable", or
"provably fair" as a slogan.

## Licences

Code: MIT. Vendored: qrcode-generator (MIT), zxing-wasm (MIT, over zxing-cpp
Apache-2.0), ggwave (MIT). "QR Code" is a registered trademark of DENSO WAVE.
