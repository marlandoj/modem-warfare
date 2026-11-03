# Modem Warfare — SOUNDTRACK report (Hackyard Yard #6, day 6)

Campaign: the SOUNDTRACK build — an original wartime score, rock-forward.
Dispatched 2026-11-03 02:33 UTC (task `t_41ef7299`) on the repository
exactly as published after the REMOVAL build (`f263d89`), with its git
history, plus an `inputs/` folder holding `SPEC.md` and the two reference
recordings `ref-a-march-rock.mp3` and `ref-b-carrier-rock.mp3` beside the
repo (both 45 s, 44.1 kHz stereo PCM despite the extension).

## 1. The ruling and the direction

The operator ruled on 2026-11-02 that the game is missing a wartime
soundtrack, listened to both references and chose **rock-forward**: the
second reference leads (the flight deck — arpeggios and octave bass up
front, the march brass arriving as fanfare punctuation); the first stays the
texture guide for the ceremonial moments (the placement variant, the
victory reprise, the defeat descent). This card adds the score and changes
nothing else.

Executed by one executor under the dispatch's no-delegation policy.

**Both references were studied before composing**, by analysis rather than
ear (the executor has none): spectrograms, waveforms, an onset-strength
autocorrelation for tempo and loudness curves over the 45 s of each.

- *ref-a-march-rock*: a continuous legato wall — sustained brass and pad
  harmonics from 460 Hz to 3 kHz with no sharp transients at all (the
  tempo estimator finds no pulse), low drum strokes every 1.2 s or so,
  integrated loudness about −14 LUFS, one level from start to the fade at
  42 s. Stately and ceremonial.
- *ref-b-carrier-rock*: a steady pulse of sharp transients every 0.43 s (the
  estimator's candidates are 70, 92 and 140 bpm — a half-time feel with
  eighth-note pulsing), a heavy bass band at 80–200 Hz, a bright, regular
  arpeggio band above 1 kHz, about −13 LUFS, driving and even. The flight
  deck.

Nothing from either recording was transcribed, sampled or approximated;
they fixed the two idioms' textures, tempi and balance, and that is all
they were used for.

## 2. The music — an original composition

The score evokes two idioms and quotes neither. **No copyrighted theme is
quoted, transcribed or approximated note-for-note, however short; every
line, chord progression and rhythm below was written for this build.** The
executor checked the lines against the obvious wartime and carrier-deck
touchstones (service marches, the well-known carrier-film anthems) for
shared openings or contours and found none; the deck lead and the march
melody are triadic, diatonic lines in B minor / D major of the kind any
brass band could play, built fresh. The tonal plan is one key centre (B
minor / D major) for Home so the deck and the march fuse without a
modulation, and D minor for the battle.

### The score map (what plays where, and why)

