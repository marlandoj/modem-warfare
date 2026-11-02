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
