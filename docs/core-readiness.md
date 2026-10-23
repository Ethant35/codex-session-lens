# Core test and ingestion evidence

Author: Ethan

This record covers the Node-only `Store`, `Ingestor`, and projection layer. It does not qualify the packaged Electron runtime, full local history, UI responsiveness, or release artifacts.

## Skill methods used

| Skill | Applied method | Evidence |
|---|---|---|
| `property-based-testing` | Fixed seeds; constrained generated monotonic snapshots; independent latest-evidence oracle; permutation/replay/restart and session-partition invariants; explicit conflicting-timestamp and positive-control examples. | `tests/core/projection.test.ts`, `tests/core/ingestion.test.ts` |
| `test-driven-development` and `testing-patterns` | Real SQLite and filesystem boundaries; tests invoke production `Ingestor` and `Store`; synthetic fault trigger checks rollback/replay; failures are retained as regression evidence. | `tests/core/ingestion.test.ts` |
| `performance-optimization` | Measure first on synthetic inputs, report wall time, sampled peak RSS and event-loop lag; keep the workload bounded by default and make the larger case explicit. | `scripts/measure-ingestion.mjs`, results below |

## Running the core checks

`node scripts/test-core.mjs` bundles only `tests/core/*.test.ts` with esbuild and runs them with Node's built-in test runner. It does not launch Electron, open a window, read user Codex directories, or change global configuration. `fast-check` is a development dependency pinned to 4.10.2 in the current working tree. Property seeds are fixed in the source so a failure can be repeated.

The suite exercises real temporary SQLite databases. It covers input order, an independent latest-value oracle, equal-time ambiguity and later recovery, SQLite session isolation, duplicate replay and restart, a UTF-8 code point split across reads, and SQLite write rollback followed by cursor reset and replay. A synthetic SQLite trigger fails an insert and is dropped before replay; this is a deterministic write-failure injection, not an operating-system lock-contention test.

The suite passes 10/10 on Node v22.13.1. The two oversized-record cases cover an 8 MiB ASCII line and a multibyte UTF-8 line whose JavaScript character count is below 8 MiB but encoded byte length is above it. Each verifies a clear diagnostic and ingestion of the following valid session. The write-failure case injects a real SQLite trigger abort, verifies the transaction fails, removes the trigger, then confirms cursor reset, replay, restart, and no duplicate session.

## Synthetic ingestion baseline

Command: `node scripts/measure-ingestion.mjs --large`

Environment: Node v22.13.1, macOS, arm64. Each tier runs in a fresh child process. It generates the JSONL input with bounded streaming writes, scans the synthetic data into a fresh temporary SQLite database, verifies the exact expected final cumulative totals for every session, and removes all temporary data. It never opens Ethan's source files. RSS baseline is measured after input generation and store setup; peak RSS and event-loop lag are sampled every 5 ms through the scan and a short post-scan wait. A separate positive control deliberately blocks for 50 ms; the lag monitor reported 49.63 ms in this run. `--large` adds a 50,000-observation case. Default tiers are 1,000, 5,000, and 10,000 observations. Use `--sizes=1000,5000,10000 --files=4` for custom tiers. File count is limited to 1–138 and ordinary tiers to 1–100,000 observations per run.

| Synthetic observations | Input bytes | Files | Scan wall time | Baseline → peak RSS | Peak RSS delta | Maximum sampled event-loop lag |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 309,624 | 4 | 32.54 ms | 45.73 → 63.61 MiB | 17.88 MiB | 11.71 ms |
| 5,000 | 1,555,632 | 4 | 121.09 ms | 51.45 → 104.11 MiB | 52.66 MiB | 58.38 ms |
| 10,000 | 3,122,636 | 4 | 235.44 ms | 51.33 → 156.38 MiB | 105.05 MiB | 121.05 ms |
| 50,000 | 15,702,644 | 4 | 1,230.04 ms | 51.69 → 301.02 MiB | 249.33 MiB | 765.61 ms |

The first benchmark version has been withdrawn: its timestamp formatter emitted invalid minute values after 59 seconds, it checked only for nonempty totals, generated all rows in parent memory, and stopped lag sampling before a deferred callback could capture synchronous database work. Do not use its previously reported numbers. This corrected run establishes exact result checks and bounds input generation. Results are still a single run, not a performance budget or before/after comparison. The 50,000-record run adds about 249 MiB of RSS and blocks the Node event loop for a sampled maximum of 766 ms during synchronous projection/save. This is evidence for the primary agent's storage-batching and responsiveness work, not a proposed acceptance threshold.

Cancellation was checked with `node scripts/measure-ingestion.mjs --sizes=50000 --cancel-after-ms=10`. It stopped the scan in 11.25 ms and verified that no partial sessions were committed. The process RSS delta was 2.73 MiB. A 1 MiB representative-shape validation created 138 files with a 0.5 MiB largest synthetic file and exact target byte totals. The full opt-in corpus was not run: `node scripts/measure-ingestion.mjs --representative` is configured to generate 138 synthetic files totaling 3,051.3 MiB with a largest file of 604.2 MiB, and it checks available temporary disk space before writing. Full-size representative ingestion and packaged Electron responsiveness remain unqualified. `--total-mib` and `--largest-mib` permit bounded smaller-shape validation; `--cancel-after-ms` exercises cancellation and verifies no partial database commit.

## Bounded streaming implementation