| scene | where | what | why |
|---|---|---|---|
| **theme** | Home and the menus | 32 bars at 104 bpm, 73.8 s loop. Bars 1–4: the deck leads — pulsing arpeggios (eighths over two octaves), octave bass, half-time kick and backbeat, hat; a unison brass fanfare call answers in bars 3–4. Bars 5–12: the deck with the lead line (an eight-bar original over Bm · G · D · A · Bm · G · Em · F#), brass stabs on the "and of four" of bars 8 and 12. Bars 13–20: the ceremonial interlude — four-voice brass chords, the march melody in the brass, the march snare figure with rolls, timpani on one and three; the arps rest. Bars 21–28: the deck again with the lead's second pass, brass pads under it, stabs. Bars 29–32: the outro — brass chords over the deck, a snare roll and timpani that turn around into bar 1. | Rock-forward as ruled: the flight deck leads and the march is punctuation and interlude. One tempo throughout so the sections run into each other without a seam, and the loop's last bar resolves into its first (the unit test proves no gap over a beat anywhere, the seam included). |
| **placement** | the placement screen | The march's eight bars as soft, dark brass pads with the march melody hushed, a clock-tick hat on the beats, timpani on the downbeats; 92 bpm, 20.9 s loop, the lowest level in the score. | The quiet chart room: the fleet is being laid; the march, low in the mix, keeps the ceremony without the drive. |
| **battle** | the Salute (handshake), every round, the reveal exchange | An eight-bar tension ostinato in D minor at 108 bpm (Dm · Dm · B♭ · Am · Dm · Dm · Gm · Am), 17.8 s loop, in three layers. Layer 0: a low brass pulse on the root (quarter notes), timpani on the downbeats and on three in bars 4 and 8, a sparse arp (quarters). Layer 1, **on the first hit of the match** (a shell of either side landing): kick, snare, hat, octave bass, the arp filling to eighths. Layer 2, **in the final rounds** (three ships down on either side): the lead line (an eight-bar original) and brass stabs on bars 1, 3, 5 and 7. Layers only climb within a match and reset at a new one. | Tension that gains as the match heats, exactly as the card asks. |
| **victory** | the last enemy ship sinks | A brass fanfare sting (D · D · D · A · D, in octaves, over D major chords, a timpani roll, a cymbal), 6.9 s, 0.6 s after the existing victory effect; then the **full theme back at strength** (gain 0.34 against Home's 0.30), from its first lead section. | Victory takes the theme back at strength. |
| **defeat** | the last of my ships sinks (or a draw) | A short sombre brass descent — Dm · B♭ · Asus4→A under a top line that only falls (F E · D C · B♭ A), timpani under it, 72 bpm, 10 s, 0.6 s after the defeat effect; then the chart-room march, lower still (0.07). | Defeat is a short sombre brass descent. |

The stings sit beside the existing synthesised effects, not over them: they
start after the effect, and the whole score is mixed under the feel (see
the levels in §4).

### The instruments (all synthesised at play time)

- **brass** — three sawtooth oscillators detuned −8 / 0 / +7 cents through a
  lowpass whose cutoff rises from 320 Hz to 1.4–3.2 kHz (by velocity) in
  60 ms and settles to 900 Hz, under an attack–hold–release gain envelope.
  `brassDark` (the chart room, the defeat) opens slower and lower;
  `brassLow` is the battle's root pulse.
- **lead** — two sawtooths detuned ±9 cents with a 5.6 Hz vibrato that
  fades in over 300 ms, lowpass 2.6 kHz, into a dotted-eighth feedback
  delay bus (one per scene).
- **arp** — one sawtooth through a resonant lowpass that falls from
  2.6–3.8 kHz to 500 Hz over the note, 6 ms attack.
- **bass** — short square pulses through a 620 Hz lowpass.
- **kick** — a sine falling 150 → 46 Hz; **snare** — filtered noise
  (bandpass 1.7 kHz) with a triangle body 220 → 150 Hz; **hat** — noise
  above 7.5 kHz, 45 ms; **cymbal** — noise above 5.2 kHz, 1.6 s.
- **timpani** — a sine falling from 1.45× to the root in 80 ms with a 1.1 s
  decay, plus a 60 ms lowpassed noise skin.

## 3. The engineering

- `app/js/music.js` (new, **33,738 bytes**, the whole score and engine): a
  small notation (melodic lines as `NOTE:BEATS` tokens, chord lines through
  a voicing table, drum lines as 16-step strings per bar) compiles each
  scene into a sorted event list once; a look-ahead scheduler (40 ms tick,
  300 ms horizon) places every note on the shared 48 kHz AudioContext's
  clock, loops by advancing a loop origin (so the seam is a continuous
  timeline, never a restart), filters events by the current layer, and
  re-anchors instead of cramming if the tab was throttled. Non-looping
  scenes name the scene that follows them. Every node is made through one
  helper so the engine's node count is honest evidence.
- **It shares `audio.js`'s one AudioContext** (48 kHz, the Sonar's rate);
  it never makes its own. **Nothing is created before the first user
  gesture**: `start()` is called from the body click handler beside the
  feel's `unlock()`, and until then `setScene()` only records what the
  current screen wants.
- **The chirp is sacred.** `sonar.js` gains one notifier, `onActivity`,
  fired when a listen window is requested, when it is open, when a chirp
  is in flight, and when all of that ends; `app.js` wires it to the
  engine's `duck()`. `duck(true)` cancels every automation on the duck
  gain and sets it to **exactly 0 at the current time, with no ramp**, and
  holds it for the whole window; `duck(false)` ramps back over 350 ms. The
  window is marked from the moment the microphone is asked for (before
  `getUserMedia` resolves), stays marked through a CHIRP (the mic closes,
  the chirp plays, the mic reopens) and is released only when the Sonar
  goes idle. The engine samples its own gain on every tick inside a window
  and counts any non-zero reading as a violation, so the evidence can be
  read from the engine rather than inferred. Nothing else in `sonar.js`
  changed: the protocol, the capture graph, the microphone constraints and
  the transmit path are as they were.
- **The settings.** Home gains a MUSIC block beside TRANSPORT (ON · SCORE /
  OFF · SILENT), on by default, persisted under `mw.music.v1` (per dev
  instance in the harness, like the transport). It is marked
  `data-needs-sound`, so with `config.SOUND = false` it leaves the document
  at boot with every other sound affordance, and `loadMusic()` disables
  the engine under that flag before anything is wired: **SOUND stays the
  master**. MUSIC switched off stops the score and creates no node from
  then on; switched on again it resumes without a second tap.
- **The screens drive the score** through one function, `syncMusic()`,
  called on every route change: Home → theme, placement → the chart room,
  handshake / round / the reveal exchange → battle, and once an outcome is
  known the victory or defeat sting (set at the moment the outcome is
  decided, after the effect). The heat is read where the theatre lands a
  shell: `musicHeat('hit')` beside the hit and damage effects, and the
  sunk check beside the sinking horn. A new match resets the layer.
- `app/sw.js`: `./js/music.js` joins the precache — **24 files, version
  `mw-final-v2`** (`modem-warfare-mw-final-v2`), so phones that installed
  `mw-final-v1` drop the old cache on their next online open. No audio file
  is cached because none exists.
- Untouched: the match, the handshake, the audit, the frame codec, the
  transport setting, the layout (the MUSIC block sits on Home, the one
  screen allowed to scroll; the four match screens are byte-identical in
  markup and the viewport gate's 60 measurements still pass), the styles
  (`app/css/app.css` is unchanged; the block reuses the TRANSPORT block's
  rules), `app/js/config.js` (line 17 still reads `export const SOUND =
  true;`), the manifest, every vendored file. **The content-security
  policy `<meta>` in `app/index.html` is byte-identical** (digest of the
  two-line tag `6c8d92f44b4b6671a44c5abc62e23ca9` before and after, asserted
  by the removal unit test on every run).

## 4. The mix, rendered

The executor cannot listen, so each scene was rendered offline through the
engine's own instruments (headless Chromium, `OfflineAudioContext` at
48 kHz, every event of the scene scheduled as the engine schedules it) and
measured with ffmpeg's EBU R128 meter:

| scene | rendered | sample peak | integrated loudness |
|---|---|---|---|
| theme (bars 1–17) | 40 s | −12.0 dBFS | −29.7 LUFS |
| placement | 21 s | −25.5 dBFS | −38.9 LUFS |
| battle, layer 2 | 18 s | −11.7 dBFS | −29.0 LUFS |
| victory sting | 7.5 s | −9.8 dBFS | −27.7 LUFS |
| defeat descent | 10.5 s | −16.7 dBFS | −31.1 LUFS |

The feel's effects peak at −4 to −3 dBFS (the hit thud at 0.6, the stamp at
0.7) and the chirp goes out at ggwave volume 50, so the score sits under
both by eight decibels or more: alongside, not over. The theme's
spectrogram shows the plan as written — two bars of pulsing arps and bass,
the fanfare call, the lead entering at bar 5 as sustained lines between
1.2 and 2 kHz over the kick, then at 27.7 s the march's sustained brass
harmonics and snare figure. The references were played by no one here; a
listening pass on the phones is the operator's (§6).

