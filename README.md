# Modem Warfare — Radio Silence

Two phones in airplane mode fight a naval war by screaming dial-up noise at
each other. A two-player hidden-fleet duel (7×7, fleet 4/3/2/2, simultaneous
three-shot salvos) for phones with every radio off. Moves cross the table as a
static QR code (the Lamp, the source of truth) or as an audible modem chirp
(the Sonar, the spectacle). No internet, no Wi-Fi, no Bluetooth, no server,
no account. Install once, then never again.

Hackyard Yard #6 (theme: Offline), build week Mon 2026-11-02 → Fri 2026-11-06.
Design is locked in `SPEC.md` (kept in the dispatch workspace, not this repo).

## Status — Thursday (day 4)

The first real-phone playtest (two Android phones, 2026-11-02) decoded 10
of 10 chirps and produced three rulings, now built in: **transport is a
pre-game setting** (CHIRP by default, QR the alternative; the host's choice
rides the handshake and the joiner adopts it; inside a match only that
carrier is presented), **there is no wager**, and **match play never
scrolls** (placement, handshake, round and game over fit a fixed viewport,
asserted at 360×740 and 412×915). Report: `docs/THURSDAY-REPORT.md`.

| deliverable | state |
|---|---|
| PWA shell: six screens, hand-written precache service worker, manifest | done, cold offline launch proven (25/25 cached, `mw-thu-v1`; QR library, decoder wasm and ggwave all served from the cache) |
| Frame codec (12-byte base32 frame → QR v2–3 EC-M) + round-trip tests | done; HANDSHAKE carries the transport in a reserved nibble (no extra bytes); the family is HANDSHAKE / SALVO / REVEAL |
| Placement → LOCK fixes the commitment (vendored SHA-256, no SubtleCrypto) | done |
| Transport setting on Home; the handshake carries it; the joiner adopts it; one carrier per match | done, proven both directions in the harness; a whole match plays by chirp alone |
| Handshake: session + commitment both ways | done |
| One unmoved screen: match play fits a fixed viewport, never scrolls | done, 60 measurements at two Android viewports, in both modes |
| The feel: tightened reveal, splash rings and screen-shake, ships sink cell by cell, sweep runs while listening, the stamp lands with a thud | done (seen in headless Chromium; felt only on phones) |
| Salvo round loop over the Lamp: pick 3, exchange, staggered reveal, SUNK, damage | done, playable to the last sinking |
| Endgame: reveal exchange, audit, stamp VERIFIED / LIAR / FORFEIT, rematch | done |
| Desktop two-window dev harness (BroadcastChannel) | plays whole matches, chirps and cards, with cheats on demand |
| Sonar in the match: CHIRP / LISTEN row under the lamp, AudioWorklet mic capture, sweep, near-miss drama | done in the browser (chirp round-trip 10/10, Salute by chirp alone); acoustic phone test pending |
| The kill switch: one flag, `app/js/config.js` line 17 | done; match proven VERIFIED with the flag ON and OFF |
| WebAudio feel: fire, splash, hit, damage, sinking horn, stamp, victory sting + vibration | done (heard only on phones) |
| Sealed Orders: compose, one static QR, scan-to-keep, mark done, pass it on, print | done in the browser; camera scan of a card pending on phones |

Proven in the browser: a complete match from placement to stamp over the
harness (VERIFIED on both phones) in QR mode, in chirp mode with the text
transport muted (every frame a chirp through the production capture
pipeline), and with sound off; LIAR for a false result, a moved fleet and a
wrong salt; a Sealed Orders card kept, marked, reloaded and passed on at hop
2; no match screen scrolls at 360×740 or 412×915. Proven on phones: the
acoustic path (10 of 10 chirps, 2026-11-02). Not yet proven on phones: this
build's layout and feel, a two-phone match over real cameras, the
BarcodeDetector decode path, the airplane-mode smoke test.
Reports: `docs/MONDAY-REPORT.md`, `docs/TUESDAY-REPORT.md`,
`docs/WEDNESDAY-REPORT.md`, `docs/THURSDAY-REPORT.md`.

