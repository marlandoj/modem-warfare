# Modem Warfare — Wednesday report (Hackyard Yard #6, day 3)

Campaign: Wednesday build — Sonar integration, the sound kill switch,
AudioWorklet microphone capture under the unchanged shell policy, Sealed
Orders as a full feature. Dispatched the evening of 2026-11-02 (task
`t_724bedd3`) on top of Tuesday's repository, seeded at the workspace root.

Executed as five persona-scoped manifests (`campaign/T11`–`T15`),
sequentially by one executor under the dispatch's no-delegation policy (the
write scopes overlap in `app/js/app.js`, `app/index.html`, `app/css/app.css`
and `app/sw.js`). The factory's swarm gate scored the scoped plan SUGGEST
(0.42); the policy ruled.

## 1. The sound flag — file and line

**`app/js/config.js`, line 17: `export const SOUND = true;`**

That is the whole kill switch. To cut sound, change that one line to
`export const SOUND = false;`. Nothing else changes, in any file.

What hangs off it, and how it is removed cleanly:

| behaviour | with `SOUND = false` |
|---|---|
| the AudioContext (`app/js/audio.js`) | never constructed; every effect call is a no-op |
| the WebAudio feel (lamp clack, contact bell, fire, splash, hit, damage, horn, stamp, victory, defeat, ping, near-miss) | silent, by the line above |
| chirp send, chirp listen (`app/js/sonar.js`) | engine disabled; ggwave is never loaded, the microphone is never requested |
| the Sonar row on the handshake, exchange and reveal screens (CHIRP / LISTEN, sweep, status, HEARD line) | the three `data-needs-sound` elements are removed from the document at boot, before any wiring (`app/js/app.js`, "The kill switch, applied before anything is wired") — no dead button, no greyed tile, no leftover label |
| vibration | stays: it is haptic, not sound (SPEC.md: iOS has no Vibration API, sound carries it there; the reverse holds for a phone on mute) |
| the precache list (`app/sw.js`) | unchanged: ggwave and the worklet are precached whatever the flag says, so flipping it never changes the cache name or the offline count |

Proven both ways, by the scripted match gate, not by eyeball:

- flag ON (the committed default): `tests/browser/match.js` — clean match
  VERIFIED on both phones plus the three LIAR cheats, exactly as Tuesday.
- flag OFF: `tests/browser/soundflag.js` serves `config.js` as the one-line
  flip (a per-path override in the test server; the repository is not
  edited), plays the same clean match through the harness, and then audits
  both instances' documents:

```
match with SOUND=false: 6 rounds in 15.7 s, outcome {"a":{"result":"win","finalRound":6},"b":{"result":"loss","finalRound":6}}
stamps: {"a":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified"},"b":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified"}}
instance A: data-needs-sound=0 sonar rows=0 chirp/listen buttons=0 AudioContexts=0 ggwave=undefined
instance B: data-needs-sound=0 sonar rows=0 chirp/listen buttons=0 AudioContexts=0 ggwave=undefined
exchange panel with SOUND=false: SALVO · ROUND 1 · QR v2-M · … BRIGHTNESS UP · HOLD STEADY · HOLD UNTIL BOTH PHONES CHIME SCANNER IDLE SCAN FLIP TYPE WAITING FOR CONTACT…
soundflag: PASS (SOUND=false: VERIFIED both ways, zero sound affordances, zero AudioContexts)
```

The assertions behind those lines: no element marked `data-needs-sound`
survives boot; no `[data-sonar]` row and no CHIRP / LISTEN button exists;
no screen's text, no button and no title/label/placeholder contains any of
SONAR, CHIRP, LISTEN, MIC, MICROPHONE, SOUND, AUDIO, MUTE, VOLUME, SPEAKER;
an init script wrapping `AudioContext` in every frame counted zero
constructions through the whole match; `ggwave_factory` was never defined.
(The phrase "HOLD UNTIL BOTH PHONES CHIME" is Tuesday's lamp hint; the chime
it refers to is the contact bell, which this flag silences. Thursday's feel
pass should reword it for the OFF build — it is copy, not an affordance.)

