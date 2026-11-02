# Modem Warfare — Monday report (Hackyard Yard #6, day 1, 2026-11-02)

Campaign: Monday build — PWA shell, QR codec, dev harness, ggwave spike.
Executed as five persona-scoped tasks in dependency order (`campaign/`),
sequentially by one executor under a no-delegation policy.

## 1. Staged-input integrity check

Computed with `md5sum` against both the seeded copy in the task workspace and
the staging source `/opt/zouroboros/factory-dispatch/staging/modem-warfare`.

| file | expected | measured | result |
|---|---|---|---|
| `SPEC.md` | `4942abb2480094601e36c9e963aac6c0` | `4942abb2480094601e36c9e963aac6c0` | match |
| `mockups/mockup-1-home.webp` | `3ff428dbe55d0f392ca70cdee379e07c` | `3ff428dbe55d0f392ca70cdee379e07c` | match |
| `mockups/mockup-4-salute.webp` | `6dbf235ffab5ebad8bf91aeef7e52350` | `6dbf235ffab5ebad8bf91aeef7e52350` | match |

Result: **PASS** on all three, identical in workspace and staging. The mockup
images were used as design reference only; none is bundled in the app.

## 2. End-of-Monday bar, item by item

### 2a. App shell launches cold in airplane mode from a clean profile — PASS

Method (automated in `tests/browser/offline.js`, run in headless Chromium
156 via Playwright):

1. Fresh Chromium profile in a temp directory (no cache, no service-worker
   registration).
2. Online: load `/app/` once from the repo's zero-dependency static server.
   Wait for the Home badge to report READY. The badge is driven by a
   `CACHE_STATUS` message to the service worker, which checks each of its 16
   precache URLs with `cache.match` and reports any that are missing.
3. Close the browser process. **Stop the HTTP server** (a `fetch` to the URL
   now throws connection refused). Relaunch the same profile in a new browser
   process with Playwright's offline network emulation on.
4. Navigate to the app URL. Record every response's `fromServiceWorker()`.
   Then drive NEW MATCH → LOCK (handshake QR from the cached QR library) and
   warm the decoder (zxing wasm from cache).

Output (verbatim, `docs/evidence/browser-gates.txt`):

```
=== offline: cold launch from precache with the network gone ===
phase 1 (online install): OFFLINE READY ✓ 16/16 CACHED version mw-mon-v3 missing []
phase 2: server stopped (connection refused), relaunching the same profile with offline emulation
cold launch: navigator.onLine = false | title = Modem Warfare — Radio Silence | badge = OFFLINE READY ✓ 16/16 CACHED
offline decoder warm-up: zxing-wasm
responses: 10, from service worker: 10
  SW  200 /app/
  SW  200 /app/css/app.css
  SW  200 /app/vendor/qrcode-generator.js
  SW  200 /app/js/app.js
  SW  200 /app/js/fleet.js
  SW  200 /app/js/qr.js
  SW  200 /app/js/frame.js
  SW  200 /app/js/scanner.js
  SW  200 /app/vendor/zxing/zxing-reader.js
  SW  200 /app/vendor/zxing/zxing_reader.wasm
offline: PASS
```

Screenshot of the cold offline Home: `docs/evidence/offline-cold-home.png`.

What this does not cover: a physical phone with the airplane toggle. The
headless run has no network at two layers (server down, emulation on), which
is strictly harder than airplane mode for the browser, but the daily smoke
test on the two Android phones (install, toggle airplane, relaunch from the
home-screen icon) still has to be run by the operator on Tuesday morning.

### 2b. Frame round-trip tests pass — PASS

Unit tests (`node --test tests/frame.test.js`, no dependencies), 15/15:

