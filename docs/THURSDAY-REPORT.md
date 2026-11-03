# Modem Warfare — Thursday report (Hackyard Yard #6, day 4)

Campaign: Thursday build — the playtest rulings and the feel pass.
Dispatched the evening of 2026-11-02 (task `t_9beab47a`) on top of
Wednesday's repository, seeded at the workspace root. Driven by the first
real-phone playtest (two Android phones, a father and his son, 2026-11-02):
the acoustic path decoded 10 of 10 chirps, so the 8-of-10 kill-switch bar
is cleared, sound stays, `SOUND` stays `true`, and nothing here touches the
acoustic path except to open the microphone by itself on the Salute
screens (one carrier, one gesture fewer).

Executed as four persona-scoped manifests (`campaign/T16`–`T19`),
sequentially by one executor under the dispatch's no-delegation policy (the
write scopes overlap in `app/js/app.js`, `app/index.html`, `app/css/app.css`
and `dev/harness.js`). The first attempt ran out its 2700 s budget with the
code and the gates written and the full suite in flight; the resumed
attempt finished the run, the evidence and this report.

The three rulings, treated as settled:

1. transport is a pre-game setting, never a mid-game choice;
2. the wager is gone, everywhere;
3. match play never scrolls.

## 1. The transport setting — where it lives, how the handshake carries it

**Where it lives.** Home screen, `app/index.html`, the `TRANSPORT`
block under NEW MATCH / JOIN MATCH: a two-way segmented control
(`role="radiogroup"`, buttons `data-transport-choice="chirp"` and
`data-transport-choice="qr"`), **CHIRP checked by default**, QR the
alternative. The hint under it reads "SET BEFORE THE MATCH · THE HOST'S
CHOICE RIDES THE HANDSHAKE". JOIN MATCH's sub-label follows the setting
(LISTEN or SCAN). The choice persists per phone in `localStorage`
(`mw.transport.v1`); a phone that has never chosen is CHIRP with nothing
stored. With `SOUND = false` the CHIRP button is removed at boot with the
other `data-needs-sound` elements, so the setting offers QR only and the
default is QR.

The state lives in `app/js/app.js`: `state.transport` ('chirp' | 'qr')
and `state.transportSource` ('default' | 'stored' | 'setting' |
'handshake' | 'forced'). `MW.transport()` reads it; `document.body`
carries it as `data-transport` so the stylesheet can show one carrier and
hide the other without a line of script per screen.

**How the handshake carries it.** `app/js/frame.js`: byte 9 of every
frame used to be the sunk-flags nibble plus a reserved high nibble. On the
HANDSHAKE frame the high nibble's bits 4..5 now carry the transport code
(0 = chirp, 1 = qr). No extra bytes: the handshake is still 28 bytes, 45
base32 characters, QR v3-M, exactly as Tuesday. `encodeFrame` writes the
host's `state.transport` into its handshake; `decodeFrame` reads it back
as `frame.transport` (an unknown code is `BAD_TRANSPORT`, rejected like any
other malformed frame). On every other frame type the nibble stays zero.

**How the joiner adopts it.** When a handshake is accepted by the gate
(`app/js/app.js`, `adoptTransport`), the joining phone sets its
transport from the frame with source `'handshake'`, for this match only —
its own stored setting is untouched — and a toast says `TRANSPORT · CHIRP
· SET BY THE HOST`. Its own handshake frame then carries the adopted
value, so each phone ends up holding the other's handshake with the same
transport in it. One edge is handled, not hidden: a joiner built with
`SOUND = false` that receives a chirp handshake cannot chirp, so it plays
by QR with source `'forced'` and says so in a toast; the host, still in
chirp mode, re-sends until it switches too. Nothing in the match flow
offers that switch; it is the Home setting.

