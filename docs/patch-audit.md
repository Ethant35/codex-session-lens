# v1.0.1 telemetry ordering audit
Author: Ethan
Date: 2026-10-22
Status: candidate verification in progress; v1.0.0 remains published.

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
Candidate build/type checks pass. Ten focused ordering/upgrade checks passed, followed by 22 deterministic checks. The final primary run with corrected upstream envelopes and both upgrade cases passed 24/24 in 36.7 seconds. The real Codex CLI and desktop checks passed 2/2: input14971/output10/cached7168 matched both the actual rollout and CLI completion. A fresh cache ingested terminal status first, restarted, then ingested the original rollout plus an overlapping copy; rendered metrics and model still matched.

Remaining before publication: final deterministic result, independent clean checkout build/tests, DMG installation/native shutdown, hash checks, sanitized evidence and release verification. GitHub Actions are disabled and have zero runs. No workflow is created.

## Limits
Timestamp conflicts are deliberately conservative, including same-file conflicts. Wall-clock timestamps are not proof of source truth. Rebuilding a changed session costs time proportional to its retained telemetry history plus sorting; raw message payloads are not retained. v1 incomplete history cannot be recovered without its sources. Existing manual-selection, last-request-context-estimate, Apple Silicon-only validation and unsigned/non-notarized distribution limits remain. The requested --background command-line mode was added during verification so tests can run without opening windows or taking focus. No telemetry display feature was added.

## Background execution requested during the audit
After the visible acceptance run, Ethan requested unobtrusive testing. Automated tests and screenshot captures now pass `--background`. The app creates a hidden, non-focusable window, uses the macOS accessory activation policy, and keeps hidden rendering timers active. Every default test launch verifies hidden/unfocused/non-focusable state and a hidden Dock icon. Uncaught exceptions and unhandled rejections in this mode are written to stderr and exit1 instead of showing a native dialog. Normal GUI launches are unaffected.

The original v1 binary does not support this option. Its two migration cases passed before the request; the migration suite now requires an explicit visible-baseline opt-in, and it will not be rerun visibly during this audit. The migration implementation has not changed since those passes. Subsequent clean-build and installed checks run in background mode.
