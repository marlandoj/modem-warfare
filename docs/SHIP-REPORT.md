# Modem Warfare — SHIP report (Hackyard Yard #6, day 5)

Campaign: the SHIP build — final verification and repository completion.
Dispatched 2026-11-03 00:50 UTC (task `t_b986b028`) on the repository
exactly as published after the Thursday build (`65e9ad3`, "tooling: browser
gates run in parallel lanes"), with its git history, plus an `inputs/`
folder holding `SPEC.md` and `SUBMISSION-PACK.md` beside the repo. The
features are frozen. This card proves the shipped tree end to end and makes
the repository submission-complete.

Executed by one executor under the dispatch's no-delegation policy (the
swarm gate scored the scoped plan SWARM at 0.57; the policy forbids
delegation, so it was noted and the work was done as a leaf, as on every
previous day).

## 1. Final verification — the tree is already perfect; nothing in it changed

**Gameplay, protocol, audit, service worker, stylesheet, markup: untouched.**
No defect was found, so no defect fix was made. The only files added or
changed are documentation and assets (§2–§4) and one dev tool,
`tools/gallery.js`, which is not in the precache and is never loaded by the
app.

- The content-security policy `<meta>` in `app/index.html` is byte-identical
  to Wednesday's and Thursday's (digest of the two-line tag
  `6c8d92f44b4b6671a44c5abc62e23ca9` before and after; `app/index.html`
  itself md5 `8d435d84b7228def2f6584cb2f2cf3de`, unchanged from `HEAD`).
- `app/js/config.js` line 17 still reads `export const SOUND = true;`.
- `app/sw.js` is unchanged: **the shipped cache name is `mw-thu-v1`**
  (`modem-warfare-mw-thu-v1`), 25 precached files. Nothing precached
  changed, so the version is correctly not bumped; phones that installed
  the Thursday build need nothing.

### The full suite, twice, against this exact tree

`npm test` from a bare shell at the repo root, exit status 0 both times
(run 1 at 00:52 UTC, run 2 at 01:00 UTC, after the last file was written).
Unit: 39 tests, 39 passed, 0 failed (`docs/evidence/ship/unit-tests.txt`).
Browser gates, headless Chromium via Playwright 1.64.1, four lanes
(`docs/evidence/ship/browser-gates.txt`, run 1 verbatim; run 2 timings in
the right column):

| gate | what it proves | run 1 | run 2 |
|---|---|---|---|
| shell | six screens, offline badge, QR versions, one round by TYPE | PASS 11.0 s | PASS 11.4 s |
| qr-roundtrip | encode → pixels → decode, straight and skewed | PASS 2.3 s | PASS 2.1 s |
| offline | cold launch from the precache with the server gone | PASS 5.5 s | PASS 6.0 s |
| harness | handshake + salvo over the two-window channel | PASS 5.2 s | PASS 5.1 s |
| match | full QR-mode match VERIFIED both ways, then three cheats | PASS 71.4 s | PASS 71.5 s |
| spike | ggwave chirp round-trip, webaudio 10/10, direct 10/10 | PASS 27.2 s | PASS 27.4 s |
| sonar | AudioWorklet capture, handshakes by chirp both ways, salvo 10/10 | PASS 40.1 s | PASS 40.6 s |
| soundflag | SOUND=false: match VERIFIED, zero sound affordances | PASS 23.0 s | PASS 23.3 s |
| orders | Sealed Orders compose / keep / done / reload / pass on / pixels / copy | PASS 4.4 s | PASS 4.1 s |
| transport | default CHIRP, adoption both ways, whole match by chirp alone | PASS 92.3 s | PASS 93.1 s |
| viewport | 60 measurements at 360×740 and 412×915, none scrolls | PASS 126.1 s | PASS 127.7 s |

**The cold offline launch** (`tests/browser/offline.js`): a fresh Chromium
profile in a temp dir installs the app online and the Home badge reports
`OFFLINE READY ✓ 25/25 CACHED version mw-thu-v1 missing []`. The server is
then stopped (the port refuses connections) and the same profile is
relaunched as a new browser process with offline emulation. Result, both
runs: `navigator.onLine = false`, title `Modem Warfare — Radio Silence`,
badge `OFFLINE READY ✓ 25/25 CACHED`; 18 responses, 18 from the service
worker, 0 from the network; the QR decoder (zxing-wasm) and ggwave both
load from the cache; no failed requests, no console errors.

**One scripted match in each transport:**

- QR (`tests/browser/match.js`): 6 rounds, VERIFIED — NO SHIP MOVED on
  both phones, 43 audit checks each; then the three cheats, each stamped
  LIAR with the right finding (`FALSE_RESULT` round 2 B3; `COMMIT_MISMATCH`
  for a moved fleet; `COMMIT_MISMATCH` for a wrong salt), the honest phone
  VERIFIED each time.
- Chirp (`tests/browser/transport.js`): the text transport muted on both
  instances, every frame carried as chirp waveform through the production
  capture pipeline (MediaStream → AudioWorklet → ggwave → gate): 6 rounds,
  28 chirps, 0 re-sends, 14 decodes per phone, 0 text frames seen,
  VERIFIED — NO SHIP MOVED on both phones, 43 checks each. The source scan
  in the same gate: 21 files under `app/` and `dev/`, the retired feature's
  name in 0.