### The transport setting

Home → TRANSPORT: **CHIRP** (default) or **QR**. It is set before the match
and persisted on the phone. The host's choice goes into its handshake frame
(byte 9, high nibble) and the joining phone adopts it for that match, so
both phones always play the same carrier; inside a match only that carrier
is presented — the other one appears nowhere. A failed chirp is chirped
again (the gate makes repeats harmless); there is no mid-match switch. TYPE
(paste the other phone's frame text) stays on every Salute screen as the
carrier-neutral manual entry, not a transport.

### The sound flag

`app/js/config.js`, line 17: `export const SOUND = true;`. Set it to `false`
and every sound affordance leaves the interface at boot (no Sonar row, no
CHIRP / LISTEN, no CHIRP transport choice, no effects, no AudioContext is
ever created); the only transport is QR and the match plays by QR alone. `tests/browser/soundflag.js` plays a whole match that way and
asserts the absence. Vibration is haptic, not sound, and stays.

### Sonar, in one paragraph

In chirp mode the handshake, exchange and reveal screens show the SONAR
row: the frame text being carried, the sweep, and **CHIRP**, which plays
the frame as a ggwave chirp (audible FAST protocol, ~2.1 s for a salvo,
~3.5 s for a handshake). The microphone opens by itself on those screens
(echo cancellation, noise suppression and gain control off) through an
AudioWorklet and decodes on the main thread; **STOP / LISTEN** toggles it.
A decoded chirp goes through the same gate as a scan: HEARD ✓, HEARD AGAIN,
or NEAR MISS · CHIRP AGAIN. The frame and its audit are the truth whichever
carrier moved it; a chirp can only ever cost a re-send.

### Sealed Orders, in one paragraph

Home → SEALED ORDERS → NEW CARD: pick a household label, write a note (up to
700 characters) and a checklist (up to 8 lines of 40). SHOW CARD keeps the
card on this phone and renders it as one static QR (byte mode, up to v30-M).
The other phone: SEALED ORDERS → SCAN CARD; the card is kept there, items can
be ticked off, and PASS IT ON re-renders it with the hop count bumped. Over
the limit, the form refuses with the count and the limit; nothing is cut.
The standing label is **LOCAL, NOT SECRET**.

## How a match goes

0. On Home, pick the transport: CHIRP (phones flat, speaker to mic) or QR
   (phones face to face). The host's choice wins; the guest's phone adopts
   it at the Salute.
1. Both players place a fleet and tap **LOCK**. LOCK draws a 128-bit salt
   and fixes the commitment (first 16 bytes of SHA-256 of fleet ‖ salt).
2. **The Salute.** By chirp: the guest's phone is listening; the host taps
   CHIRP; the guest's phone adopts the session and shows its own frame; the
   guest taps CHIRP back. By QR: host shows its handshake QR, guest scans
   it, then shows its own; host scans that. Each phone now holds the
   other's commitment. Both tap BEGIN ROUND 1.
3. **Each round.** Pick 3 targets, FIRE. Exchange over the one carrier:
   each phone carries its salvo frame; once it has decoded the opponent's
   salvo it re-renders its frame with that salvo's results filled in and
   carries it again. When both phones show CONTACT, tap REVEAL: your shells
   land (splash / splash / HIT, SUNK horn, the ship goes under), then theirs
   on your fleet. NEXT ROUND until one fleet's four ships are sunk.
4. **The audit.** Both phones carry a REVEAL frame (fleet + salt). Each
   recomputes the opponent's commitment and replays every reported result
   against the revealed fleet. The stamp lands: **VERIFIED — NO SHIP
   MOVED**, or **LIAR** with the first finding. A player who never reveals
   forfeits (two taps to claim).

Cameras (QR mode): the Salute is screen-to-screen, so the scanner opens the
**front** camera; FLIP switches to the rear one. If a phone falls a step
behind, RESEND re-shows the previous frame; the gate treats a repeated
frame as a no-op and an old one as "their phone is a step behind".

## Layout

```
app/        the product — vanilla HTML/CSS/JS, no framework, no build step
  sw.js     precache service worker (explicit list; bump VERSION on change)
  js/config.js  the build switches: SOUND (the kill switch), one line
  js/frame.js   frame codec + receive gate (also runs under Node for tests)
  js/sha256.js  vendored SHA-256 for the fleet commitment (no SubtleCrypto)
  js/audit.js   end-of-game audit: commitment + every reported result vs the reveal
  js/audio.js   WebAudio feel: lamp clack, contact bell, fire, splash, hit, damage, horn, stamp, victory
  js/sonar.js   the Sonar engine: ggwave chirp send, AudioWorklet mic capture, decode → gate
  js/sonar-worklet.js  the AudioWorklet capture module (precached)
  js/orders.js  Sealed Orders codec, limits, localStorage store (also runs under Node)
  js/orders-ui.js  Sealed Orders screen: list, compose, card, scan
  js/qr.js      QR render (qrcode-generator) and decode (BarcodeDetector → zxing-wasm)
  vendor/   every third-party file the app loads (see vendor/VENDOR.md; ggwave carries a documented CSP patch)
dev/        two-window harness — dev tool, not precached
spike/      ggwave Sonar spike — dev tool, not precached
tests/      node --test unit tests + Playwright browser gates
tools/      zero-dependency static server, icon rasteriser, ggwave patch tool
campaign/   task manifests with personas (Monday T1–T5, Tuesday T6–T10, Wednesday T11–T15, Thursday T16–T19)
docs/       the daily reports and their evidence
```

## Run it

```sh
# serve the repo root (no dependencies)
node tools/serve.js 8080            # http://127.0.0.1:8080/app/
node tools/serve.js 8080 --bind 0.0.0.0   # reachable from phones on the LAN
```

- App shell: `http://<host>:8080/app/` — open once online, wait for the
  Home badge to read **OFFLINE READY ✓ 25/25 CACHED**, add to home screen,
  then switch the radios off.
- Dev harness: `http://<host>:8080/dev/harness.html` — two instances side by
  side; **Run scripted exchange**, **Run full match (QR)**, **Run full match
  (chirp)**, **Run match, B lies**, **Run chirp loopback**, **Run Sealed
  Orders**, or drive them by hand.
- ggwave spike: `http://<host>:8080/spike/` — on two Android phones, one
  **LISTEN (MIC)**, the other **TRANSMIT ×1**; counters are on the page.

Camera and microphone need a secure context: `localhost`, or `https`. On a
LAN, Chrome on Android can be told to trust the laptop's origin via
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, or use a local
TLS proxy. The QR codec and the offline shell do not need either.

## Test it

```sh
npm run test:unit                     # node --test, no dependencies: codec, sha256, audit, sealed orders
npm install && npx playwright install chromium
npm run test:browser                  # shell, QR pixels, cold offline launch, harness, full match + cheats, spike,
                                      # sonar (chirp round-trip), soundflag (match with SOUND=false), orders,
                                      # transport (setting, adoption, match by chirp alone, no wager), viewport (no scroll)
npm test                              # both; this is the trusted check in .verity.json (about 2½ minutes: the browser gates run in 4 lanes; MW_LANES=1 runs them one after another, about 7 minutes)
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
"provably fair" as a slogan. The Sealed Orders screen's only label on the
subject is "LOCAL, NOT SECRET"; `tests/browser/orders.js` asserts that the
words secret, secure and encrypted appear nowhere else in its copy.

## Licences

Code: MIT. Vendored: qrcode-generator (MIT), zxing-wasm (MIT, over zxing-cpp
Apache-2.0), ggwave (MIT). "QR Code" is a registered trademark of DENSO WAVE.