## 5. The bar, proven

`npm test` from a bare shell at the repo root, exit status 0, twelve browser
gates and 43 unit tests. The suite was run three times during the card:
once on the seed tree before any change (eleven gates, 36 unit tests, all
green — the baseline), once with the score and the new gates in place
(03:00 UTC, all green), and once more on the finished tree after the mix
levels were set and the documents written (`docs/evidence/soundtrack/`,
verbatim). Unit: 43 tests, 43 passed, the seven score tests among them
(`unit-tests.txt`). Browser gates, headless Chromium via Playwright 1.64.1,
four lanes (`browser-gates.txt`):

| gate | what it proves | result |
|---|---|---|
| shell | five screens, offline badge `24/24`, QR versions, one round by TYPE | PASS 9.4 s |
| qr-roundtrip | encode → pixels → decode, straight and skewed | PASS 2.2 s |
| offline | cold launch from the 24-file precache with the server gone, 17 of 17 responses from the worker | PASS 5.6 s |
| harness | handshake + salvo over the two-window channel | PASS 4.8 s |
| orders | the removal, now at `24/24 mw-final-v2`, `mw.orders.v1` never read | PASS 4.0 s |
| match | full QR-mode match VERIFIED both ways, then three cheats | PASS 71.1 s |
| spike | ggwave chirp round-trip, webaudio and direct | PASS 27.4 s |
| sonar | AudioWorklet capture, handshakes by chirp both ways, salvo chirps 10/10 | PASS 40.1 s |
| soundflag | SOUND=false: match VERIFIED, zero sound affordances, zero AudioContexts, **the MUSIC block gone and the engine never started, zero nodes** | PASS 22.5 s |
| transport | default CHIRP, adoption both ways, whole match by chirp alone (28 chirps, 0 re-sends) | PASS 94.2 s |
| viewport | 60 measurements at 360×740 and 412×915, none scrolls — the unmoved screen stays unmoved | PASS 131.5 s |
| **soundtrack** (new) | the seven items below | PASS 119.2 s |