```
#   handshake text: CGQ3FQ6UAD777QAACAFTAVL2T7COSDRTLB62FR7MCE3ME -> HANDSHAKE s=a1b2c3d4 r=0 · commit 0b30557a…
#   salvo text: CKQ3FQ6UAROLYLACABKA -> SALVO s=a1b2c3d4 r=4 · salvo C4 E2 G7 · results HIT/miss/HIT · sunk 3
#   reveal text: COQ3FQ6UBP777QALCQDZCXAA77ZOLWGLX2Y2JF4KPVYGGVSJHQQQ -> REVEAL s=a1b2c3d4 r=11 · sunk 4,3,2 · fleet A2h G3v C6h E1v
ok 1 - base32: RFC 4648 vectors (unpadded)
ok 2 - crc8: known value and single-bit sensitivity
ok 3 - salvo frame is exactly 12 bytes / 20 base32 chars
ok 4 - round-trip: handshake frame (session + commitment placeholder)
ok 5 - round-trip: salvo frame with piggybacked results and sunk flags
ok 6 - round-trip: salvo frame without results (first salvo of a round) and partial salvo
ok 7 - round-trip: reveal frame (packed fleet + 16-byte salt)
ok 8 - fleet packing is lossless for every corner
ok 9 - encode(decode(x)) is byte-identical for all representative frames
ok 10 - corruption: a flipped bit fails the check byte; wrong version/type rejected
ok 11 - gate: handshake binds the session, duplicate re-scan is a no-op
ok 12 - gate: salvo round flow — accept expected, no-op on identical, reject stale and future
ok 13 - gate: wrong session, undecodable text, and late handshake are rejected without state change
ok 14 - gate: reveal frame accepted at the expected round
ok 15 - cell labels
# tests 15
# pass 15
# fail 0
```

Test 11 proves a re-scanned identical frame returns `duplicate` and leaves
the accepted frame untouched; test 12 proves a stale round is rejected with
`STALE_ROUND` (and a future round with `FUTURE_ROUND`) without touching
state.

Pixel-level round-trip in the browser (`tests/browser/qr-roundtrip.js`):
each representative frame rendered to QR modules on a canvas, read back as
`ImageData`, decoded by the vendored zxing-wasm reader (headless Chromium has
no BarcodeDetector), re-parsed and compared byte-for-byte. A 45%-scaled,
6°-rotated copy on a grey backdrop also decodes.

```
decoder in this browser: zxing-wasm
  handshake: QR v3-M (29x29) text=CGQ3FQ6UAD777QAACAFTAVL2T7COSDRTLB62FR7MCE3ME
    decoded in 37 ms -> CGQ3FQ6UAD777QAACAFTAVL2T7COSDRTLB62FR7MCE3ME | skewed copy -> CGQ3FQ6UAD777QAACAFTAVL2T7COSDRTLB62FR7MCE3ME
  salvo: QR v2-M (25x25) text=CKQ3FQ6UAROLYLACABKA
    decoded in 3 ms -> CKQ3FQ6UAROLYLACABKA | skewed copy -> CKQ3FQ6UAROLYLACABKA
  reveal: QR v3-M (29x29) text=COQ3FQ6UBP777QALCQDZCXAA77ZOLWGLX2Y2JF4KPVYGGVSJHQQQ
    decoded in 5 ms -> COQ3FQ6UBP777QALCQDZCXAA77ZOLWGLX2Y2JF4KPVYGGVSJHQQQ | skewed copy -> COQ3FQ6UBP777QALCQDZCXAA77ZOLWGLX2Y2JF4KPVYGGVSJHQQQ
qr: PASS
```

Frame format as built (`app/js/frame.js`): 11-byte header (version/type,
uint32 session, round, three 6-bit salvo cells, 3-bit results bitmask with a
presence flag, 4 sunk flags, extension length) + extension + CRC-8 check
byte. SALVO = exactly 12 bytes → 20 base32 chars → QR v2-M. HANDSHAKE
carries a 16-byte commitment (28 bytes, v3-M); REVEAL carries the packed
fleet + 16-byte salt (32 bytes, v3-M). The encoder refuses anything outside
v2–3.

### 2c. Dev harness exchanges a handshake and a salvo frame — PASS

`dev/harness.html` hosts `app/index.html?dev=A` (host) and `?dev=B` (guest).
`dev/channel.js` mirrors each rendered frame's base32 text on
BroadcastChannel and feeds received text into the app's one decode entry
point, so the identical codec and gate run. The scripted exchange
(`tests/browser/harness.js`) output:

```
A received: SALVO s=a20a7bbd r=1 · salvo A1 B2 C3 · results miss/miss/miss
B received: SALVO s=a20a7bbd r=1 · salvo C4 E2 G7 · results miss/miss/miss
A gate log: [{"status":"accepted","reason":"HANDSHAKE","round":0,"type":"HANDSHAKE"},{"status":"accepted","reason":"SALVO","round":1,"type":"SALVO"},{"status":"accepted","reason":"SALVO","round":1,"type":"SALVO"},{"status":"duplicate","reason":"IDENTICAL_FRAME","round":1,"type":"SALVO"}]
B gate log: [{"status":"accepted","reason":"HANDSHAKE","round":0,"type":"HANDSHAKE"},{"status":"duplicate","reason":"IDENTICAL_FRAME","round":0,"type":"HANDSHAKE"},{"status":"accepted","reason":"SALVO","round":1,"type":"SALVO"},{"status":"accepted","reason":"SALVO","round":1,"type":"SALVO"},{"status":"duplicate","reason":"IDENTICAL_FRAME","round":1,"type":"SALVO"}]
harness: PASS
```