The scan path now stages allowlisted observations into the SQLite transaction in batches of 128 and yields to the event loop between batches. It does not keep a scan-sized observation map in memory. A rollback covers source rows, deduplication keys, and projected sessions together. Cancellation or a write/projection failure rolls the transaction back and clears in-memory cursors so a later scan replays the source. The service serializes Store writes while this transaction spans file reads and event-loop yields. Source files are opened once with no-follow and nonblocking flags, checked as regular files, and read through the same descriptor. Mixed session identities remain rejected for that file until it is reset. Incomplete trailing lines are rewound to their byte offset, so cursors do not retain partial-line text across scans.

At commit, the Store orders observations through an expression index on session, canonical timestamp, and key. It streams each session through an incremental reducer, yielding every 256 rows. Equal-timestamp conflicts retain constant reducer state rather than an array of all rows in the timestamp group. SQLite's main page cache is capped at 8 MiB; temporary storage uses files and a 2 MiB temporary page cache. Session snapshots and compaction lists still occupy memory in proportion to their returned output.

The focused Node suite passes 20/20 on Node v22.13.1. It covers write-failure and SQLite-full rollback/retry, cancellation after a staged batch with no partial cache state, a 5,000-row equal-time conflict group, generated projection equivalence against a separate array-based reference reducer, cached session and observation shape rejection with fixed sanitized errors, mixed-identity rejection, no-follow/special-file refusal, partial UTF-8 append replay, and forked-subagent inherited-prefix filtering with independent expected totals and restart replay. Existing save API tests continue to pass. `Store.clear()` now relies on `secure_delete=ON` and avoids `VACUUM` after commit, so it cannot report a post-commit vacuum error as though the clear had rolled back. The cache file can retain its allocated size after clear.

Forked subagent records use the top-level JSONL `ordinal`, not physical line numbers. Rows with ordinals below the child metadata's `subagent_history_start_ordinal` are inherited history and are excluded from the child's telemetry projection. The child header remains the source for its own identity and parent relationship. Rows without a valid ordinal are skipped with one fixed diagnostic per file. Compatibility conditions and source evidence are recorded in [source-compatibility.md](source-compatibility.md).

Two intermediate 50,000-observation runs, before source-reader hardening, measured 580.37–591.87 ms, +29.92–30.94 MiB peak RSS, and 10.68–11.82 ms maximum sampled event-loop lag. The final run after reader hardening processed 50,000 observations / 15,702,644 bytes in 723.73 ms, with RSS 52.03→88.27 MiB (+36.23 MiB) and 12.13 ms maximum lag. Exact per-session totals passed. The 50 ms positive control measured 48.58 ms. Against the corrected baseline (1,230.04 ms, +249.33 MiB RSS, 765.61 ms lag), the final run still shows lower time, memory growth, and event-loop lag. These are local synthetic measurements, not a performance budget or cross-machine variance estimate.

The final 10 ms cancellation run stopped in 10.10 ms, used 2.31 MiB additional RSS, and verified no partial sessions. A full representative synthetic corpus was scanned after reader hardening. It contained 138 files and 3,199,519,949 bytes, with one 633,549,619-byte file. The run took 27,865 ms, raised peak RSS by 75.47 MiB, and had 13.32 ms maximum sampled event-loop lag. It verified exact generated totals and the script removed the temporary corpus. This workload models the local file count and byte sizes, but has one telemetry event per file and large unrecognized JSON lines; it does not model a real 3 GiB session history or qualify packaged Electron responsiveness.

`node scripts/measure-ingestion.mjs --soak-seconds=120` appends one synthetic cumulative snapshot per second, rescans, and checks the exact cumulative total after every scan. Before the final source-reader hardening, the 120-second run passed 120 append scans and 121 exact cumulative observations: p50 1.50 ms, p95 2.52 ms, max 5.25 ms; RSS 44.98→55.69 MiB (+10.70 MiB); max sampled event-loop lag 6.05 ms. After reader hardening, a 3-second smoke passed 3 append scans and 4 exact cumulative observations: p50 1.60 ms, p95/max 1.88 ms; RSS 45.61→46.66 MiB (+1.05 MiB); max sampled lag 0.97 ms. The positive control measured 48.51 ms. The longer run predates the final reader change; the short smoke is not a long-term real-user memory test.


## Final actual-history qualification

The final pure Node CLI read154 real local files totaling3,259,141,468bytes through explicit source arguments and an automatically removed temporary cache. It took61.36seconds with433,782,784bytes maximumRSS. The only remaining scan diagnostic was oversized records in15 files; a separate metadata pass counted39 records above the8MiB supported record limit. Exit2 correctly discloses partial coverage. No raw source content was published.

This scan found and drove the fork-history repair documented in source-compatibility.md. A separate Python calculation inspected only post-boundary, identity-matched usage records across48 actual fork files:45 child totals matched the latest direct thread_token_usage exactly;3 were explicitly unavailable because the latest timestamp contained distinct cumulative values. There were no unexplained mismatches. A naive last token_count comparison initially disagreed in16 cases:13 contained a later decreased legacy counter, which the app correctly retains with a warning;3 had same-time conflicts. Both evidence sources and the warning policy were checked, rather than treating every latest legacy value as authoritative. The comparison examined11,387 own telemetry records. No inherited telemetry records appeared in those actual prefixes; synthetic regressions exercise inherited usage/model/status contamination.

Final core suite20/20 and full Node suite46/46 pass after the repair. These observations qualify this local corpus with disclosed size/conflict limits, not every future Codex schema.