## 2. Chirp integration — the numbers

The spike's code path (`spike/spike.js`) is now the app's (`app/js/sonar.js`):
same protocol (`GGWAVE_PROTOCOL_AUDIBLE_FAST`), same volume (50), same
microphone constraints (echoCancellation / noiseSuppression /
autoGainControl all off), same close-the-mic-before-transmit rule, the same
48 kHz AudioContext — now the one `audio.js` already owned, shared with the
feel. The chirp carries the same base32 text the QR carries and enters
through `routeText → injectText → FrameGate`, so a misheard chirp is a
rejection or a duplicate, never state.

Gate `tests/browser/sonar.js`, in the two-window harness with the text
transport **muted** on both instances (so the only carrier is the chirp,
carried as waveform samples into the peer's loopback capture graph —
MediaStream → AudioWorklet → ggwave → routeText → gate; only the air is
replaced). Output, verbatim:

```
capture mode: worklet | sample rate: 48000
handshake A→B by chirp: {"sent":"CGMNVPMJAD777QAACAGSU646VAYCMBSZYB3B2W5X2BMPW","heard":"CGMNVPMJAD777QAACAGSU646VAYCMBSZYB3B2W5X2BMPW","identical":true,"status":"accepted","airtimeSeconds":3.498666666666667,"ms":3663,"sampleRate":48000,"capture":"worklet"}
handshake B→A by chirp: {"sent":"CGMNVPMJAD777QAACDHPCIYXYJAYHNCMWMHGVZLXLEFOA","heard":"CGMNVPMJAD777QAACDHPCIYXYJAYHNCMWMHGVZLXLEFOA","identical":true,"status":"accepted","airtimeSeconds":3.498666666666667,"ms":3571}
salvo chirps: 10/10 decoded, 10 identical, airtime 2.09 s, latencies ms [2107,2111,2112,2113,2104,2112,2103,2104,2113,2133]
B holds: SALVO s=98dabd89 r=1 · salvo C4 E2 G7 | gates: {"a":{"accepted":1,"duplicate":0,"rejected":0,"rejectedReasons":{}},"b":{"accepted":2,"duplicate":9,"rejected":0,"rejectedReasons":{}}}
sonar: PASS (worklet capture; handshakes by chirp both ways; salvo 10/10 identical; acoustic path NOT tested here)
```

Read as:

| number | value | note |
|---|---|---|
| Salute by chirp alone, A → B | identical frame, gate `accepted`, B adopted A's session | the text transport was muted; nothing else could have carried it |
| Salute by chirp alone, B → A | identical, `accepted`, A holds B's commitment | |
| handshake airtime (45 chars) | 3.50 s | marker tones included |
| salvo airtime (20 chars) | 2.09 s | the spike's number, unchanged |
| salvo chirps A → B, ×10 | 10/10 decoded, 10/10 identical | bar: 8 of 10 (the spike's); first accepted, nine duplicates, zero rejected |
| decode latency per salvo chirp | 2103–2133 ms | i.e. airtime + ~20 ms; the decoder completes on the last frame |
| capture | `worklet` at 48 000 Hz | see §3 |
| the spike page (`/spike/`) | still `webaudio 10/10, direct 10/10` | runs the patched ggwave file |

Also from the same gate, on one app instance through the real buttons:
LISTEN reports `LISTENING · WORKLET · EC=OFF NS=OFF AGC=OFF`, the mic
track's settings read `echoCancellation:false, noiseSuppression:false,
autoGainControl:false`; CHIRP from the handshake screen sent exactly the
frame on the lamp (3.50 s), closed the microphone first and reopened it
after (listen count 2).

The row itself: under the lamp on the handshake, exchange and reveal
screens — a sweep disc whose glow follows the captured level, a status
line, a HEARD line that shows the gate's verdict in character (`HEARD ✓
SALVO … `, `HEARD AGAIN · ALREADY HAVE IT`, or `NEAR MISS · <reason> · THE
QR STILL RULES` with a red blip, a buzz and a short vibration), and the two
buttons. The feel effects asked for are in `app/js/audio.js`: `fire()` on
FIRE, `splash()` / `hit()` for my shells, `damage()` for theirs on my fleet,
`sunk()` with the long vibration, `stamp()`, `victory()` / `defeat()` at the
last sinking, `ping()` when the listener opens or a chirp lands,
`nearMiss()`. Vibration on hit `[40,30,80]` and on sunk `[300]` is Tuesday's
and stays.

### The sample-rate rule (found today, matters on phones)

ggwave decodes one 1024-sample frame at 48 kHz per call. Probing in headless
Chromium: at a 44.1 kHz context the direct decode fails with 1024-sample
chunks, with 512, and with 256; it succeeds with a chunk of **941** samples
(= 1024 × 44100 / 48000, so one chunk resamples to exactly one frame), and
it succeeds at 48 kHz with 1024. The engine therefore asks the shared
AudioContext for 48 kHz (`audio.js`, `WANTED_SAMPLE_RATE`; falls back to the
device default if refused) and sizes the worklet's chunk from the actual
rate (`sonar.js`, `chunkSize`). Headless Chromium honoured the 48 kHz
request; an iPhone that refuses it will run at 44.1 kHz with 941-sample
chunks, which the probe says decodes — but no phone has run it.

## 3. AudioWorklet capture under the unchanged policy — outcome: works

The shell's Content-Security-Policy is byte-identical to Monday's and
Tuesday's; `tests/browser/sonar.js` compares the meta tag against the exact
Tuesday string and fails if a character moved:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; font-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'
```

Two blockers stood between that policy and a working Sonar; both were
removed without touching the policy.

**Blocker 1 — ggwave's glue needed `'unsafe-eval'` (Monday §6.4).** The
embind layer of the published Emscripten build compiles JavaScript source
at init (`createNamedFunction` with `new Function`, and every bound
function's invoker through `new_(Function, …)` in `craftInvokerFunction`),
and the single-file build `fetch()`es its own `data:` wasm URI, which
`connect-src 'self'` refuses with a console error. Resolution:
`tools/patch-ggwave.js` applies three edits to the vendored file, each the
form Emscripten itself emits with `-sDYNAMIC_EXECUTION=0` (a name set with
`Object.defineProperty`, a closure invoker doing the same marshalling, an
`!isDataURI()` guard on the binary fetch). Documented with before/after
md5 in `app/vendor/VENDOR.md`; the tool is idempotent and asserts that no
`new Function`, `Function(` or `eval(` call site remains. Result: the
module loads, encodes and decodes in the app with zero console errors
under the policy above. The wasm binary is untouched. (A rebuild from
source with `-sDYNAMIC_EXECUTION=0` would be the cleaner long-term answer;
no Emscripten toolchain was available in the build environment, and the
three edits are exactly what that flag changes in this glue.)

**Blocker 2 — would an AudioWorklet module load under `script-src 'self'`?**
Yes. `app/js/sonar-worklet.js` is a same-origin module loaded with
`audioWorklet.addModule`, which CSP checks against `script-src`; `'self'`
allows it. It is precached like every other app asset (`app/sw.js`,
`mw-wed-v1`, 25 files; the offline gate reports 25/25 and served all 17
cold-launch responses from the service worker). The worklet does only
capture: it batches the 128-sample render quanta into one-frame chunks and
posts each with its RMS; ggwave (an Emscripten module, not loadable inside
a worklet) decodes on the main thread. That takes the deprecated
ScriptProcessorNode and its main-thread misses (Monday §6.5) out of the
path; a ScriptProcessor fallback remains in `sonar.js` for a browser without
AudioWorklet and reports itself in the status line as `SCRIPTPROCESSOR`.
Headless Chromium used the worklet throughout (`capture mode: worklet`).

So the QR-only receive path did not have to ship as the fallback; the
microphone path is in, under the unchanged policy, with the evidence above.
What the evidence does not cover: a real microphone (see §6).

## 4. Sealed Orders — evidence

Design (per SPEC.md and the Wednesday card): a compose form with a household
label picker (KITCHEN, FRONT GATE, SITTER, SCHOOL RUN, PETS, GRANDMA, TRIP,
WORKSHOP), a note of up to 700 characters, a checklist of up to 8 items of
up to 40 characters; ONE static QR (byte mode, UTF-8 JSON behind an `MWO1`
prefix that routes a scan away from the match gate, up to QR v30-M, print
stylesheet); scan-to-keep into `localStorage`; a card view with
mark-as-done; PASS IT ON re-renders the card with the hop count bumped;
DELETE (two taps); persistence across reloads. Limits are refused with a
message naming the field, the count and the limit; nothing is ever cut.

Unit (`tests/orders.test.js`, 10 tests, in `npm run test:unit` → 38/38):
round-trip of every field; UTF-8 (accents, emoji) through the wire; the
largest allowed card is 1133 bytes against a 1300-byte budget; over-limit
note / nine items / 43-char item / empty card / unknown label / a 700-emoji
note that is inside the character limit but 2800 bytes on the wire — each
refused by name; pass-on bumps the hop and keeps the id; the store keeps,
marks, bumps, de-duplicates by id (a later scan at a higher hop raises the
hop and keeps the done marks) and survives a fresh store on the same
storage.

Browser (`tests/browser/orders.js`, two-window harness; the dev channel
carries the card text exactly as the camera would, into the same
`routeText` the scanner calls). Verbatim:

```
refused: {"message":"NOTE TOO LONG · 701 OF 700 CHARACTERS · TRIM 1","visible":true,"noteStillLong":true,"view":"compose","counter":"701 / 700","kept":0}
composed: {"id":"0c7443c2","hop":1,"qrVersion":10,"bytes":204,…,"hopLine":"HOP 1"}
received on B: {"id":"0c7443c2","hop":1,"note":"Bins go out Tuesday night.\nSpare key is with Jordan. Gate code is on the fridge.","items":["Feed the cat","Water the tomatoes","Lock the side gate"],"contact":"CARD KEPT ✓ KITCHEN · HOP 1 · 0/3 DONE","stored":true,"from":"broadcast"}
after reload on B: {"hop":1,"done":[false,true,false],"hopLine":"HOP 1","checkedBoxes":[false,true,false]}
passed on from B: {"hop":2,"id":"0c7443c2","hopLine":"HOP 2","caption":"KITCHEN · HOP 2 · QR v10-M · 204 BYTES · ONE STATIC CODE","doneCarried":[false,true,false],"qrVersion":10}
card QR pixel round-trip: {"current":{"version":10,"modules":57,"bytes":204,"ms":40,"roundTrip":true,"decoder":"zxing-wasm","hop":1},"biggest":{"version":28,"modules":129,"bytes":1136,"ms":41,"roundTrip":true,"decoder":"zxing-wasm","hop":7}}
orders: PASS (refused over-limit; composed v10; kept on B; done persisted across reload; hop 2 on pass-on; pixels decode)
```

That is the whole bar: compose → render → scan → saved on the receiver
(its own `localStorage` key; two iframes share an origin, so each dev
instance keeps its cards under `mw.orders.v1.dev-A` / `-B` as two phones
would) → mark done → reload keeps the done mark and the hop → PASS IT ON
shows HOP 2 and carries the done marks → an over-limit note is refused with
the message visible, the form still showing all 701 characters. The card
QR decodes from pixels through the app's own decoder, both a normal card
(v10, 57×57 modules) and the largest the limits allow (v28, 129×129).

Claims discipline, asserted over the whole screen's copy including hidden
views, titles, labels and placeholders: the standing label "LOCAL, NOT
SECRET" is present, and with that phrase removed the words secret, secure,
securely, encrypted and encryption appear nowhere. (The task's wording
asks for "secret" to appear nowhere while fixing the label as "Local, not
secret"; the gate reads that as: the label, and nothing else.)

Pending on phones: a camera scan of a card. A v10 card is comfortable; the
v28 worst case is dense, so the card scanner keeps 1280 px of the camera
frame (the match scanners keep 640) — untested on hardware.

## 5. Trusted check: `npm test` from a bare shell at the repo root

Exit status 0. Unit 38/38 (`docs/evidence/unit-tests.txt`). Browser gates
(`docs/evidence/browser-gates.txt`, headless Chromium via Playwright):

```
shell: PASS (7.3 s)
qr-roundtrip: PASS (0.7 s)
offline: PASS (2.7 s)
harness: PASS (3.0 s)
match: PASS (68.2 s)
spike: PASS (25.4 s)
sonar: PASS (38.0 s)
soundflag: PASS (19.0 s)
orders: PASS (2.8 s)
```

Every pre-existing suite stays green (shell, qr-roundtrip, offline,
harness, match, spike); the offline gate reports `OFFLINE READY ✓ 25/25
CACHED version mw-wed-v1`; the three new gates are sonar, soundflag and
orders. The repository's GitHub Pages landing page (`/index.html`,
`/.nojekyll`) is untouched and not precached. Nothing in `app/` contacts a
network at runtime; the CSP is unchanged.

Environment note for the next dispatch: this workspace was seeded without
`node_modules`; a symlink to Monday's `_tools/node_modules` was added
(git-ignored) and the browser runner found Chromium beside it, so `npm
test` runs from a bare shell as before.

## 6. What remains unproven on physical phones — plainly

None of the following has happened. The headless browser cannot do them.

1. **Any acoustic path.** Every chirp number above crossed as samples
   through a loopback MediaStream. Speaker → air → microphone has never
   decoded in this app, on any phone. The 18:00 kill-switch bar
   (8 of 10 at 1 m, iOS ↔ Android) is entirely unmeasured. What to run:
   both phones on the handshake screen, one LISTEN, the other CHIRP ×10 at
   30 cm, then at 1 m, kitchen noise, then TV on; count HEARD ✓ on the
   listener (the HEARD line and `MW.sonar.stats.decodes`); then swap roles;
   then the same on the exchange screen with a fired salvo. The status line
   prints the capture mode and the EC/NS/AGC settings the phone actually
   granted — if any reads ON, the tones will be eaten and the fix is in
   `MIC_CONSTRAINTS`.
2. **Microphone permission and routing on real browsers.** Android Chrome
   should grant the mic on `localhost`/https/the secure-origin flag; iOS
   Safari's play-and-record session is the reason the mic closes before a
   chirp — whether it reopens cleanly after is unknown. Also unknown: whether
   iOS grants the 48 kHz context request (if not, 941-sample chunks, decoded
   in the probe, never on hardware).
3. **AudioWorklet on phones.** Loaded and ran in headless Chromium under the
   policy; not yet on Android Chrome or iOS Safari (both support it; neither
   has run this module).
4. **Loudness and the spectacle.** Volume 50 of 100 was the spike's choice;
   the phones decide whether 70 % speaker volume at 1 m is enough. The feel
   effects, the victory sting and the vibration patterns played without
   error but were never heard or felt.
5. **A two-phone Lamp match over real cameras, the BarcodeDetector path,
   the airplane-mode smoke test** — still Tuesday §5, still pending. The
   precache count changed again (19 → 25): phones that installed Tuesday's
   build must reload once online and see `25/25` before going dark.
6. **A card through a real camera**, especially a dense one (see §4).

## 7. How the operator runs it

```sh
cd /opt/zouroboros/factory-workspaces/t_724bedd3
node tools/serve.js 8080 --bind 0.0.0.0
```

- Phones: `http://<laptop-ip>:8080/app/` → OFFLINE READY ✓ 25/25 → add to
  home screen → airplane mode → relaunch. Host: NEW MATCH; guest: JOIN
  MATCH; both place, LOCK, raise phones. Under the lamp: SONAR · CHIRP —
  one phone LISTEN, the other CHIRP.
- The flag: `app/js/config.js` line 17. `false` = QR only, no sound
  surface at all.
- Sealed Orders: Home → SEALED ORDERS → NEW CARD / SCAN CARD.
- Laptop: `http://127.0.0.1:8080/dev/harness.html` → **Run chirp loopback**
  (about 50 s), **Run Sealed Orders** (about 5 s), **Run full match**.
- Tests: `npm test` (unit + nine browser gates, about 4 minutes; writes
  `test-output/browser-gates.txt` and screenshots).