Every failure mode the card names was looked for; none occurred. There is
no ship blocker from the suite.

## 2. README

`README.md` rewritten for a stranger landing on the repo: what the game is
(the settled blurb and the longer description from the submission pack),
the play URL (`https://marlandoj.github.io/modem-warfare/app/`), the
three-step phone install (open online once, wait for 25/25, add to home
screen, airplane mode), how to start a match (the transport setting, the
Salute by chirp and by QR, salvo rounds, the audit stamp and what VERIFIED
and LIAR mean, forfeit, re-sends and TYPE), Sealed Orders labelled **local,
not secret**, and the technical notes (no server, no account, no network
after install; the fleet commitment under a salted hash with the salt
revealed only at game over; the frame as the source of truth on either
carrier; the Sonar and the Lamp; the sound flag). The retired feature is
mentioned nowhere in the README. The only acoustic figure stated is the
measured one: 10 of 10 chirps decoded on two real Android phones at a metre
on 2026-11-02. iPhone is stated as untested, because it is. The developer
sections (layout, run, test, claims discipline, licences) are kept.

## 3. Gallery assets

All made by `tools/gallery.js` from the shipped build itself; no mockups.

- **`thumbnail.png`** (1280×720 at 1.5×): the Salute composition — two
  phones face to face, the left holding up its handshake QR, the right
  showing the reveal that follows (two HITs, a ship sunk), a chirp bolt
  between them, the title, the tagline and the spec's overlay line "NO
  INTERNET. JUST NOISE." The two phone screens are the viewport gate's
  real 412×915 screenshots of this tree (`viewport-412x915-qr-handshake.png`
  and `viewport-412x915-qr-reveal.png`); the frame, bolt and lettering are
  composed around them in headless Chromium.
- **`screenshots/`**, the current build's real screens from the gate
  evidence of run 1, phone-sized (412×915 at 2.75×, Android emulation,
  except Home at 420×860 at 2×, which is how the shell gate takes it):
  `01-home.png`, `02-placement.png`, `03-salute-qr.png`,
  `04-battle-target.png`, `05-battle-exchange-chirp.png`, `06-reveal.png`,
  `07-game-over-verified.png` (the stamp landed), and
  `08-sealed-orders-card.png`. The last one is the only screen the gates do
  not capture at phone size (the orders gate photographs the card inside
  the two-window harness), so the gallery tool composes a KITCHEN card
  through the shipped UI at the same phone viewport and photographs that.

## 4. Submission checklist (from `inputs/SUBMISSION-PACK.md`), each item's state

| item | state |
|---|---|
| Open-source repo public (marlandoj/modem-warfare) | DONE per the pack; this card's commit is on `main` locally and must be pushed (operator) |
| Playable build live on Pages, `mw-thu-v1` | DONE per the pack; nothing precached changed in this card, so the live build is this build once the push lands (the README, thumbnail and screenshots are not precached and do not affect the installed app) |
| Phone evidence: chirps 10/10 at a metre | DONE 2026-11-02 (stated in the README exactly so) |
| Airplane-mode operation confirmed | DONE 2026-11-02 on phones; re-proven here in the browser by the cold offline launch, both runs |
| A real mundane task done with the build (a Sealed Orders household card composed and passed for real) | OPERATOR — the suite and the gallery compose and pass a card in the browser; the pack asks for one real card before filming |
| Demo video filmed and uploaded | OPERATOR, with Jordan — shot list in the pack; nothing in the repo blocks it |
| Gallery listing submitted before Fri 2026-11-06 11:00 MST | OPERATOR (account act) — the listing copy, the play URL, `thumbnail.png` and `screenshots/` are in the repo ready to paste |
| README complete | DONE (this card) |
| Thumbnail in the repo | DONE (this card, `thumbnail.png`) |
| Screenshots in the repo | DONE (this card, `screenshots/`) |

## 5. What remains for the operator, plainly

1. **Push** `main` to `github.com/marlandoj/modem-warfare` so the README,
   thumbnail, screenshots and this report are public. The `inputs/` folder
   is untracked and should stay out of the repo (the spec and the pack are
   dispatch inputs; the README says the spec is not in the repo).
2. **Phone pass on this build** (unchanged from Thursday's §6, still not
   done on hardware): the fixed-viewport layout on both phones in portrait,
   installed and in the browser; the feel (shake, sinking, stamp); the
   microphone opening by itself on the Salute screens; a whole two-phone
   match over the air in chirp mode and over real cameras in QR mode; a
   Sealed Orders card through a real camera. Phones that installed an
   earlier build should open the app once online and see `25/25` before
   going dark.
3. **One real Sealed Orders card** composed and passed between the
   household's phones (the pack's real-task condition).
4. **Film** the uncut match with Jordan, per the pack's shot list, and
   upload it.
5. **Submit** the gallery listing before Friday 2026-11-06 11:00 MST.

## 6. How this card was run

```sh
cd /opt/zouroboros/factory-workspaces/t_b986b028/mw-ship-seed
ln -s /opt/zouroboros/factory-workspaces/t_0aa85385/_tools/node_modules node_modules   # playwright 1.64.1 + chromium, as every day this week
npm test                     # exit 0, twice
node tools/gallery.js        # thumbnail.png + screenshots/ from test-output/
```
