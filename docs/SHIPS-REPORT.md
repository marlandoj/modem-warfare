# Modem Warfare — SHIPS report (Hackyard Yard #6, day 6)

Campaign: the SHIPS build — the fleet must look like ships. Dispatched
2026-11-03 04:07 UTC (task `t_a764a8d2`) on the repository exactly as
published after the SOUNDTRACK build (`295474f`), with its git history.

## 1. The ruling

The operator played the game on two phones on 2026-11-02; the chirps decoded
10/10 with the score playing. His one correction: **the ships do not look
like ships, they are just blocks.** This card changes the fleet's appearance
and nothing else. Executed by one executor under the dispatch's
no-delegation policy.

## 2. The rendering approach, and why

Before this build a ship was its grid cells with a grey gradient and a
rounded end on the bow and stern cells: rectangles with shaped ends.

Now every ship cell carries **one inline SVG segment**, generated in code by
the new module `app/js/ships.js` and set as the cell's only child by
`renderBoard()`. Why inline SVG rather than canvas or pure CSS:

- **Cell-exact honesty for free.** The SVG is positioned over the cell's
  own border box (`inset: -1px` so it reaches the cell's outer edge; the
  cell keeps its box and its `data-cell`). Nothing is drawn outside the
  100×100 viewBox, which is the cell; the hull spans the full box in the
  ship axis so segments join across the 3 px grid gap, and is inset in the
  cross axis so water shows beside the hull. The gap stays visible on
  purpose: it is the one seam that tells you where one cell ends and the
  next begins, which the design rulings asked to keep.
- **The states are stylesheet work, not redraws.** Every part of a segment
  is a class (`sh-hull`, `sh-deck`, `sh-edge`, `sh-turret`, `sh-funnel`,
  …) coloured from `app/css/app.css` through custom properties on the
  `.ship` element. `cell--hit` and `cell--sunk` swap the palette; the
  existing hit / sunk / sinking / settled machinery in `app.js` is
  untouched and simply has art under it instead of a gradient.
