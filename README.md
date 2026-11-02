# Modem Warfare — Radio Silence

Two phones in airplane mode fight a naval war by screaming dial-up noise at
each other. A two-player hidden-fleet duel (7×7, fleet 4/3/2/2, simultaneous
three-shot salvos) for phones with every radio off. Moves cross the table as a
static QR code (the Lamp, the source of truth) or as an audible modem chirp
(the Sonar, the spectacle). No internet, no Wi-Fi, no Bluetooth, no server,
no account. Install once, then never again.

Hackyard Yard #6 (theme: Offline), build week Mon 2026-11-02 → Fri 2026-11-06.
Design is locked in `SPEC.md` (kept in the dispatch workspace, not this repo).

## Status — Tuesday (day 2)

| deliverable | state |
|---|---|
| PWA shell: six screens, hand-written precache service worker, manifest | done, cold offline launch proven (19/19 cached) |
| Frame codec (12-byte base32 frame → QR v2–3 EC-M) + round-trip tests | done; WAGER frame added (6-bit text, v3-M) |
| Placement → LOCK fixes the commitment (vendored SHA-256, no SubtleCrypto) | done |
| Handshake: session + commitment both ways, wager shown on both phones | done |
| Salvo round loop over the Lamp: pick 3, exchange, staggered reveal, SUNK, damage | done, playable to the last sinking |
| Endgame: reveal exchange, audit, stamp VERIFIED / LIAR / FORFEIT, rematch | done |
| Desktop two-window dev harness (BroadcastChannel) | plays whole matches, with cheats on demand |
| Android ggwave spike | page done; browser loopback 10/10; acoustic phone test pending |
| Sonar integration, Sealed Orders | Wednesday (honest shells in the UI) |

Proven in the browser: a complete match from placement to stamp over the
harness (VERIFIED on both phones), and LIAR for a false result, a moved
fleet and a wrong salt. Not yet proven: a two-phone match over real
cameras, the BarcodeDetector decode path, the airplane-mode smoke test on
the phones. Reports: `docs/MONDAY-REPORT.md`, `docs/TUESDAY-REPORT.md`.

## How a match goes

1. Both players place a fleet and tap **LOCK**. LOCK draws a 128-bit salt
   and fixes the commitment (first 16 bytes of SHA-256 of fleet ‖ salt).
2. **The Salute.** Host shows its handshake QR; guest scans it, then shows
   its own; host scans that. Each phone now holds the other's commitment.
   The host types the wager and taps SEND; the guest's phone shows it and
   echoes it back. Both tap BEGIN ROUND 1.
3. **Each round.** Pick 3 targets, FIRE. Raise phones face to face: each
   shows its salvo QR and scans the other's. Once a phone has decoded the
   opponent's salvo it re-renders its QR with that salvo's results filled
   in. Hold until both phones chime CONTACT, then tap REVEAL: your shells
   land (splash / splash / HIT, SUNK horn), then theirs on your fleet.
   NEXT ROUND until one fleet's four ships are sunk.
4. **The audit.** Both phones show a REVEAL QR (fleet + salt) and scan the
   other's. Each recomputes the opponent's commitment and replays every
   reported result against the revealed fleet. The stamp says
   **VERIFIED — NO SHIP MOVED**, or **LIAR** with the first finding. A
   player who never reveals forfeits (two taps to claim).

Cameras: the Salute is screen-to-screen, so the scanner opens the **front**
camera; FLIP switches to the rear one. If a phone falls a step behind,
RESEND LAST re-shows the previous frame; the gate treats a repeated frame
as a no-op and an old one as "their phone is a step behind".

## Layout

```
app/        the product — vanilla HTML/CSS/JS, no framework, no build step
  sw.js     precache service worker (explicit list; bump VERSION on change)
  js/frame.js   frame codec + receive gate (also runs under Node for tests)
  js/sha256.js  vendored SHA-256 for the fleet commitment (no SubtleCrypto)
  js/audit.js   end-of-game audit: commitment + every reported result vs the reveal
  js/audio.js   WebAudio feel: lamp clack, contact bell, splash, thud, horn, stamp
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
  Home badge to read **OFFLINE READY ✓ 19/19 CACHED**, add to home screen,
  then switch the radios off.
- Dev harness: `http://<host>:8080/dev/harness.html` — two instances side by
  side; **Run scripted exchange**, **Run full match**, **Run match, B lies**,
  or drive them by hand.
- ggwave spike: `http://<host>:8080/spike/` — on two Android phones, one
  **LISTEN (MIC)**, the other **TRANSMIT ×1**; counters are on the page.

Camera and microphone need a secure context: `localhost`, or `https`. On a
LAN, Chrome on Android can be told to trust the laptop's origin via
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, or use a local
TLS proxy. The QR codec and the offline shell do not need either.

## Test it

```sh
npm run test:unit                     # node --test, no dependencies: codec, sha256, audit
npm install && npx playwright install chromium
npm run test:browser                  # shell, QR pixels, cold offline launch, harness, full match + cheats, spike
npm test                              # both; this is the trusted check in .verity.json
```

The browser runner finds Chromium in `$PLAYWRIGHT_BROWSERS_PATH`, else a
repo-local `.browsers/`, else `../_tools/browsers/`, else a `browsers/`
directory beside the real `node_modules` that holds playwright (the factory
workspace layout), else Playwright's default cache. To keep the browsers inside the
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
