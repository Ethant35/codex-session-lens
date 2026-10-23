# Session Lens handoff
Author: Ethan
Updated:2026-10-22, America/Los_Angeles

## Current state
Candidate1.1.0 is locally qualified and DeveloperID signed. **It is not notarized or published.** Ethan explicitly deferred notarization after asking us to check for saved credentials. No profile was found in accessible user Keychain metadata, relevant environment variables or standard App Store Connect key locations. No password/private key was printed or requested in chat. Remaining distribution work is deferred; do not mark the production-readiness goal complete.

Repository: /Users/ethantarnarider/Documents/ChatGPT/Open source/codex-session-lens
Branch: codex/production-readiness
Baseline:399d77dcc83da42baaa87b70b90a6e14088af939, released1.0.1
Implementation commit:319115a (Ethan). Documentation/evidence follow in a separate commit. A draft PR is prepared from this branch; inspect its current URL/state with `gh pr view`. No new tag or production release. Installed1.0.1 app was not replaced.

## What changed
- Pure Node CLI with explicit read-only sources, temporary cache default and separate retained CLI cache. `npm test` starts no app, network request or model call.
- Serialized service operations and durable-before-visible settings. Explicit corrupt-cache backup/rebuild; locked/permission-denied caches offer retry and remain intact.
- Bounded128-observation staging in one transaction; streaming ordered projection yields256 rows; stable nofollow regular file handles; responsive cancellation/rollback/replay.
- Source-grounded fork/subagent boundary handling excludes inherited parent records. Arbitrary mixed IDs remain rejected. Missing ordinals are explicit diagnostics.
- Short skip/replay/sample onboarding, actionable errors, stronger contrast, accessible names/regions/skip link and narrow/200%zoom wrapping.
- All-mode sanitized fatal handling prevents Electron raw-error dialogs; native quit waits for cache close. Bounded100record/64KiB local diagnostics exclude raw content/paths/secrets.
- Frozen npm install with automatic scripts disabled, explicit hash-checked Electron installer and retained runtime notices. Separate required DeveloperID/hardened-runtime release configuration.

## Final evidence
- Node46/46: CLI7,service10,recovery6,core20,diagnostics3.
- Signed hidden package37/37: deterministic36 plus actual1.0.1 upgrade/rollback/forward. No retries/skips.
- Read-only DMG copy: signature verification and5 installed startup/metrics/persistence/fatal/native-SIGTERM checks passed; mount ejected and test installation removed.
- Actual CodexCLI0.163.0 and desktop/manual selection2/2. Real small Luna turn matched15130 input/10output/0cached through restart/overlap.
- Clean frozen install passed46 Node tests and build; all6 emitted main/preload/renderer/CLI files were byte-identical.
- Axe detects deliberate missing-alt control; tested states have zero serious/critical findings. Actual AX tree names, Tab/Enter, theme changes and200%zoom pass. Manual VoiceOver listening is not claimed.
- Final full real-history scan154files/3,259,141,468bytes:61.36s,433,782,784byte peakRSS. Only oversized-record diagnostics remain (39 records in15 files above8MiB). All48 fork identity errors fixed; independent actual child comparison45 exact direct totals/3explicit same-time conflicts/0unexplained mismatch.
- Synthetic50k scan723.73ms,+36.23MiBRSS,maxlag12.13ms;10ms cancel10.10ms/no partial commit; full138file synthetic shape27.87s/+75.47MiB/maxlag13.32ms. Sparse shape and120s soak limits are in core-readiness.md.
- Semgrep Community1.182.1 final11packs:7 reviewed heuristics (2WARNING bounds expressions,5INFO longlines), no confirmed exploit.15 raw rule-parse failures and partial renderer parsing are disclosed; no failed/skipped packs. Local outputs static_analysis_semgrep_3; rule revisions saved, clones removed. No Pro/metrics/cloud/CI/autofix.
- npm audit0 advisories; isolated npm11 signature auditor returned no missing/invalid signatures after npm10 failed on a key issue. Runtime notices present; package author and Info.plist copyright Ethan verified.

## Artifacts and privacy
Signed unnotarized archives: `.local/signed-candidate/Codex Session Lens-1.1.0-arm64.dmg` and `.local/signed-candidate/Codex Session Lens-1.1.0-arm64-mac.zip`. Exact hashes/sizes and sanitized counts: docs/readiness-evidence.json. Native signed staging app is in OS temporary `codex-session-lens-release/mac-arm64`; extract retained ZIP into a fresh temp directory if that staging directory expires.

The first signing attempt failed because synced Documents introduced FinderInfo metadata. Its incomplete bundle is preserved separately in `.local/signing-failed-synced-folder`. Current release config stages outside synced folders. Unexpected old duplicate files with ` 2` suffix were preserved intact in `.local/preserved-duplicates-2026-10-22` and excluded from compiler/test inputs.

Private full-history JSON and metadata/comparison details stay in ignored `.local/*private.json` with0600 permissions. Never publish them, traces, raw rollouts or account/source identifiers. Only sanitized aggregate evidence belongs in docs.

## Cleanup and non-disruption
Both bounded_ingestion and ui_qualification are complete and interrupted. All known scanner/build/test jobs completed. Process inspection found no Session Lens, Playwright, benchmark or Semgrep process from this work. The final computer-use dialog check unexpectedly launched the local candidate normally; it was immediately quit and process absence verified. No error dialog remained. This incidental check was not a hidden test and is disclosed. The installed app bundle was not replaced; all qualification tests used isolated data.

## Resume only for the deferred distribution step
1. Keep GitHub Actions disabled. Verify before any push, PR, tag or release. No workflows, hooks, global settings or config.toml changes.
2. Obtain a saved notarytool Keychain profile name after Ethan sets up credentials locally or identifies an existing profile. Never request secrets in chat. Do not infer authorization to create credentials from this handoff.
3. Use retained exact signed candidate or rebuild only if source changes. Submit to Apple, inspect acceptance/log, staple app/DMG, recreate ZIP after app stapling, validate Gatekeeper and recheck read-only DMG installation. Record final post-staple hashes.
4. Publish only after remaining gates pass. The draft PR is not a production-readiness assertion. Update matrix/handoff/evidence accurately.

## Usage safeguard
On explicit resume, run the supported usage checker at least every60seconds. Stop if ANY applicable window reaches90%used/10%remaining; stop owned workers/processes, save state, explicitly pause goal, terminate checker and wait. Missing readings are unknown. No credit/reset/provider bypass. The current checker cell2 is to be terminated when this deferred-work handoff is finished.

Historical1.0.1/1.0.0 evidence remains in docs/patch-audit.md and patch-*.json. It is not substituted for the current results above. Original supported limits remain: local single-user Apple Silicon/macOS27.2, uncompressed JSONL, manual session selection, last-request context estimates, explicit source ambiguity. See CONSTRAINTS.md, operations.md, release-qualification.md and production-readiness.md.