- **No assets, no network, no CSP change.** Markup only, no `style=`
  attributes (the app's `style-src 'self'` would block them), no image. The
  module is 10.5 KB and joins the precache as code, as the score did.
- **One drawing serves every size.** The same segments draw at 49 px
  (placement), 23 px (the game-over boards), 21 px (the mini boards) and
  16 px tall (the strip). Plating lines hide below mini size; the
  silhouette, the hull width and the state colour do the work there.

The hull outline is drawn as **open edge paths** (top and bottom deck
edges, the bow curve, the stern curve), never as a stroked closed shape, so
no segment has a line across the seam: the deck edges run straight on into
the next cell and the ship reads as one vessel. A vertical ship is the same
drawing under `rotate(90 50 50)`: the bow, which is the last cell and
therefore the bottom one, points down. Rotation on the placement board
redraws every segment in the other orientation with no stretch (the gate
checks it both ways).

## 3. The segment scheme, per class

Every segment is drawn horizontal, bow to the right, in a 100×100 box. The
hull fills `y = 50 ± hw` (hw = half-width) with a 5-unit darker side band
and a lighter deck inside it. Roles: **stern** (`k = 0`, rounded transom),
**mid** (`0 < k < size−1`, straight run), **bow** (`k = size−1`, pointed,
with forecastle lines converging on the bow, a capstan and two hawse
pipes). The bridge sits on the mid nearest the bow, or on the stern when
the ship has no mids (the 2-ships).

| fleet index | class | hw | stern | mids | bow |
|---|---|---|---|---|---|
| 0 · the 4-ship | **battleship** (the capital ship) | 29 | twin-barrel aft turret pointing aft, two AA mounts, a stern fitting | mid 1: aft deckhouse, funnel 2, two secondary mounts; mid 2: the big bridge block with its tower, windows line and mast, funnel 1 aft of it, two AA mounts forward | twin-barrel forward turret, forecastle |
| 1 · the 3-ship | **cruiser** | 26 | helicopter pad (ring + core) aft, twin-barrel aft turret | the bridge block with tower, one funnel, a ship's boat on each side | twin-barrel forward turret, forecastle |
| 2 · a 2-ship | **destroyer** | 23 | two depth-charge racks on the transom, a raked funnel, the bridge | — | single gun, forecastle |
| 3 · a 2-ship | **corvette** | 20 | a triple torpedo-tube mount, a small exhaust, the wheelhouse | — | light gun, longer bow taper, forecastle |

The four hull widths tell the classes apart on the mini boards and in the
strip where no fitting is legible. Palette: haze-grey hull sides `#4b5964`,
deck `#7f8e9a`, superstructure `#a7b5bf` / `#cdd7de`, fittings `#99a8b3`
over `#2d3942`, funnels `#2b343c` with a signal-amber cap (the game's
amber), outline `#b7c5cf`, plating lines in sea-ink. The ship cell's water
is a slightly deeper navy than open water so occupancy still reads under
the hull.

**States.**
- *Hit*: the tile keeps the existing fire gradient and fire border; the
  segment's palette goes to scorched browns with an orange edge, and a
  fireball (`::after`, a white-cored orange radial with glow) sits on the
  segment. On the enemy board, which has no fleet until the reveal, a hit is
  the same fire tile as before.
- *Sunk*: the tile's border goes transparent and its water goes dark, so
  what remains is the hull as a **dark wreck silhouette with a rust-red
  outline** and a small red breach marker; the existing `cell--settled`
  transform lowers, tilts and shrinks it, and `cell--sinking` plays the
  same sink animation cell by cell from the stern. The wreck is darker and
  lower, and still shaped like the ship.
- *Strip*: each line is one SVG of the whole ship (the segments end to end,
  bow right, 16 px tall); each segment is a `.fleet__cell` group with its
  cell index, so the reveal marks a hit segment in fire exactly as it marked
  a block before, and a sunk line dims and lists as before.

## 4. What changed, and what did not

- `app/js/ships.js` — new: the segment generator (`segmentSvg`) and the
  strip silhouette (`shipSvg`); the class table and the fittings per role.
- `app/js/app.js` — `renderBoard()` sets the segment as the ship cell's
  child and records `data-segment`; `renderFleet()` builds one silhouette
  per ship instead of a row of blocks. The reveal, the sinking, the
  placement interactions (tap to rotate, reroll, lock) are untouched.
- `app/css/app.css` — the ship cell becomes water with a quiet border and
  the segment over it; the ship palette and its hit / sunk variants; the
  strip rules. Every other rule is as it was.
- `app/sw.js` — `./js/ships.js` joins the list: **25 files, version
  `mw-final-v3`** (`modem-warfare-mw-final-v3`), so phones on `mw-final-v2`
  drop the old cache on their next online open.
- `tests/browser/ships.js` + `tests/browser/ships-sheet.html` — the new
  gate (§5). `tests/browser/run.js` lists it. The removal and score checks
  (`tests/orders.test.js`, `tests/music.test.js`, `tests/browser/orders.js`)
  learn the new count and version.
- `README.md` — the badge count, the cache name, one technical note.
- Gallery: `screenshots/01-home.png` (badge now 25/25), `02-placement`,
  `04-battle-target`, `06-reveal`, `07-game-over-verified` and
  `thumbnail.png` (its right phone shows the reveal) regenerated from this
  tree by `node tools/gallery.js`; `03-salute-qr` and
  `05-battle-exchange-chirp` show no ship and were left as published.
- **Untouched**: `app/js/fleet.js` (placement logic), the frame codec, the
  audit, the audio, the score, the Sonar, `app/index.html` (the CSP `<meta>`
  is byte-identical, asserted by the removal unit test), the manifest,
  every vendored file. No gameplay change.

## 5. The bar, proven

`npm test` from the repo root, exit status 0: 43 unit tests and 13 browser
gates (the twelve that were, plus `ships`), in one run after the last edit:

```
shell: PASS (10.7 s)        qr-roundtrip: PASS (2.6 s)   offline: PASS (6.2 s)
harness: PASS (5.7 s)       orders: PASS (4.6 s)         match: PASS (78.5 s)
spike: PASS (27.8 s)        sonar: PASS (41.4 s)         soundflag: PASS (24.0 s)
transport: PASS (97.2 s)    viewport: PASS (142.7 s)     soundtrack: PASS (125.2 s)
ships: PASS (28.5 s)
```

The offline gate's cold install reads `OFFLINE READY ✓ 25/25 CACHED version
mw-final-v3 missing []`; the orders gate finds exactly one cache,
`modem-warfare-mw-final-v3`, with 25 URLs. The scripted matches run in both
transports (match, transport, viewport, soundtrack). Full output:
`docs/evidence/ships/browser-gates.txt` and `unit-tests.txt`.

**The ships gate** (`tests/browser/ships.js`, 412×915, QR mode, the TYPE
path) drives one phone through placement with a fixed fleet, a tap-rotate of
the capital ship to vertical and back, the Salute, a round that sinks a
ship on each side and burns a cell of the capital ship, the rounds to the
end, and the game-over reveal. At every stop it asserts: every ship cell
holds exactly one segment and nothing else; the segment's box lies inside
its cell's box (no overflow into a neighbour; the settled wreck is exempt
because its transform is the Thursday treatment); no water cell carries
art; each ship's segments run stern → bow and carry its class on every
cell; a vertical ship carries the rotation on every cell with the bow at
the bottom; the strip has one silhouette per ship with one group per cell
and no blocks; the sinking ran stern-first over drawn segments; a hit
segment keeps its art and has the fireball; the strip reads `1/4 HIT` and
`SUNK`; at game over the revealed enemy fleet is 11 settled wrecks in four
classes and my fleet shows its hit and its wreck. No console or page error.

## 6. The screenshots (evidence for the operator's eye)

All under `docs/evidence/ships/`, every pixel from headless Chromium
running `app/` as served by `tools/serve.js`:

- `ships-placement.png` — the placement board with the full fleet: the
  battleship A2–D2, the cruiser G3–G5 (vertical), the destroyer C6–D6, the
  corvette E1–E2 (vertical).
- `ships-placement-rotated.png` — the same after one tap on the battleship:
  vertical A2–A5, redrawn bow-down.
- `ships-reveal.png` — mid-game, after round 1: the enemy board with two
  hits, my mini board with the corvette sunk (settled wreck) and the
  battleship's stern cell burning, the strip reading `1/4 HIT` / `SUNK`.
- `ships-gameover.png` — the verdict: my fleet with its hit and its wreck,
  the enemy fleet revealed as four classes, every cell a settled wreck.
- `ships-sheet.png` — the art sheet: every class horizontal in the intact,
  one-hit and sunk states, and vertical, at 64 px cells, drawn by the real
  module under the real stylesheet (`tests/browser/ships-sheet.html`).

## 7. What remains unproven on physical phones

- How the art reads on the two real phones' screens and densities (the
  gate renders at 2.75× and 2×; the operator's phones were not available
  here). In particular whether the 3 px seam between segments reads as a
  seam or as a break at arm's length, and whether the wreck silhouette is
  dark enough against the real panel.
- The sinking animation's feel with art under it, on hardware, with the
  score playing.
- The filmed uncut match is still ahead; this build changes nothing it
  depends on.
