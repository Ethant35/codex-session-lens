# Session Lens 1.3.0 qualification
Author: Ethan
Date: October 28, 2026
Status: published and verified from unauthenticated public downloads.

## Result

Local session checkpoints in the HUD and CLI show observed input/output/cached-input changes and compactions since a saved baseline. Selected checkpoints persist per session. Missing/uncertain baselines and invalid counter changes remain unavailable. The app trims redundant sample/footer/setup copy while preserving onboarding, privacy instructions and accessibility labels. Current local telemetry supports both usage formats; matching same-time records no longer suppress a valid context estimate. Live detailed usage cannot revive a legacy estimate. The sealed 1.2.0 assets are unchanged and their previously stale release notes now record the completed public-download verification.

## Verification and limits

The clean frozen dependency install and working tree each passed all 67 Node tests, including a forced checkpoint insert failure after deletion and scan-coverage commit/rollback checks. Six emitted outputs match byte-for-byte. The development package passed 44 hidden checks, including 1.2.0 upgrade/rollback/forward and checkpoint UI/accounting/persistence. This development pass preceded the final one-line legacy-context correction; final signed-byte checks must qualify the corrected candidate. The first checkpoint UI attempt failed because CSP blocked the accessibility tool injection. The corrected harness uses the existing CDP pattern and a deliberate failing positive control without changing product CSP.

The 50,000-record synthetic scan completed in 739.88 ms with +35.78 MiB peak RSS and 17.63 ms maximum event-loop lag; the lag detector's 50 ms positive control measured 49.69 ms. This is a bounded local measurement under shared host load, not a universal performance guarantee. Existing large-file/cancellation properties still pass. The source-format inventory was read-only, bounded, and retained aggregate counts and field names only. No paid model turn was made.

Security review used the approved 11-pack Community scan, dependency audit and direct boundary review. Eight heuristics, no confirmed vulnerability in those findings; 15 rule-pattern errors and six partial renderer parses remain disclosed. See semgrep-readiness.md. All tests use CLI or hidden isolated app instances. Native chooser interaction is mocked; manual VoiceOver listening and unfamiliar-user studies are not claimed. Supported qualification remains Apple Silicon/macOS 27.2. Checkpoints are local, unencrypted observation baselines, not a billing report or exact wall-clock usage record. See checkpoints.md and source-compatibility.md.

Evidence is retained under ignored `.local/verification-2026-10-28/`; previous failures are preserved. Both final installed-byte and public-download checks passed.


## Final installed-byte gate

The corrected final signed app installed from the stapled DMG passed **45/45 hidden checks**, with zero failures, skips or retries. This includes checkpoint light/dark axe checks with a positive control, keyboard/zoom, persistence and exact deltas; old/new upgrade and rollback; reinstall and isolated data deletion. The working and clean installations each passed 67 Node checks. All six packaged runtime outputs match the clean build. Source/manifest hashes remain unchanged since signing.

App submission `e318d1ef-88e1-4b39-b0ca-c061a5299c10` and DMG submission `5de75fed-48cd-49ba-99d5-d61e01db2ab2` were Accepted with issues:null. Both tickets validate; strict signatures and Gatekeeper pass. Developer ID Team Z2SL92S4B6, hardened runtime, allow-jit entitlement only. The app was stapled before recreating the ZIP and building the DMG. Version/copyright/package Author=Ethan were checked; screenshots carry PNG Author=Ethan. ZIP/DMG files have no portable personal-author field; their signature and hashes identify the release.

Final artifact hashes and counts are in [machine-readable evidence](checkpoint-release-evidence.json). No asset may be rebuilt or retagged under the same published version. Public download verification completed: ZIP, DMG and checksum files matched the sealed files. Both downloaded app copies and the quarantined DMG passed signature, ticket and Gatekeeper checks. The app installed from the public DMG passed **45/45 hidden checks**, with zero failures, skips or retries. All source/manifest hashes still match the signed candidate. [Release 1.3.0](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.3.0), PR6, implementation `6b4cfe57a56467e306790e9a71ef9c887befdbc2`, release merge/tag `d73d45032bd194e341d00820f26916ca626b1881`.
