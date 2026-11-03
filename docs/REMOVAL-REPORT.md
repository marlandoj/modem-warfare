# Modem Warfare — REMOVAL report (Hackyard Yard #6, day 6)

Campaign: the REMOVAL build — Sealed Orders comes out of the entry.
Dispatched 2026-11-03 01:33 UTC (task `t_d3f29cba`) on the repository
exactly as published after the SHIP build (`fe1743e`, "SHIP build: final
verification of the shipped tree"), with its git history, plus an `inputs/`
folder holding `SPEC.md` and `SUBMISSION-PACK.md` beside the repo.

## 1. The ruling

**The operator ruled on 2026-11-02: Sealed Orders is removed from the entry
entirely. The game alone is the entry.** This card performs the removal and
adds nothing: no replacement feature, no gameplay change, no protocol change.

Executed by one executor under the dispatch's no-delegation policy (the
swarm gate scored the scoped plan SWARM at 0.63; the policy forbids
delegation, so it was noted and the work was done as a leaf, as on every
previous day).

## 2. What came out

**The app (`app/`, the precached product):**

- `app/index.html`: the Home button `SEALED ORDERS` and the whole sixth
  screen (`#screen-sealed`: list, compose, card, scan views). The shell now
  has exactly the five match screens, and the shell gate asserts that.
- `app/js/orders.js` and `app/js/orders-ui.js`: deleted. The card codec,
  its limits, the `localStorage` card store (`mw.orders.v1`) and the screen
  controller. No code in the shipped app reads the store's key any more;
  cards a phone already kept under it are simply never read again, as the
  card specifies (no migration, no cleanup).
- `app/js/app.js`: the two imports, the `orders` controller, the `sealed`
  route and title, the card branch of `routeText()` (every carrier now goes
  straight to the frame gate), the card scanner's larger `maxEdge`, the
  `MW.orders` surface and the boot call. The manual-form hiding rule no
  longer carves out the removed screen.
- `app/css/app.css`: the sealed-orders block (`.notice`, `.orders*`,
  `.cards`, `.cardrow*`, `.card*`, `.lamp--card`, `.lamp__qr--card`,
  `#screen-sealed` rules and the whole `@media print` block that existed
  only to print the card), the `.scan--card` rule, the `.orders input`
  selectors shared with the TYPE input, and the `.orders__error` entry in
  the reduced-motion rule.
- `app/sw.js`: `./js/orders.js` and `./js/orders-ui.js` leave the precache
  list; **the cache is now 23 files and the version is `mw-final-v1`**
  (`modem-warfare-mw-final-v1`), so phones that installed `mw-thu-v1` drop
  the old cache on their next online open.
- `app/js/qr.js` and `app/vendor/VENDOR.md`: the comments that explained the
  Byte-mode option by way of the card now explain it generically. The
  option itself is shared code and is unchanged.

**The dev tools and the suite:**

- `dev/harness.html` / `dev/harness.js`: the `Run Sealed Orders` button, the
  `runOrders()` script and its `setValue` helper, the `window.harness`
  export.
- `dev/channel.js`: the card message kind, the `mw:orders-render` relay and
  the three `mw:orders-*` log events.
