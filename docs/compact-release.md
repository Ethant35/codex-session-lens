# Compact HUD release qualification
Author: Ethan
Date: October 27, 2026
Released: 1.2.0. Published October 27, 2026; public-download verification passed.

## Changes

The compact default view now keeps session identification, cumulative input/output and the last-request context estimate above the fold at 460×650. Details contains IDs, cached input, request usage, provenance, naming, compaction and subagent activity. Unknown values remain explicit. Optional project-folder basenames are off by default; aliases take priority and session selection stays manual. The app never stores the full metadata path or prompt/message text. Disabling labels deletes their cache. Unsafe or conflicting metadata yields no hint. If a configured source cannot be read, all hints are withheld while telemetry history is retained.

## Verification

- 55 Node tests pass, including local CLI, source immutability, opt-in/disable/restart, conflicting identities, locked storage and recovery. A clean frozen dependency install also passes all 55. Six emitted build files match byte for byte.
- First development suite: 38/41. Three shutdown assertions exposed harness limitations: an attached inspector kept fatal exits waiting, and ChildProcess close waited for inherited stdio. The harness awaits actual process exit, retaining exact exit-code, private-sentinel and SQLite-integrity assertions; cleanup can release the test inspector but cannot count forced cleanup as success. A later signed run passed 39/41 and measured delayed but correct shutdown: fatal exit code 1 after 10.36 s; native SIGTERM exit code 0 after 8.58 s, with SQLite intact. Lifecycle tests now use a measured 15 s bound and actual process exit. Canonical bundle paths avoid macOS sandbox path warnings. The final installed suite passed **43/43**, with no skips, retries or failures. It also checks opt-out across restart and the exact 10000/1500 to 12000/1800 live-update example. The reinstall test now waits for the persisted expanded state before using nested controls; an earlier 42/43 run exposed that asynchronous test race.
- Real prior 1.0.1 and downloaded 1.1.0 packages each pass forward/rollback/forward with isolated caches, preferences and removed-source history. 1.1 aliases persist. After an older app writes preferences, 1.2 honors the actual saved opt-in: missing/false clears labels; retained explicit true stays enabled. No normal app data was used.
- Same approved 11-pack Semgrep Community scan completed with eight inspected heuristics, no confirmed exploit in those findings, 15 rule-pattern errors and six partial renderer parses disclosed. npm audit: zero advisories. See semgrep-readiness.md.
- Ten alternating synthetic scans: 120 files, 15480 records, 5.96 MB. Cold median off/on: 238.27/239.26 ms; unchanged rescan: 10.19/15.04 ms. Counts, totals and source hashes agree in all runs. High host load (49.12/52.85/44.39) limits timing comparisons. These are local diagnostic measurements, not a general speed or full-history guarantee.

Evidence: ignored `.local/verification-2026-10-27/` and `static_analysis_semgrep_5/`. The repository-local explicit-only verification skill maps seven user journeys to source and executable checks.

## Limits

Apple Silicon/macOS 27.2 is the tested target. Native chooser tests mock the Electron dialog response, while checking draft/cancel/Save behavior. No unfamiliar-user study or manual VoiceOver listening is claimed. No paid model call or private-history reread was made for this change. Earlier core load/real-source evidence remains dated and is not presented as a fresh run. Automatic foreground-chat switching, remote/compressed logs and unqualified platforms remain unsupported.

## Signed release

Developer ID Application: Ethan Tarnarider, Team Z2SL92S4B6; hardened runtime with allow-jit only. App submission `7eaf200b-c65f-4588-9a9c-2be390257940` and DMG submission `b80ee534-e65f-4244-92fe-a50093f000c5` were Accepted with no reported issues. App and DMG tickets validate; Gatekeeper accepts both. The final ZIP was created after app stapling.

Post-staple hashes:

- ZIP: `75fd5665c2dfe8e4574e26aa888904a7b5ed35ee4c2f5d0240e6bfbbb88de987`
- DMG: `c569006ad332a14c9c7106f52a89f96d46b393b22efcf27a442eefa3bb9c1617`
- app.asar: `e4dcc06a5dbfde76555af505f27f80121e34345fff58c80687c2d659491c62c5`

The isolated signed-app reinstall/data-removal journey passed. The copied DMG app retains the same asar hash and passes signature and Gatekeeper checks. All 43 checks pass against this installed copy, including upgrade/rollback and reinstall. Unauthenticated public ZIP, DMG and checksum downloads matched the sealed files. Both downloaded app copies and the quarantined DMG passed signature, Gatekeeper and ticket checks. All 43 hidden tests passed on the app installed from the public DMG, with zero failures, skips or retries. Evidence: `.local/verification-2026-10-27/public-{hashes,installed}.json` and `public-security.txt`. [Published release](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.2.0); merged PR5, commit `1960118b2b91d9f4ab51c8c0ff7ab7cf9b6a9645`.
