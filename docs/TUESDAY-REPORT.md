# Modem Warfare — Tuesday report (Hackyard Yard #6, day 2)

Campaign: Tuesday build — placement for real, commitment handshake, the salvo
round loop over the Lamp, endgame reveal/audit/stamp, scripted-match and
cheat tests. Dispatched the evening of 2026-11-02 (task `t_533eb59a`) on top
of Monday's repository, now seeded at the workspace root.

Executed as five persona-scoped manifests (`campaign/T6`–`T10`), sequentially
by one executor under the dispatch's no-delegation policy (write scopes
overlap in `app/js/app.js`). The factory's swarm gate scored the scoped plan
SWARM (0.90); the policy ruled.

## 1. Repository state

- Location: `/opt/zouroboros/factory-workspaces/t_533eb59a` (the repo *is*
  the workspace root this time; Monday's lived one level deeper).
- Branch: `main`. Commits on top of Monday's `17ee653`, oldest first:
  - `fa9d304` tooling: browser runner also finds Chromium beside the real
    playwright package (the trusted check could not launch a browser from
    the new location until this; see §6.1)
  - `07e289a` protocol: vendored SHA-256 commitment, WAGER frame, gate
    seen-set, match audit (+13 unit tests)
  - `6fd9208` app: playable salvo loop over the Lamp, wager, staggered
    reveal, audit stamp (app, dev harness, browser gates, manifests)
  - the docs commit that carries this report, the README and the evidence
    folder follows; `git log --oneline` lists it.
- The app shell's CSP is byte-identical to Monday's. Nothing in `app/`
  contacts a network at runtime; the service worker precaches 19 files
  (`mw-tue-v1`) and the cold-offline gate serves all 13 shell responses
  from the service worker with the server stopped.

## 2. Trusted check: `npm test` from a bare shell at the repo root

Exit status 0. Unit: 28/28 (`docs/evidence/unit-tests.txt`). Browser gates
(`docs/evidence/browser-gates.txt`, headless Chromium 156 via Playwright):

```
shell: PASS (7.1 s)
qr-roundtrip: PASS (0.7 s)
offline: PASS (2.8 s)
harness: PASS (3.0 s)
match: PASS (67.3 s)
spike: PASS (25.1 s)
```

All five Monday suites stay green; `match` is new. The ggwave spike came in
at `webaudio 10/10, direct 10/10` on this run.

## 3. End-of-Tuesday bar, item by item

### 3a. A complete match is playable over QR from placement to stamp — PASS (harness); phones pending

Proven by `tests/browser/match.js`, which drives two app instances in the
dev harness through the app's own frames, codec and receive gate. The
BroadcastChannel carries exactly the base32 text the QR carries; the only
thing it replaces is the camera. Output, verbatim:

```
clean match: 6 rounds in 15.3 s, session aacc7391
  round 1: A B1 B2 A5 → HIT/HIT/miss sunk=0000 | B A2 E5 A4 → HIT/miss/miss sunk=0000
  round 2: A B3 B4 C3 → HIT/HIT/miss sunk=1000 | B B2 A7 D3 → HIT/miss/miss sunk=0000
  round 3: A D5 E5 F4 → HIT/HIT/miss sunk=1000 | B C2 B4 A6 → HIT/miss/miss sunk=0000
  round 4: A F5 F1 G7 → HIT/HIT/miss sunk=1100 | B D2 G6 B6 → HIT/miss/miss sunk=1000
  round 5: A G1 A7 G5 → HIT/HIT/miss sunk=1110 | B G3 C1 B5 → HIT/miss/miss sunk=1000
  round 6: A B7 D4 G6 → HIT/miss/miss sunk=1111 | B G4 B7 C3 → HIT/miss/miss sunk=1000
wager: {"a":"LOSER DOES THE DISHES","b":"LOSER DOES THE DISHES"}
outcome: {"a":{"result":"win","finalRound":6},"b":{"result":"loss","finalRound":6}}
audit: {"a":{"verdict":"VERIFIED","findings":[],"checked":43},"b":{"verdict":"VERIFIED","findings":[],"checked":43}}
stamps: {"a":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified"},"b":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified"}}
commitments: {"aOfB":"319cdaae625c916b16e7fb1aefa93a17","bActual":"319cdaae625c916b16e7fb1aefa93a17","bOfA":"a496b94b2f71f534cb5ef6c558f09577","aActual":"a496b94b2f71f534cb5ef6c558f09577"}
gate tallies: {"a":{"accepted":15,"duplicate":30,"rejected":0,"rejectedReasons":{}},"b":{"accepted":15,"duplicate":30,"rejected":0,"rejectedReasons":{}}}
```

What that shows: mixed hits and misses every round; sinkings in rounds 2,
4, 5 and 6 (so at least one before the end); both phones agree on the
outcome and the final round; each phone holds the other's real commitment
(not Monday's zero placeholder); 43 audit checks per phone (commitment +
18 shells + 24 sunk flags); zero rejected frames; the duplicates are the
spec'd no-ops from the camera-like replay. Screenshot of both phones on
the stamp: `docs/evidence/match-verified.png`.

The shell gate (`tests/browser/shell.js`) walks the same flow on one phone
through the TYPE (manual) path and checks the ruled Salute semantics:
after the opponent's plain salvo decodes, my frame re-renders with results
(`afterTheirSalvo !== svText`); REVEAL stays disabled until their results
of my salvo are in; a re-scan of the same frame logs `duplicate`; the
staggered reveal took 1811 ms for six shells (≥ 6 × 250 ms).

### 3b. The cheat and commitment tests prove the stamp can say LIAR — PASS

Cheats are injected in the dev transport (`MW.devTamper` in
`dev/channel.js`), never in `app/`; the liar's own app is honest, its
outgoing frames are rewritten. Verbatim:

```
cheat result: 6 rounds; A audit LIAR [{"round":2,"code":"FALSE_RESULT","detail":"B3 reported miss, revealed fleet says HIT"}]; B audit VERIFIED
stamps: {"a":{"word":"LIAR","sub":"FALSE RESULT · ROUND 2","verdict":"liar"},"b":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified"}}
cheat fleet: A audit LIAR [{"round":0,"code":"COMMIT_MISMATCH",...},{"round":5,"code":"FALSE_RESULT","detail":"A7 reported HIT, revealed fleet says miss"}]; B audit VERIFIED
cheat salt: A audit LIAR [{"round":0,"code":"COMMIT_MISMATCH","detail":"revealed fleet + salt do not hash to the commitment fixed at LOCK"}]; B audit VERIFIED
```

The honest side still verifies in every scenario. Unit tests in
`tests/audit.test.js` cover the same ground without a browser: clean →
VERIFIED; wrong salt, moved fleet (even with results consistent with the
moved fleet), hit reported as miss, miss reported as hit, ship reported
sunk early, off-board or overlapping fleet, and a round with no reported
results → LIAR, each naming the first finding. Screenshot:
`docs/evidence/match-liar.png`.

### 3c. Commitment handshake with a vendored SHA-256 — PASS

`app/js/sha256.js` (FIPS 180-4, ~70 lines, synchronous, no imports) matches
the standard vectors (`""`, `"abc"`, the 56-byte two-block message, one
million `a`) and `node:crypto` on sixteen lengths across every padding
boundary. `commitment()` is now synchronous and never touches
`crypto.subtle`, so the commitment is identical on a plain-http LAN origin,
on localhost, and in the installed PWA with the radios off. Format is
Monday's: first 16 bytes of SHA-256(packed fleet ‖ 128-bit salt). The
handshake screen prints the full commitment under the QR ("FIXED AT LOCK").

### 3d. Table choreography — place first, then the Salute — PASS

Both roles go Home → Placement → LOCK → Handshake. LOCK draws the salt and
fixes the commitment before the handshake screen exists; the guest's lamp
stays blank until it has scanned the host's handshake, then renders its
own. The host sends the wager after contact; the guest's phone shows it
and echoes the same frame back, so the host sees "✓ ON BOTH PHONES". The
WAGER frame (type 4) packs the note at 6 bits per character, up to 34
characters = 61 base32 characters, which is exactly the alphanumeric
capacity of QR v3-M (unit-tested at the maximum).

### 3e. REMATCH and NEXT CHALLENGER — PASS (shell), exercised by the match gate's sequencing

REMATCH keeps roles: the host mints a new session, the guest resets with no
session and waits to scan. NEXT CHALLENGER resets to Home. The match gate
runs four matches back to back in the same two instances, each starting
from Home, which exercises the reset path four times with no leaked state
(the fourth match's audit is clean on the honest side).

## 4. Semantics decisions made today (Monday §6 items 1, 2, 3, 7)

1. **Results field = same round, two scans per phone per round** (the
   brief ruled it). A frame first carries my new salvo; once I decode
   theirs it re-renders with their results; both hold until both chime.
   The contact line is driven by game state, not by the last scan event,
   so the camera re-reading a held-up QR every 1.5 s cannot downgrade
   "CONTACT ✓" to "already have it".
2. **Commitment stays truncated to 128 bits** (fits v3-M; adequate for a
   kitchen-table audit). No new frame type for the reveal.
3. **SHA-256 vendored** rather than requiring a secure context.
4. **Guest flow confirmed**: place, LOCK, then scan.
5. **Gate extension**: the gate now remembers every accepted frame. A
   re-scan of any earlier frame of the current step is a duplicate no-op;
   once the round has moved on it reads as `STALE_ROUND`, which the UI
   explains as "their phone is a step behind · ask for RESEND LAST". A
   WAGER frame may land or be corrected at any point after the handshake
   and never moves the round machine. Monday's 15 gate tests are unchanged
   and green.
6. **Fork safety at the step boundaries.** Once a phone's outcome is known
   it immediately expects round N+1, so an early REVEAL from the other
   phone is accepted and audited before the game-over screen is reached.
   RESEND LAST re-shows the previous step's frame for a phone that is
   behind. The dev channel now behaves like a camera: every render also
   asks the peer to re-post its current frame, so a frame rejected as
   `FUTURE_ROUND` a moment ago arrives again once this phone catches up.
   A duplicate never causes a re-render (the harness gate asserts the
   channel is silent for 600 ms while both instances idle on the handshake
   screen; the first cut of the day ping-ponged there and was fixed).

## 5. What remains unproven on physical phones (operator's phone session)

None of the following ran today; the headless browser cannot do them.

1. **A real two-phone Lamp match.** Everything above crossed a
   BroadcastChannel. The phones must play one full match through
   `app/`'s camera scanner, from placement to stamp. What to watch: the
   contact line on each phone during the Salute (WAITING → THEIR SALVO IS
   IN → CONTACT ✓), that both chime before anyone taps REVEAL, and that no
   round ever needs RESEND LAST. Time the match; the spec wants 5–7 min.
2. **Camera geometry.** The scanner now opens the **front** camera by
   default, because the spec's Salute is screen-to-screen at ~20 cm and
   only the front camera sees the other screen in that pose. Fixed-focus
   front cameras may not resolve a v2 QR at 20 cm; try 25–35 cm, and try
   FLIP (rear camera, phones side by side, each turned in turn). Report
   which geometry decodes fastest; the default follows the finding.
3. **BarcodeDetector decode path.** Only the zxing-wasm fallback has ever
   run (headless Chromium has no BarcodeDetector). On Android Chrome the
   scanner status line reports which decoder it uses and the camera in
   use (`SCANNING · BarcodeDetector · FRONT CAM`). Note the decoder name
   and the decode time at the chosen distance.
4. **On-device airplane-mode smoke test.** Install from
   `http://<laptop-ip>:8080/app/`, wait for `OFFLINE READY ✓ 19/19 CACHED`
   (the count changed from 16 today, so phones that installed Monday's
   build must pick up `mw-tue-v1`; reload once online and check the
   badge), add to home screen, airplane mode on, relaunch from the icon,
   play a round. Camera scanning still needs a secure context
   (`localhost`, `https`, or Chrome's `#unsafely-treat-insecure-origin-as-secure`
   for the laptop origin); the commitment no longer does.
5. **Sound and vibration on hardware.** The WebAudio feel (lamp clack,
   contact bell, whump/splash/thud, horn, stamp thud) and the vibration
   patterns played without error in headless Chromium but were not
   heard. Check they fire on the first tap (the AudioContext unlocks on
   the first click) and that the contact bell is audible with screens
   facing away.

## 6. What Wednesday must know

1. **Trusted check and repo location.** The browser runner now also
   resolves the Playwright browsers from the real path of
   `node_modules/playwright` (the workspace's `node_modules` is a symlink
   into Monday's `_tools`). If Wednesday's workspace is seeded the same
   way, `npm test` works from a bare shell; if `node_modules` is absent,
   `npm install && npx playwright install chromium` as in the README.
2. **Sonar integration rides the same frames.** The Sonar carries the
   same base32 text the Lamp carries; the receive path is `injectText`
   (window.MW.injectText), the same single entry point the camera and the
   dev channel use, so a ggwave decode plugs in with one call and inherits
   the gate, duplicates and staleness handling. The exchange screen's
   SONAR toggle and the `sonar-shell` placeholder are still Monday's
   shell; the mode switch only hides the lamp.
3. **CSP is untouched (`'self'` + `'wasm-unsafe-eval'`).** The ggwave
   Wasm glue still needs `'unsafe-eval'` (Monday §6.4); that decision is
   Wednesday's. Note the new `app/js/audio.js` already owns an
   AudioContext; Sonar's transmit should share it rather than create a
   second one, and must close the microphone before playing (the spike
   does this).
4. **Main thread is busier now.** The reveal animation and the contact
   chime run on the main thread; Monday's ScriptProcessorNode misses under
   load (§6.5) argue for the AudioWorklet capture path before the chirp
   decoder shares a phone with the Salute animation.
5. **Round-numbered idempotence covers Sonar retries.** A chirp heard
   twice is a duplicate; one heard late is `STALE_ROUND`; the UI already
   says so in character. No new frame types are needed for Sonar.
6. **Sealed Orders.** The frame codec's extension byte allows up to 255
   bytes, but the QR encoder refuses anything above v3-M (38 bytes). A
   ~400-byte card needs its own QR path (v10–v13 at EC-M, byte mode), its
   own `qrSvg` call with a higher version ceiling, and must not go through
   the FrameGate (no session, no round). The scanner's `onText` can route
   by a prefix before `injectText`. The screen's form is still disabled
   placeholders; the honesty label is in place and the shell gate checks
   no "secure"/"encrypted" copy appears.
7. **Precache bump.** Any change to a precached file needs a `VERSION`
   bump in `app/sw.js` (now `mw-tue-v1`, 19 files); the offline gate
   prints the count.

## 7. How the operator runs it

```sh
cd /opt/zouroboros/factory-workspaces/t_533eb59a
node tools/serve.js 8080 --bind 0.0.0.0
```

- Phones: `http://<laptop-ip>:8080/app/` → OFFLINE READY ✓ 19/19 → add to
  home screen → airplane mode → relaunch. Host: NEW MATCH; guest: JOIN
  MATCH; both place, LOCK, raise phones.
- Laptop: `http://127.0.0.1:8080/dev/harness.html` → **Run full match**
  (about 15 s) or **Run match, B lies** to watch a LIAR stamp land.
- Tests: `npm test` (unit + six browser gates, about 2 minutes; writes
  `test-output/browser-gates.txt` and screenshots).
