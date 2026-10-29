# Checkpoints
Author: Ethan

Select a synthetic session, open Checkpoints, save a named baseline and append known counters plus a compaction. Compare from the saved point, switch sessions, restart and delete a point. `tests/checkpoints.spec.ts` checks exact displayed deltas, isolation, persistence, hidden-window mode, privacy, keyboard access, zoom and axe with a failing positive control. `tests/core/checkpoints.test.ts` covers missing data, counter decreases, late records, locked storage, bounds, invalid input, clear and restart. `tests/cli.test.mjs` covers the separate Node-only cache and commands. `tests/upgrade-current.spec.ts` retains a checkpoint across 1.2.0 rollback/forward use.

Missing baselines are Unavailable. Observed compactions are differences in retained timestamp counts; late records are included. Do not interpret these values as wall-clock billing or current context occupancy. The normal installed app and private source files must not be used for these tests.