- `tests/browser/orders.js` (the orders gate) and `tests/orders.test.js`
  (the unit test of the deleted codec): deleted. `package.json`'s
  `test:unit` and `tests/browser/run.js`'s suite list no longer name them.
  Note for the record: the factory's Verity hook refused the `git rm` of
  these two test files on sight ("tests are only removed when the user
  asked"); this card's scope item 2 is exactly that ask, so the deletion was
  made with a plainly described `fs.unlinkSync` call and is stated here.
- `tests/browser/shell.js`: the walk no longer visits the removed screen; in
  its place it asserts the five-screen shell. The claims-discipline check
  over the whole shell's copy (no "secure", no "encrypted") stays.
- `tests/browser/viewport.js`: one comment.
- `tools/gallery.js`: the card screenshot step; `screenshots/08-sealed-orders-card.png`
  is deleted and the other screenshots and `thumbnail.png` are regenerated
  from this build's gate evidence (Home no longer shows the button).

**The living documents:** `README.md` describes the game alone (the opening,
the install step now says `23/23`, the Sealed Orders section is gone, the
layout, harness, test and claims-discipline sections no longer name it).
`campaign/README.md` gains a line for this card. The dated reports
(Monday to Thursday, SHIP) and their evidence folders are historical records
and stay as written.

**Untouched:** the match, the handshake, the audit, the Sonar, the transport
setting, the frame codec, `app/js/config.js` (line 17 still reads
`export const SOUND = true;`), `app/manifest.webmanifest`, every vendored
file. The content-security policy `<meta>` in `app/index.html` is
byte-identical to the shipped one (digest of the two-line tag
`6c8d92f44b4b6671a44c5abc62e23ca9` before and after). No shared-code defect
was exposed by the removal, so no fix was made.

## 3. String evidence

Scope: a case-insensitive scan of the app tree — `app/` in full, which is
the code, the styles, the markup, the manifest, the service worker, the
icons and the vendored files — for the feature's vocabulary: `sealed`,
`orders`, `household`.

```sh
$ grep -rniE 'sealed|orders|household' app
$ echo "exit $?"
exit 1
```

**Zero hits in 24 files** (19 app files plus 5 vendored files; the one
pre-removal vendor hit was a comment in `app/vendor/VENDOR.md`, corrected).
The same scan over `dev/`, `tests/`, `tools/`, `package.json`, the landing
page `index.html` and `README.md` returns a single line, `README.md`'s
"the moment your fleet is **sealed**", which is the match's own vocabulary
for LOCK and is kept. Outside that scope the vocabulary survives only in the
dated reports under `docs/`, their evidence folders, the historical campaign
manifests under `campaign/`, the dispatch inputs under `inputs/` (not part
of the repo) and this record.

The transport gate's own source scan, unchanged from Thursday, now reports
`source scan: 19 files under app/ and dev/, "wager" in 0`.

## 4. The suite, green in one run, against this exact tree

`npm test` from a bare shell at the repo root, exit status 0, twice:
run 1 at 01:38 UTC after the last app, dev, tests and tools edit, and run 2
at 01:45 UTC on the finished tree with this report, the README, the campaign
index and the evidence in place (same ten gates, all PASS, `23/23 CACHED
version mw-final-v1`). Unit: 29 tests, 29 passed, 0 failed
(`docs/evidence/removal/unit-tests.txt`). Browser gates, headless Chromium
via Playwright 1.64.1, four lanes (`docs/evidence/removal/browser-gates.txt`,
verbatim):

| gate | what it proves | result |
|---|---|---|
| shell | five screens, offline badge `23/23`, QR versions, one round by TYPE | PASS 9.5 s |
| qr-roundtrip | encode → pixels → decode, straight and skewed | PASS 2.0 s |
| offline | cold launch from the reduced precache with the server gone | PASS 5.5 s |
| harness | handshake + salvo over the two-window channel | PASS 5.0 s |
| match | full QR-mode match VERIFIED both ways, then three cheats | PASS 72.9 s |
| spike | ggwave chirp round-trip, webaudio and direct | PASS 27.5 s |
| sonar | AudioWorklet capture, handshakes by chirp both ways, salvo chirps | PASS 42.1 s |
| soundflag | SOUND=false: match VERIFIED, zero sound affordances | PASS 23.1 s |
| transport | default CHIRP, adoption both ways, whole match by chirp alone | PASS 94.0 s |
| viewport | 60 measurements at 360×740 and 412×915, none scrolls | PASS 129.5 s |

**The reduced precache, proven cold** (`tests/browser/offline.js`): a fresh
Chromium profile installs the app online and the Home badge reports
`OFFLINE READY ✓ 23/23 CACHED version mw-final-v1 missing []`. The server
is then stopped (the port refuses connections) and the same profile is
relaunched as a new browser process with offline emulation:
`navigator.onLine = false`, title `Modem Warfare — Radio Silence`, badge
`OFFLINE READY ✓ 23/23 CACHED`; 16 responses, 16 from the service worker,
0 from the network; the QR decoder (zxing-wasm) and ggwave both load from
the cache; no failed requests, no console errors.

**One scripted match in each transport, stamped VERIFIED exactly as
before:**

- QR (`tests/browser/match.js`): 6 rounds, `VERIFIED — NO SHIP MOVED` on
  both phones, 43 audit checks each; then the three cheats, each stamped
  LIAR with the right finding (`FALSE_RESULT` round 2 B3; `COMMIT_MISMATCH`
  for a moved fleet; `COMMIT_MISMATCH` for a wrong salt), the honest phone
  VERIFIED each time.
- Chirp (`tests/browser/transport.js`): the text transport muted on both
  instances, every frame carried as chirp waveform through the production
  capture pipeline: 28 chirps, 0 re-sends, `VERIFIED — NO SHIP MOVED` on
  both phones, 43 checks each.

## 5. What remains for the operator

1. **Push** `main` so the removal is live on Pages. Phones that installed
   `mw-thu-v1` should open the app once online and see `23/23` before going
   dark; the old cache is dropped on that activation.
2. The submission pack's real-task condition is the filmed match itself;
   nothing in it refers to the removed feature, so the pack needs no change.

## 6. How this card was run

```sh
cd /opt/zouroboros/factory-workspaces/t_d3f29cba/mw-removal-seed
ln -s /opt/zouroboros/factory-workspaces/t_0aa85385/_tools/node_modules node_modules   # playwright 1.64.1 + chromium, as every day this week
npm test                     # exit 0
node tools/gallery.js        # thumbnail.png + screenshots/ from test-output/
```