**Inside a match, one carrier.** Every Salute screen (handshake,
exchange, reveal) has both panels in the document — the Lamp (QR, SCAN,
FLIP) marked `data-transport="qr"` and the Sonar row (sweep, CHIRP,
STOP / LISTEN) marked `data-transport="chirp"`. `setTransport` writes the
value to `document.body` as `data-transport` and sets `hidden` on every
`[data-transport]` element whose carrier is not the configured one, so
exactly one panel is in the layout. There is no
`[data-transport-choice]` control on any match screen; the gate asserts
that count is zero on the handshake, the exchange and game over in both
modes. TYPE (paste the other phone's frame text) remains on every Salute
screen as the carrier-neutral manual entry; it is not a transport and was
not a choice before either. A failed chirp is chirped again (CHIRP again,
or RESEND); there is no fallback link to the Lamp.

Proof, `tests/browser/transport.js`, verbatim from the run:

```
fresh phone: {"transport":"chirp","source":"default","stored":null,"checked":"chirp","choices":["chirp","qr"],"onHome":true,"onMatchScreens":0,"join":"LISTEN","body":"chirp"}
after choosing QR and reloading: {"transport":"qr","source":"stored","stored":"qr"}
chirp mode: HANDSHAKE s=a188ca0e r=0 · commit 6065b550… · by chirp | handshake {"route":"handshake","phase":"target","qr":0,"chirp":1,"scanButtons":0,"chirpButtons":2,"qrSvg":0,"choices":0, …}
qr mode: HANDSHAKE s=dde3a2d8 r=0 · commit ca0ab230… · by qr | handshake {"route":"handshake","phase":"target","qr":1,"chirp":0,"scanButtons":2,"chirpButtons":0,"qrSvg":1,"choices":0, …}
adoption (qr host, chirp joiner): {"before":{"a":"qr","b":"chirp","aChecked":"qr","bChecked":"chirp"},"after":{"a":"qr","b":"qr","source":{"a":"setting","b":"handshake"}},"hostFrame":"qr","joinerFrame":"qr", …}
adoption (chirp host, qr joiner): {"before":{"a":"chirp","b":"qr","aChecked":"chirp","bChecked":"qr"},"after":{"a":"chirp","b":"chirp","source":{"a":"setting","b":"handshake"}},"hostFrame":"chirp","joinerFrame":"chirp", …}
chirp match: 6 rounds in 44.3 s, session 276d1f37
transport: {"a":"chirp","b":"chirp"}
sonar: {"chirps":28,"resends":0,"airtimeSeconds":57.9,"decodes":{"a":14,"b":14},"chirpsSent":{"a":14,"b":14},"textFramesSeen":{"a":0,"b":0},"sonarFramesSeen":{"a":14,"b":14}}
audit: {"a":{"verdict":"VERIFIED","findings":[],"checked":43},"b":{"verdict":"VERIFIED","findings":[],"checked":43}}
stamps: {"a":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified","stage":"verdict"},"b":{"word":"VERIFIED","sub":"NO SHIP MOVED","verdict":"verified","stage":"verdict"}}
transport: PASS (default CHIRP; adoption both directions; chirp-mode match VERIFIED both ways by chirp alone, 28 chirps / 0 re-sends; no wager string)
```

Both directions of adoption run in the two-window harness
(`dev/harness.js`, `runAdoption({ host, joiner })`): the two phones are
set the opposite way on Home, the host's handshake frame is checked for
the host's value, the joiner's transport and source are read after the
accepted handshake, the joiner's own handshake frame is checked for the
adopted value, and each phone's held copy of the other's handshake is
checked for the same transport. After adoption each instance's handshake
screen is audited for the carrier it presents: in chirp mode zero QR
panels, zero scan buttons, zero QR SVGs; in QR mode zero Sonar rows, zero
CHIRP / LISTEN buttons.

Two full scripted matches, as the bar asks: **QR mode** in
`tests/browser/match.js` (frames cross the dev channel as the text the QR
carries; VERIFIED both ways, then the three LIAR cheats) and **chirp
mode** in `tests/browser/transport.js` (the text transport is muted on
both instances, so the only carrier is the chirp, carried as waveform
samples into the peer's capture graph — MediaStream → AudioWorklet →
ggwave → gate; 14 frames decoded by each phone, zero crossed as text, zero
rejected, zero re-sends; VERIFIED both ways).

The unit side (`tests/frame.test.js`): the handshake round-trips both
transport values, defaults to chirp when none is given, stays 28 bytes / 45
characters; the family is three types and the old type 4 is `BAD_TYPE`.

## 2. The wager — gone, and the suite proves it

Removed from: the handshake screen (the stake field, SEND, the echo line),
the frame family (`TYPE.WAGER`, `WAGER_MAX_*`, `packWager`,
`unpackWager`, `normaliseWager`, the gate's wager branch), the reveal log
and the audit copy, the game-over tally, the harness (`runMatch` no longer
takes a wager and no longer reports one), the shell gate's screen walk,
and the unit suite (the wager round-trip, alphabet, length and gate tests
are replaced by the transport tests above). No dead control remains: the
elements are deleted from `app/index.html`, not hidden.

Evidence, three layers, all in `tests/browser/transport.js`:

1. **Rendered copy.** After the chirp-mode match, every `.screen` of both
   harness instances and of a fresh app page — screen text, every button,
   every `title` / `aria-label` / `placeholder`, the toast — is checked
   against `\b(WAGER|STAKE|STAKES|BET)\b`. Zero matches.
2. **Source scan.** Every `.js`, `.html`, `.css`, `.webmanifest` under
   `app/` and `dev/` (vendored libraries excluded) is read and grepped for
   `wager`, case-insensitive:
   ```
   source scan: 21 files under app/ and dev/, "wager" in 0
   ```
3. **The frame family.** `tests/frame.test.js`: a frame with the old type
   byte 4 is rejected as `BAD_TYPE`; `TYPE` has exactly three keys.

What still contains the word, deliberately: the Tuesday campaign cards
(`campaign/T6`, `T8`, `T9`, history), the Thursday cards that describe the
removal, Tuesday's and Wednesday's reports and their evidence logs
(history), `inputs/SPEC.md` (the locked design, not in the repo), and the
gate that asserts the absence.

## 3. One unmoved screen — the no-scroll evidence

**The mechanism.** `app/js/app.js` marks the body `data-match` on the
four match routes (placement, handshake, round, game over).
`app/css/app.css`: `body[data-match]` is a `100dvh` flex column with
`overflow: hidden`; the top bar is fixed-size; `#screens` takes the rest
and also hides overflow; the active `.screen--match` fills it. A
`ResizeObserver` on `#screens` writes its real height into `--avail`, and
every big thing on a match screen is sized as a share of that: the
placement board 52 %, the target board 46 %, the reveal boards 42 %, the
mini boards 19 %, the lamp QR 32–38 % by screen, the sweep 17 %. The
fleet status, the exchange panel, the reveal log and the audit detail are
compacted (smaller type, tighter gaps, the log and the detail scroll
*inside* their boxes with a capped height). Home and Sealed Orders are not
marked and may scroll.

**The gate**, `tests/browser/viewport.js`. Two Android viewports, 360×740
and 412×915 (device scale 2.75, mobile, touch). On each, one phone plays a
whole scripted match twice, in QR mode and in chirp mode, through TYPE
(the carrier-neutral manual entry), and at fifteen stops per walk the
screen is measured: the document's `scrollHeight` / `scrollWidth` against
the viewport, a forced `window.scrollTo(0, 100000)` must land at 0, the
screen area and the active screen must not overflow their boxes
(`overflow: hidden` would clip silently, so `scrollHeight` is checked
against `clientHeight` on both), and every visible element's bounding box
must lie inside the viewport. The stops: placement; handshake idle, with
the scanner (QR) or the microphone (chirp) open, with TYPE open, at
CONTACT; round target with three picks; exchange idle, with the scanner /
mic open, with their salvo in, converged; reveal after the round-1
sinkings (one ship each side, banner up, wreck cells on my board); reveal
at match over; game over on the reveal stage idle and with the scanner /
mic open; game over on the verdict stage with the stamp landed, the tally
and the audit detail.

Per screen and viewport (both modes measured identically; `doc` is the
document's scroll height over the viewport height; `screens` and
`screen` are scroll over client height; `slack` is the room under the
lowest visible element):

| stop | 360×740 | 412×915 |
|---|---|---|
| placement | doc 740/740 · screens 692/692 · screen 674/674 · slack 10 px · scrollTo→0 | doc 915/915 · screens 867/867 · screen 849/849 · slack 10 px · scrollTo→0 |
| handshake idle | same | same |
| handshake, scanner / mic open | same | same |
| handshake, TYPE open | same | same |
| handshake, CONTACT | same | same |
| round target, 3 picks | same | same |
| exchange idle | same | same |
| exchange, scanner / mic open | same | same |
| exchange, their salvo in | same | same |
| exchange converged | same | same |
| reveal after sinkings | same | same |
| reveal, match over | same | same |
| game over, reveal stage | same | same |
| game over, scanner / mic open | same | same |
| game over, verdict stage | same | same |

```
viewport: PASS (60 measurements, none scrolls; tightest slack 10px)
```

The 10 px of slack at every stop is the screen area's bottom padding: the
layout fills the viewport exactly and stops. Screenshots of every stop at
both sizes and in both modes are in `test-output/` after a run
(`viewport-<w>x<h>-<mode>-<stop>.png`); the four verdict-stage ones and the
two reveal ones are copied into `docs/evidence/`.

Sealed Orders is untouched by this card except through the shared
stylesheet; its gate still passes (see §5).

## 4. The feel pass — what changed, inside the rulings

All of it in `app/js/app.js`, `app/css/app.css` and `app/js/audio.js`;
sound stays WebAudio-synthesised and behind `SOUND`; every animation is
skipped under `prefers-reduced-motion`.

- **Reveal pacing tightened.** Shells step every 260 ms with an 80 ms
  flight (a whump, then the landing); the sinking hold is 650 ms (was
  700), the pause between my shells and theirs 220 ms (was 300). A round
  with no sinking reveals in about 1.8 s; a round with two in about 3.1 s.
- **Hit splash and screen-shake.** A ring bursts out of the cell where
  the shell landed (white ripple for a splash, fire ring for a hit); a hit
  burns the cell, jolts the board, and shakes the whole screen area for
  260 ms (`screens--shake`). The same for incoming shells on my fleet.
- **A ship sinks instead of vanishing.** On SUNK each of the ship's cells
  lists, slips under and settles as a wreck, 110 ms apart from the stern
  (`cell--sinking`); the line in the fleet strip tilts and reads SUNK; the
  banner slams in; a falling chain of bandpass bubbles under a sliding
  sub-tone plays (`sfx.sink`, new) after the horn; the screen thuds.
- **The sonar sweep runs during listen.** The microphone opens by itself
  on every Salute screen in chirp mode; while it is open the sweep arm
  turns (2.4 s per revolution) with a phosphor trail, the disc glows with
  the input level, a decoded frame fires a green blip outwards, a repeat a
  grey one, a near miss a red one off-centre with a judder; while
  chirping the disc rings amber.
- **The stamp lands with weight.** On the verdict stage the stamp drops
  in from 2.6× and transparent, overshoots to 94 % and settles at full
  size over 420 ms on a back-out curve (`stamp--land`), the screen takes
  the blow (`screens--thud`), the stamp thud plays, and `mw:stamp` is
  dispatched once — the viewport gate asserts it landed. Pending stays dim
  and does not land.

No new feature beyond this list; the feature freeze after this card
stands.

## 5. Trusted check: `npm test` from a bare shell at the repo root

Exit status 0. Unit 39/39 (`docs/evidence/unit-tests.txt`). Browser gates
(`docs/evidence/browser-gates.txt`, headless Chromium via Playwright):

```
shell: PASS (7.3 s)
qr-roundtrip: PASS (0.7 s)
offline: PASS (2.9 s)
harness: PASS (3.0 s)
match: PASS (65.9 s)
spike: PASS (27.7 s)
sonar: PASS (36.7 s)
soundflag: PASS (19.6 s)
orders: PASS (2.3 s)
transport: PASS (87.3 s)
viewport: PASS (120.8 s)
```

Every pre-existing suite stays green (unit, shell, qr-roundtrip, offline,
harness, match, spike, sonar, soundflag, orders); the offline gate reports
`OFFLINE READY ✓ 25/25 CACHED version mw-thu-v1 missing []` and
additionally loads the QR library, the decoder wasm and ggwave from the
cache with the network gone (`offline ggwave load: function`); the two new gates are
transport and viewport. The precache list is unchanged at 25 files; its
version is `mw-thu-v1`. The CSP `<meta>` in `app/index.html` is
byte-identical to Wednesday's (same digest before and after). Nothing in
`app/` contacts a network at runtime. The GitHub Pages landing page is
untouched.

The whole run is about seven minutes now (the chirp-mode match and the
sixty viewport measurements are the additions).

## 6. What remains unproven on physical phones — plainly

Proven on phones (2026-11-02, before this build): the acoustic path, 10 of
10 chirps, speaker → air → microphone, on two Android phones. Nothing in
this build changes the encoder, the protocol, the volume, the microphone
constraints or the capture graph, so that result should carry — but it was
measured on the Wednesday build, not this one.

Not yet done on any phone:

1. **This layout on a real screen.** 360×740 and 412×915 are the two
   test viewports, with the browser chrome assumed to be outside
   `100dvh`. On a phone the address bar, a gesture bar, a notch, a
   keyboard (TYPE opens one) or an installed-PWA window can change the
   real height; `--avail` follows the real screen area through the
   `ResizeObserver`, but the boards' minimum useful size at the smallest
   result (a 7×7 grid at 52 % of a shorter `--avail`) is a question for
   the thumb, not the harness. What to check: every match screen on both
   phones, portrait, with the keyboard up on TYPE, installed and in the
   browser; no screen should move under a finger drag.
2. **The feel.** The splash rings, the shake, the sinking, the sweep, the
   stamp slam and the new sink sound ran without error in headless
   Chromium and were never seen on a phone's refresh rate or felt through
   its motor. Shake amplitude (5 px) and the thud are tuned blind.
3. **The microphone opening by itself.** Chirp mode now opens the mic on
   arrival at the handshake, exchange and reveal screens (after the LOCK /
   FIRE / audit tap, so a user gesture precedes it). Whether Android Chrome
   and iOS Safari grant it from that gesture every time, and whether the
   close-before-chirp / reopen-after cycle stays clean across a whole
   match, has not been watched on hardware.
4. **A two-phone match in chirp mode over the air.** The playtest crossed
   chirps; a whole match by chirp alone, with its ~28 chirps and the
   re-send path, has only run in loopback.
5. **Still pending from Tuesday and Wednesday:** a two-phone Lamp match over
   real cameras, the BarcodeDetector decode path, the airplane-mode smoke
   test, a Sealed Orders card through a real camera. Phones that installed
   the Wednesday build must reload once online and see `25/25` and
   `mw-thu-v1` before going dark.

## 7. How the operator runs it

```sh
cd /opt/zouroboros/factory-workspaces/t_9beab47a/mw-thu-seed
node tools/serve.js 8080 --bind 0.0.0.0
```

- Phones: `http://<laptop-ip>:8080/app/` → OFFLINE READY ✓ 25/25 → add to
  home screen → airplane mode → relaunch. Home → TRANSPORT: CHIRP (phones
  flat, speaker to mic) or QR (face to face). Host: NEW MATCH; guest: JOIN
  MATCH; both place, LOCK. The guest's phone is already listening; the
  host taps CHIRP; the guest's phone adopts the session and shows its
  frame; the guest taps CHIRP back. BEGIN ROUND 1.
- The flag: `app/js/config.js` line 17. `false` = QR only, no sound
  surface, no CHIRP choice.
- Laptop: `http://127.0.0.1:8080/dev/harness.html` → **Run full match
  (QR)**, **Run full match (chirp)**, **Run chirp loopback**, **Run Sealed
  Orders**; adoption both ways is `harness.runAdoption({ host, joiner })`
  from the console (the transport gate drives it the same way).
- Tests: `npm test` (unit + eleven browser gates, about 7 minutes; writes
  `test-output/browser-gates.txt` and screenshots).