Zero rejected frames, zero console or page errors in either instance; the
duplicates are the spec'd no-ops (each side re-broadcasts its frame on
re-render and the other side correctly ignores the identical bytes). An
earlier standalone run with random fleets produced real hits
(`results HIT/miss/miss`), so the piggybacked results path is exercised too.
Screenshot: `docs/evidence/harness.png`.

### 2d. ggwave spike decodes its own transmissions in the browser — PASS (browser), phones pending

See section 3 for the exact boundary. Counts from the full-suite run:

```
mic settings: {"autoGainControl":false,"channelCount":2,"deviceId":"default","echoCancellation":false,...,"noiseSuppression":false,"sampleRate":44100,...}
  mic opened: {"echoCancellation":false,"noiseSuppression":false,"autoGainControl":false,"sampleRate":44100}
  mic closed
  transmit CKQ3FQ6UAROLYLAAAB7A (2.09 s)
  mic opened: ...
WebAudio MediaStream loopback: {"a":10,"d":9}
direct buffer: {"a":10,"d":10}
spike: PASS (webaudio 9/10, direct 10/10; acoustic path NOT tested here)
```

Three runs on the same machine: standalone 10/10, then 9/10 and 8/10 when
run last in the full suite (`npm test`). Every miss was a timeout, never a
wrong decode, and direct buffer was 10/10 every time; see section 6 for what
the misses under load imply.

### 2e. Repository committed — PASS

See section 4.

## 3. ggwave spike verdict — boundary stated exactly

**Verdict: the sound channel is NOT cut on Monday. The spike did not fail;
its in-browser half passed. The acoustic half is unmeasured until the two
Android phones run it.**

Proven in the browser (headless Chromium 156, Linux, AudioContext at 48 kHz):

- The vendored ggwave 0.4.0 Wasm build loads and initialises.
- The real SALVO frame text (`CKQ3FQ6UAROLYLAAAB7A`, 20 chars) encodes with
  `GGWAVE_PROTOCOL_AUDIBLE_FAST` to a 2.09 s waveform, inside the spec's 2–4 s
  airtime envelope.
- Direct buffer loopback (encoder output fed to the decoder in 1024-sample
  chunks): 10/10 decodes, each parsed back to a frame byte-identical to the
  one sent.
- WebAudio MediaStream loopback (waveform played through an
  `AudioBufferSourceNode` into a `MediaStreamDestination`, captured through a
  `MediaStreamSource` and the same `ScriptProcessorNode` pipeline the
  microphone path uses, no microphone involved): 10/10 standalone, 9/10 and
  8/10 under full-suite load (timeouts, never a wrong decode).
- `getUserMedia` with `echoCancellation`, `noiseSuppression` and
  `autoGainControl` all `false` is accepted and the track settings read back
  `false/false/false`.
- The transmit path closes the microphone before playing and reopens it
  afterwards (log lines quoted above).

Not proven, needs the operator's two physical Android phones (Jordan's is a
Galaxy S25+):

- Any acoustic path: speaker → air → microphone, on one device or two.
  Headless Chromium's microphone is a synthetic fake device, so no mic decode
  was counted and none is claimed.
- Android Chrome's real sample rate, speaker roll-off, and whether its audio
  stack honours the three constraints on actual hardware.
- Decode rate at 30 cm and 1 m in kitchen noise (the Wednesday 18:00
  kill-switch bar of 8 of 10 at 1 m is a phone measurement, not a browser one).
- Latency of the two-phone exchange and whether volume ≥ 70% is enough.

How to measure it (both phones, spike page open): phone A **LISTEN (MIC)**,
phone B **TRANSMIT ×1** ten times at 30 cm, then ten at 1 m; B's transmit
counter is the attempt count, A's "mic decodes" counter is the decode count,
and A's HEARD line shows the decoded frame. The **SPEAKER→MIC ×N** mode on a
single phone gives a quick first signal; it keeps the mic open during
playback and says so on the page.

## 4. Repository