**The soundtrack gate** (`tests/browser/soundtrack.js`), verbatim from the
evidence:

1. *The engine schedules the theme's notes in the menu state.* Before any
   gesture: `enabled true, started false, scene theme, playing null, nodes
   0`, and zero oscillators or buffer sources on the context after 600 ms.
   On the first tap (the title): `playing theme, context running`,
   instruments `arp bass hat kick snare brass`, the first notes at the
   same clock time being arp B3, bass B2, hat and kick (the deck), the
   fanfare's brass scheduled by the fourth bar, and **no gap over 0.29 s
   between consecutive scheduled notes** — continuous scheduling on a
   48 kHz context.
2. *State transitions move the music.* NEW MATCH → `playing placement`;
   LOCK → `playing battle` at layer 0; a win → `scene victory`, the fanfare
   scheduled, then `playing theme` (the reprise at strength) within 15 s; a
   loss → `scene defeat`, the dark brass scheduled, then `playing placement`
   (the quiet march); HOME → `theme`.
3. *During a listen window the music gain is zero.* In chirp mode the
   handshake screen opens the mic by itself and the gate reads
   `ducked true, gain 0 (typeof number)`, asserted with `=== 0` and
   `Object.is(gain, 0)`. A CHIRP from that screen (3.50 s): gain samples
   `at call 0 · 120 ms in 0 (busy) · 1 s in 0 (busy) · after 0 (listening
   again)`, **0 violations in 92 engine ticks** inside the window. After
   STOP: `ducked false, gain 1.000, playing battle`.
4. *The battle layers arrive on their triggers.* A scripted match by TYPE:
   round 1 (the first hit, one enemy ship sunk) → layer 1; round 2 (two
   down) → still 1; round 3 (three down) → layer 2 with the lead line
   scheduled on layer 2; the layer log reads `[1, 2]`, once each.
5. *The defeat*: a second scripted match lost in four rounds; their hits
   brought layer 1 and three of my own ships down brought layer 2 (the
   heat counts both sides); then the descent, then the quiet march.
6. *With Music toggled off, no music nodes are created.* OFF → stopped,
   `mw.music.v1 = off`, shown; persists across a reload; after a tap and a
   walk to the Salute: `started false, playing null, nodes 0, notes 0`, and
   the context's source count `1 → 1` over two seconds on the Salute screen
   (the one is the lamp's clack); ON brings the score straight back.
7. *The score costs the acoustic path nothing inside the harness.* The
   two-window harness played the whole scripted match in **CHIRP mode with
   the text transport muted and the score playing on both phones**: 6
   rounds in 45.8 s, **28 chirps, 0 re-sends** (identical to the
   transport gate's figures without music, in the same run), **VERIFIED —
   NO SHIP MOVED on both phones**, no frame rejected; instance A `theme →
   placement → battle → victory`, layers 1,2, 32 duck changes, **900
   engine ticks inside Sonar windows, 0 with non-zero gain**; instance B
   `theme → placement → battle → defeat`, 904 ticks, 0 violations — 1,804
   Sonar ticks, zero gain on every one.

What the suite cannot prove is unchanged from Wednesday: the acoustic path
(speaker → air → microphone) is the phones' to prove. The duck is designed
for it — a phone's own score is at exactly zero whenever its microphone is
open and whenever it chirps, so the 10-of-10 measured on the real phones
without music is what the score leaves alone.

## 6. What remains for the operator

1. **Listen.** Open the app on a phone, tap once, and hear the theme; place
   a fleet (the chart room); LOCK into the Salute (the ostinato, silent
   the moment the mic opens). Then play a round against Jordan and hear the
   first hit bring the kit in. The levels in §4 are set by meter, not ear;
   if the score needs to come up or down on a phone speaker, the five
   scene gains sit together in `app/js/music.js` (`theme()` through
   `defeat()`), nothing else needs touching.
2. **The 10-of-10 once more, with the score on.** Two phones at a metre,
   MUSIC on, chirp mode: the card's promise is that the duck makes this
   identical to the Wednesday measurement.
3. **Push** `main` so the score is live on Pages; installed phones pick up
   `mw-final-v2` (24/24) on their next online open.

## 7. How this card was run

```sh
cd /opt/zouroboros/factory-workspaces/t_41ef7299/.mw-snd-seed
ln -s /opt/zouroboros/factory-workspaces/t_0aa85385/_tools/node_modules node_modules   # playwright 1.64.1 + chromium, as every day this week
npm test                     # exit 0, three times (baseline, with the score, final)
node tools/gallery.js        # screenshots/01-home.png now shows the MUSIC block; the other gallery assets were restored unchanged
```
