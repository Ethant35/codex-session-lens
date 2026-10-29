# Frozen release contract: Session Lens 1.3.1
Author: Ethan
Date: 2026-10-29
Result: PASS for the supported technical contract. No demonstrated essential blocker remains. The unfamiliar-user trial is pending and is not counted as passed.

## Contract and supported scope

A user can install the Apple Silicon macOS app, manually select the intended observed session, interpret the available telemetry, use checkpoints, restart, and recover from source or cache problems while original source files stay intact. The frozen target is [1.3.1](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.3.1), tag commit `7382d0b7f9cb2105852ef10cdd57bd2048f48ffb`. This closes that contract; it does not add features or require recurring audits.

Selection is manual. A supplied stable session ID is the authoritative match; aliases, model/date and optional folder basenames are cues and may repeat. Automatic foreground-chat detection is unsupported. Telemetry is observed evidence, not billing or guaranteed live occupancy. Supported sources are local, readable, uncompressed JSONL; unknown formats and missing evidence do not justify invented values.

## Requirement-to-evidence map

All cited packaged tests passed in the final 47-check run against the public-download bundle installed at the actual app path, with disposable data. The report is `.local/release-1.3.1/public-installed-hidden.json`; [release evidence](scan-warning-release-evidence.json) retains the published summary and exact hashes. The 67 Node checks passed both in the working checkout and a clean locked install.

| Requirement | Evidence and observed result | Remaining check |
| --- | --- | --- |
| Install and open | Separate app/DMG Accepted submissions; signatures, tickets and Gatekeeper passed; unauthenticated DMG/ZIP hashes matched. SL-01, SL-13 and signed reinstall test passed. Installed bundle is 1.3.1. | None essential. Human Finder drag-and-drop is not claimed. |
| Reach and select the intended session | SL-02 and SL-04 prove discovery and session-isolated selection; SL-13 proves keyboard search. Alias/identical-alias tests preserve distinct IDs across restart. Terra independently exercised search, selection and naming. | Human task 1 in the optional trial. |
| Interpret telemetry and uncertainty | SL-05 prevents addition of cumulative snapshots; SL-06 requires complete request/limit evidence; SL-07 and ORDER-03 clear context after compaction; ORDER-05 shows conflicting values as Unavailable. Current warning regressions cover missing/malformed sources. | Human task 2, including the cached-input and context-occupancy distinction. |
| Use checkpoints | Hidden checkpoint tests prove exact observed deltas, one newly observed compaction, per-session isolation, restart selection and deletion. Missing-baseline test renders Unavailable. Node tests cover unsafe counters, history loss, incomplete coverage, capacity and rollback. | Human task 3. |
| Restart without losing state | SL-09 covers selection, recent history, display preferences and bounds; checkpoint/alias tests and prior-version upgrade/rollback/forward tests passed. The actual-cache copy retained all 185 sessions and totals with scanning paused. | No essential check. Restart is also included in trial task 3. |
| Recover from source errors | Missing/unreadable/malformed-source tests retain valid history, expose diagnostics and recover when corrected. The 1.3.1 warning remains above values when Settings and Details are closed; View diagnostics supports keyboard focus. | Human task 4. |
| Recover from cache errors | Hidden corrupt-cache retry/explicit backup-and-rebuild and real SQLite-lock tests passed. Node tests cover access failures, retained damaged files, rollback and sanitized errors. Retry is non-destructive; rebuild requires explicit confirmation and retains a backup. | None essential. |
| Preserve original source and app data | CLI source-byte preservation, install/reinstall source-hash checks, privacy boundaries and source-reader refusal tests passed. Updating the actual installation preserved all 29 app-data file hashes; a verified private backup remains. | None essential. No destructive check on user data is needed. |

## Incomplete telemetry is visibly uncertain

The compact Scan incomplete warning identifies potentially stale/incomplete retained values and links to diagnostics. Pausing remains labeled Ingestion paused. Missing/conflicting metrics render Unavailable; compaction invalidates an older context estimate. Context copy says last request and current occupancy unknown. Checkpoints describe observed changes and disclose uncertain coverage; an invalid baseline/history makes token changes unavailable. These claims are supported by the named UI assertions and inspected light/dark screenshots, not merely internal state checks.

The app cannot detect every missing or undocumented source event. A clean scan is not proof of exhaustive history. Persistent skipped-record diagnostics may remain after a file disappears until source settings are saved again. Neither retaining history nor clearing a diagnostic makes missing observations exact. These limits remain in [checkpoint guidance](checkpoints.md) and the [operations guide](operations.md).

## Review reconciliation and evidence reuse

Terra's independent 1.3.0 report found a hidden scan-error status and an outdated first-use guide. Both were fixed in 1.3.1. The warning tests first failed against unchanged 1.3.0, then passed with the fix. The current README and first-use guide point to 1.3.1; the acceptance index and operations guide now identify current evidence rather than 1.2.0. Historical reports retain their original version and scope. Terra's preserved report/screenshots are in `.local/independent-review-2026-10-29/`; its temporary workspace has been removed. Terra did not perform a new independent review of 1.3.1.

This closeout verified that runtime-source hashes still match the qualified build, the installed app.asar still matches the public package, and GitHub's current asset digests/sizes still match the prior unauthenticated-download hashes. Actions remains disabled. The closeout launched no app, reran no unchanged runtime tests, changed no runtime code, and made no new release. Local refresh evidence: `.local/contract-closeout-2026-10-29/verification.json`.

## Limitations and stopping point

The [short unfamiliar-user trial](unfamiliar-user-trial.md) implements the recommendation relayed from Sol. No willing participant is available in this task, so it was not run. Agent exploration and automated accessibility checks are not unfamiliar-human evidence. Human native-dialog interaction, manual VoiceOver, normal foreground focus/Dock experience and broader platform coverage remain unclaimed. The tested platform is Apple Silicon/macOS 27.2. The prior full security scan is historical; 1.3.1 used a direct changed-code review and production-dependency audit.

No essential requirement remains blocked. No participant recruitment or recurring work is scheduled. A future reproducible blocker can reopen a bounded fix; subjective preferences do not expand this frozen release. The release and installed app remain 1.3.1. About 4.05 GB of temporary build/download files were removed during delivery; logs, screenshots, hashes, release assets and the private data backup remain. This documentation closeout removes its temporary publication checkout after synchronization.

The goal tool returned no existing goal at closeout. No replacement goal was created or resumed; completion is recorded here and in HANDOFF.md.