- Location: `/opt/zouroboros/factory-workspaces/t_0aa85385/modem-warfare`
- Branch: `main`
- Latest code commit before this report: `19fb9ec` ("browser gates: shell,
  QR pixel round-trip, cold offline launch, harness, spike"). This report,
  the README, the suite runner and the evidence folder follow in the next
  commit; `git log --oneline` lists the full sequence.

Commits, oldest first: frame codec → PWA shell → dev harness → ggwave spike
page → browser gates and campaign manifests → docs and evidence.

## 5. How the operator runs it

```sh
cd modem-warfare
node tools/serve.js 8080 --bind 0.0.0.0
```

- Shell: `http://<laptop-ip>:8080/app/` on each phone. Wait for **OFFLINE
  READY ✓ 16/16 CACHED**, add to home screen, enable airplane mode, relaunch
  from the icon. Camera scanning needs a secure context (`localhost`, `https`,
  or Chrome's `#unsafely-treat-insecure-origin-as-secure` flag for the
  laptop's origin); the shell, codec and the TYPE fallback do not.
- Spike: `http://<laptop-ip>:8080/spike/` (same secure-context note for the
  microphone). The page is not precached; it is a dev tool.
- Harness: `http://127.0.0.1:8080/dev/harness.html` on the laptop.
- Tests: `npm run test:unit`; `npm install && npx playwright install chromium
  && npm run test:browser` (writes `test-output/browser-gates.txt` and
  screenshots).

## 6. What Monday exposed that changes the Tuesday plan

1. **Results-field semantics need a decision before the salvo loop.** The
   spec says a frame piggybacks "my new salvo + the results of your last
   salvo" and also that each phone "re-renders its frame with results filled
   in once it has decoded the opponent's". Monday implemented the second
   reading: the results field reports the opponent's salvo of the *same*
   round, set after decoding theirs, so a round is two scans per phone
   (plain frame, then result-bearing frame). The gate already accepts a
   same-round frame with new bytes. If Tuesday prefers one scan per round,
   the results field should instead carry the previous round's results and
   the reveal moves one round later; the codec needs no change either way.
2. **Commitment fits only if truncated to 128 bits.** A full SHA-256
   commitment (32 bytes) pushes the handshake past QR v3-M. Monday carries
   the first 16 bytes of SHA-256(packed fleet ‖ 128-bit salt), which is
   adequate for a kitchen-table audit. The reveal frame (fleet + 16-byte
   salt, 32 bytes) fits v3-M with room for 6 more bytes. Tuesday's audit just
   recomputes and compares; no new frame type is needed.
3. **SubtleCrypto needs a secure context.** `crypto.subtle` is absent on a
   plain-http LAN origin, so the commitment falls back to zeros there.
   Tuesday must either run the phones from `localhost`/`https`/the
   secure-origin flag or vendor a tiny SHA-256 (about 60 lines) so the
   commitment works everywhere. Recommend vendoring: the game must not depend
   on how it was served.
4. **ggwave needs `'unsafe-eval'`.** The npm Wasm build's embind glue
   evaluates a string at init. The app shell's CSP is `'self'` +
   `'wasm-unsafe-eval'` and loads fine; the spike page had to add
   `'unsafe-eval'`. Wednesday's Sonar integration either accepts that in the
   app CSP (still `'self'` only, nothing leaves the device) or rebuilds
   ggwave with `-sDYNAMIC_EXECUTION=0`. Not a Tuesday blocker, but it
   decides whether Tuesday's shell CSP stays as is.
5. **ScriptProcessorNode is a main-thread risk.** The missed loopbacks
   under suite load (10/10 → 9/10 → 8/10 as the machine got busier) point at
   the deprecated `ScriptProcessorNode` capture path; an `AudioWorklet` (needs the decoder in the worklet or a ring buffer
   to the main thread) is the robust Wednesday choice. On phones the Salute
   animation and the chirp decoder will share the main thread.
6. **BarcodeDetector is untested.** Headless Chromium lacks it, so only the
   zxing-wasm fallback has run. Android Chrome exposes BarcodeDetector via
   Play Services; Tuesday's first on-phone scan should check which decoder the
   scanner status line reports and the decode time at 20 cm.
7. **Guest flow ordering.** JOIN MATCH currently sends the guest through
   placement before the handshake scan, and the guest's own handshake QR only
   renders once the host's session is known. That matches the two-scan
   handshake but means both players place fleets before the first scan;
   Tuesday should confirm the table choreography (place first, or scan first)
   before wiring the commitment, since the commitment must be fixed before the
   handshake frame renders.
