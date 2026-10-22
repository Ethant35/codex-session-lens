# v1.0.1 telemetry ordering audit
Author: Ethan
Date: 2026-10-22
Status: all applicable local gates pass. Application source commit: 01a746c90180105c5966297e9b460745704ccbda.
Release: [v1.0.1](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.0.1).

## Reproduced defects
The v1.0.0 packaged app passed forward file order but failed reverse file order, delayed metrics across restart, and delayed compaction. The global lastActivity gate discarded older metric/model evidence after newer status, marked discarded records seen, and let a stale context estimate survive late compaction. The corrected baseline run had 1 pass and 3 expected failures in 20.0 seconds. Earlier fixture navigation failures were corrected before accepting this reproduction.

## Repair and accounting policy
The parser stores only allowlisted telemetry observations. One transaction commits the new observations, seen hashes and projections; a failure rolls back and resets source cursors for replay. Changed sessions are rebuilt in timestamp order, independently of file discovery order. Cumulative snapshots are never added together. Regressions retain the earlier accepted complete snapshot with a warning. Equal-time conflicting values are unavailable until newer evidence; the implementation does not guess cross-file ordering or fabricate a vector from componentwise maxima. Task, turn-context and compaction boundaries invalidate context even when discovered late. A boundary wins at an equal timestamp.

The transactional v1 migration keeps preferences and known history, seeds metric provenance, and clears v1 seen hashes once. This permits suppressed records to replay. Missing source history remains unknowable and is disclosed. A previously unavailable v1 context remains conservative until newer evidence when its invalidation history was not saved. Clear removes the observation ledger as well as projections and fingerprints.

## Primary-source basis
- [Codex protocol at 83086188ae0614bd882818ff1aa23f3194962012](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/protocol/src/protocol.rs): rust-v0.163.0 tag dereferenced to this commit; TokenUsageInfo and TokenUsageRecord distinguish latest/response and cumulative snapshots. The fill_to_context_window path can create total-only estimates, so component completeness remains necessary.
- [Rollout wire serialization at the same commit](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/history/src/rollout_payload.rs): token_usage_record is a top-level rollout item; token_count and task notifications use event_msg. Fixtures now use these envelopes.
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html): the persisted observation set, deduplication state and projection are committed together.
- [Electron automated testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing): tests drive the real packaged app. No unit/component tests or model/API mocks are used.

## Verification gates
| Gate | Result | Evidence |
| --- | --- | --- |
| Released v1 baseline | 1 pass / 3 reproduced failures | Reverse file order, restart with late usage, late compaction |
| Primary before background mode | 24/24, 36.7s | Includes both actual v1 database upgrade cases |
| Final primary background suite | 23/23, 31.2s | Every launch checks hidden/unfocused/non-focusable window and hidden Dock icon |
| Clean clone from GitHub | 23/23, 32.4s | npm ci, package build, exact application source commit above |
| Final actual CLI/desktop | 2/2, 13.5s | Input15827/output10/cached7168 matches real rollout and CLI; terminal-first restart/overlap replay also matches |
| DMG-installed background app | 5/5, 6.9s | Navigation, both file orders, restart/overlap and fatal-error exit |
| Native installed CLI shutdown | PASS | --background without debugger; SIGTERM uses app.quit, exit0, SQLite integrity OK |
| Privacy and Clear | PASS | Zero observed outbound events; private payload sentinel excluded; Clear removes observations |
| Build identity | PASS | Primary, clean and installed app.asar SHA256 match |
| Production dependency audit | PASS | Zero vulnerabilities; unchanged eight moderate build-tool findings remain disclosed |

[Sanitized test results](patch-acceptance-results.json), [real evidence](patch-real-evidence.json), [privacy evidence](patch-privacy-evidence.json), [native install evidence](patch-install-evidence.json), and [artifact hashes](patch-release-evidence.json). Raw rollouts, traces and NetLogs remain local. No tests were skipped or flaky in the final acceptance runs. The intentional crash test validates exit1; that expected process failure is a passing test.

A first crash-check run found that Playwright invalidates its process accessor after exit. The harness now retains the child-process handle at launch; the final crash test passes. The existing inspector shutdown workaround remains confined to the test harness. Native installed shutdown was tested without the inspector.

Commands: `npm run package:mac`; `npm run test:e2e`; `npm run test:e2e:real`; installed `LENS_EXECUTABLE` override with SL13, SL15, ORDER01 and ORDER02; clean clone `npm ci`, package and deterministic suite. The v1 migration gate ran before the visible-test opt-in was introduced. Actions remain disabled; no workflow is created.

## Limits
Timestamp conflicts are deliberately conservative, including same-file conflicts. Wall-clock timestamps are not proof of source truth. Rebuilding a changed session costs time proportional to its retained telemetry history plus sorting; raw message payloads are not retained. v1 incomplete history cannot be recovered without its sources. Existing manual-selection, last-request-context-estimate, Apple Silicon-only validation and unsigned/non-notarized distribution limits remain. The requested --background command-line mode was added during verification so tests can run without opening windows or taking focus. No telemetry display feature was added.

## Background execution requested during the audit
After the visible acceptance run, Ethan requested unobtrusive testing. Automated tests and screenshot captures now pass `--background`. The app creates a hidden, non-focusable window, uses the macOS accessory activation policy, and keeps hidden rendering timers active. Every default test launch verifies hidden/unfocused/non-focusable state and a hidden Dock icon. Uncaught exceptions and unhandled rejections in this mode are written to stderr and exit1 instead of showing a native dialog. Normal GUI launches are unaffected.

The original v1 binary does not support this option. Its two migration cases passed before the request; the migration suite now requires an explicit visible-baseline opt-in, and it will not be rerun visibly during this audit. The migration implementation has not changed since those passes. Subsequent clean-build and installed checks run in background mode.
