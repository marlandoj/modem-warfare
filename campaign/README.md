# Monday campaign — task decomposition

Hackyard Yard #6 · Modem Warfare · day 1 (Mon 2026-11-02). The brief asked for
a swarm decomposition with a real domain persona on every task. This dispatch
ran under a leaf-executor policy (no delegation), so the five manifests below
were executed **sequentially by one executor wearing each persona in turn**,
in dependency order. The manifests are kept so the same decomposition can be
re-dispatched to parallel executors on later days.

| id | task | persona | depends on |
|---|---|---|---|
| T1 | Frame codec + QR encode/decode + round-trip tests | Protocol engineer | — |
| T2 | PWA shell, precache service worker, manifest, six screens | PWA frontend lead | T1 (frame rendering) |
| T3 | Desktop two-window dev harness over BroadcastChannel | Developer-tooling engineer | T1, T2 |
| T4 | Android ggwave spike page + in-browser loopback | DSP / audio engineer | T1 |
| T5 | End-of-Monday gates and report | QA engineer | T1–T4 |

Order executed: T1 → T2 → T3 → T4 → T5. See the YAML manifests for scope,
done-when and evidence pointers.

## Tuesday campaign (day 2, dispatched 2026-11-02 evening)

Same shape, same leaf-executor policy (the dispatch stated that the write
scopes overlap in `app/js/app.js`, so no delegation). The swarm gate scored
the scoped plan SWARM (0.90); the policy ruled, and the five manifests were
executed sequentially by one executor in dependency order.

| id | task | persona | depends on |
|---|---|---|---|
| T6 | Placement for real, vendored SHA-256 commitment, WAGER frame, gate seen-set | Protocol engineer | T1, T2 |
| T7 | Salvo round loop over the Lamp, staggered reveal, sunk detection, feel | PWA frontend lead | T6 |
| T8 | Endgame reveal, audit, stamp, forfeit, rematch | Security engineer | T6, T7 |
| T9 | Harness plays whole matches: replay, tamper hook, automated players | Developer-tooling engineer | T3, T7, T8 |
| T10 | End-of-Tuesday gates and report | QA engineer | T6–T9 |

Order executed: T6 → T7 → T8 → T9 → T10.

## Wednesday campaign (day 3, dispatched 2026-11-02 evening)

Same shape, same leaf-executor policy (the dispatch's orchestration policy
ruled out delegation: the write scopes overlap in `app/js/app.js`,
`app/index.html`, `app/css/app.css` and `app/sw.js`). The swarm gate scored
the scoped plan SUGGEST (0.42); the policy ruled, and the five manifests were
executed sequentially by one executor in dependency order.

| id | task | persona | depends on |
|---|---|---|---|
| T11 | Sonar engine: ggwave under the unchanged CSP (vendor patch), AudioWorklet capture, feel effects | DSP / audio engineer | T4, T7 |
| T12 | The kill switch: one flag in `config.js`; Sonar row, near-miss drama, effects wired | PWA frontend lead | T11 |
| T13 | Sealed Orders as a full feature: codec, limits, store, screen | Product-minded frontend (claims discipline) | T2, T6 |
| T14 | Harness carries chirps and cards; mutable frame transport; served overrides | Developer-tooling engineer | T9, T11, T13 |
| T15 | End-of-Wednesday gates and report | QA engineer | T11–T14 |

Order executed: T11 → T12 → T13 → T14 → T15.

## Thursday campaign (day 4, dispatched 2026-11-02 evening, run 2026-11-02/03)

The first real-phone playtest (two Android phones, 2026-11-02; 10 of 10
chirps decoded) produced three operator rulings, which are this campaign's
spine: transport is a pre-game setting carried by the handshake; the wager
is removed everywhere; match play never scrolls. Same leaf-executor policy
(the dispatch's orchestration policy forbade delegation: the write scopes
overlap in `app/js/app.js`, `app/index.html`, `app/css/app.css`,
`dev/harness.js`). The swarm gate scored the scoped plan SWARM (0.86); the
policy ruled, and the four manifests were executed sequentially by one
executor in dependency order.

| id | task | persona | depends on |
|---|---|---|---|
| T16 | Transport setting: Home control, handshake nibble, joiner adoption, one carrier per match | Protocol engineer | T6, T11, T12 |
| T17 | Wager removed from the shell, the frame family, the harness and the suites | PWA frontend lead | T16 |
| T18 | One unmoved screen (fixed viewport, `--avail` sizing) and the feel pass | Technical art / UX | T16, T17 |
| T19 | End-of-Thursday gates (transport, viewport) and report | QA engineer | T16–T18 |

Order executed: T16 → T17 → T18 → T19.

## SHIP and REMOVAL (days 5 and 6, 2026-11-03)

The SHIP card (`docs/SHIP-REPORT.md`) verified the Thursday tree and made
the repository submission-complete. The REMOVAL card
(`docs/REMOVAL-REPORT.md`) carried out the operator's ruling of 2026-11-02
that Sealed Orders (T13) leaves the entry: the game alone is the entry, the
precache is 23 files at `mw-final-v1`, and the orders gate and unit test
now prove the removal instead of the card. T13 above stays as the
historical record of the Wednesday build.

## SOUNDTRACK (day 6, 2026-11-03)

The SOUNDTRACK card (`docs/SOUNDTRACK-REPORT.md`) added the operator's
wartime score, rock-forward after his choice between the two references:
an original composition synthesised through WebAudio (`app/js/music.js`),
a MUSIC setting on Home under the SOUND master, the duck to exactly zero
gain under every Sonar window and chirp, and the soundtrack gate and unit
test. The precache is 24 files at `mw-final-v2`. Nothing else changed.

## Trusted check

Every manifest carries `verify: npm test` (unit codec tests plus the five
Playwright browser gates). The factory's Verity gate only honours a check it
did not get from the executor: the dispatcher's `verify:` field, an operator
policy entry, or `.verity.json` at the dispatch's base revision. Monday's
dispatch carried none of these and the repository was created during the
run, so its gate reported the work as unverifiable regardless of the test
results. Any re-dispatch of these manifests must copy `verify:` into the
task body (or the operator sets `verify: none` as an explicit waiver).
`.verity.json` at the repo root now names the same check for dispatches that
start on top of this commit.
