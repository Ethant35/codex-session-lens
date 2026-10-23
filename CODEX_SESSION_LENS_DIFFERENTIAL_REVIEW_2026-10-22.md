# Session Lens differential review
Author: Ethan
Date:2026-10-22

## Executive summary
Recommendation: CONDITIONAL. The reviewed local candidate passes its code and behavior gates. Production distribution remains deferred pending Apple notarization/stapling and post-notarization Gatekeeper verification. No confirmed unresolved correctness/privacy defect remains in the exercised supported flows. This is not a claim that every possible defect or future source format is excluded.

| Unresolved confirmed security severity | Count |
| --- | ---: |
| Critical |0 |
| High |0 |
| Medium |0 |
| Low |0 |

Overall release risk: MEDIUM while distribution qualification is incomplete. Seven static heuristics were inspected (2WARNING geometry expressions,5INFO long lines), with no confirmed malicious code. Fifteen rules failed to parse and one renderer region was partially parsed; these coverage limits remain disclosed. See semgrep-readiness.md.

## What changed
Baseline is399d77dcc83da42baaa87b70b90a6e14088af939, the released1.0.1 implementation. Review covers its diff against the working tree plus new untracked source/tests/config/docs, not an empty HEAD-to-HEAD diff. All changes were local during review. They are now recorded in implementation commit319115a, followed by documentation/evidence. Main changes: Node CLI, serialized service/cache recovery, bounded transactional ingestion, incremental projection, validated fork boundaries, onboarding/accessibility, sanitized diagnostics, explicit dependency lifecycle policy and signed packaging.

| File at review checkpoint | Added lines | Removed lines |
| --- | ---: | ---: |
| .gitignore | 7 | 0 |
| ARCHITECTURE.md | 10 | 3 |
| CONTRIBUTING.md | 3 | 3 |
| HANDOFF.md | 48 | 4 |
| README.md | 27 | 4 |
| SECURITY.md | 6 | 1 |
| package-lock.json | 57 | 2 |
| package.json | 32 | 6 |
| src/main/ingestion.ts | 89 | 23 |
| src/main/main.ts | 49 | 45 |
| src/main/preload.ts | 1 | 0 |
| src/main/projection.ts | 115 | 47 |
| src/main/store.ts | 147 | 7 |
| src/renderer/main.tsx | 66 | 13 |
| src/renderer/styles.css | 100 | 10 |
| src/shared.ts | 3 | 0 |
| tests/edge.spec.ts | 5 | 2 |
| tests/helpers.ts | 17 | 5 |
| .npmrc (new) | 3 | 0 |
| build/entitlements.release.plist (new) | 6 | 0 |
| electron-builder.release.cjs (new) | 20 | 0 |
| scripts/build-cli.mjs (new) | 4 | 0 |
| scripts/measure-ingestion.mjs (new) | 219 | 0 |
| scripts/prepare-electron.mjs (new) | 15 | 0 |
| scripts/prepare-notices.mjs (new) | 17 | 0 |
| scripts/run-cli.mjs (new) | 7 | 0 |
| scripts/test-core.mjs (new) | 36 | 0 |
| scripts/test-diagnostics.mjs (new) | 7 | 0 |
| scripts/test-recovery.mjs (new) | 7 | 0 |
| scripts/test-service.mjs (new) | 7 | 0 |
| src/cli/lens.ts (new) | 80 | 0 |
| src/main/cache.ts (new) | 99 | 0 |
| src/main/diagnostics.ts (new) | 74 | 0 |
| src/main/service.ts (new) | 122 | 0 |
| tests/cli.test.mjs (new) | 114 | 0 |
| tests/core/ingestion.test.ts (new) | 383 | 0 |
| tests/core/projection.test.ts (new) | 171 | 0 |
| tests/diagnostics.test.ts (new) | 47 | 0 |
| tests/lifecycle.spec.ts (new) | 162 | 0 |
| tests/onboarding-accessibility.spec.ts (new) | 340 | 0 |
| tests/operational-ui.spec.ts (new) | 71 | 0 |
| tests/recovery.test.ts (new) | 116 | 0 |
| tests/service.test.ts (new) | 141 | 0 |
| tests/upgrade-current.spec.ts (new) | 57 | 0 |
| tsconfig.cli.json (new) | 4 | 0 |

Documentation changes after this checkpoint only record final evidence and handoff. Generated artifacts, private histories, dependency trees and temporary scanner clones are outside the source diff.

## Confirmed defects resolved
- **Child telemetry omission:** legitimate Codex fork files prepend child metadata before inherited parent history. Persistent mixed-ID rejection dropped all later child observations. Reproduced from actual metadata and a failing synthetic regression; repaired through validated explicit ordinal boundaries. Full-history scan removed48 mixed-ID errors. Independent comparison of48 children:45 exact own totals,3 explicit timestamp conflicts,0 unexplained differences. Arbitrary A/B/B files still fail closed. Missing ordinals have a fixed diagnostic.
- **Closed-database/shutdown race:** bounds writes and scans could outlive Store.close. Writes now share the service queue; ingestion is cancelled before draining; final bounds precede close; repeated quit cannot bypass pending close. Native signed SIGTERM exits0 and SQLite integrity passes. Unexpected failures exit1 with sanitized diagnostics, without Electron's raw modal error.
- **Incorrect failure classification:** a transient saved-preference read error was converted into invalid preferences and could offer rebuild. Read exceptions now retain their storage category; only validation errors permit damaged-settings recovery. Actual locking/access tests preserve the original cache.
- **Mutation consistency:** explicit undefined settings and memory changes before durable writes could diverge from stored preferences. Inputs are copied/validated before queueing, and settings become visible only after commit. Actual locked settings writes fail visibly and recover on retry.
- **Projection and record variants:** null live totals could erase or conflict incorrectly with valid same-time totals; the reducer now distinguishes presence from non-null candidates. UTF8 oversized records now report diagnostics. Rollback clears replay cursors; full/quota failure preserves prior committed history.
- **Clear result ambiguity:** post-commit VACUUM could fail after data was already cleared. Clear now commits once with secure_delete and reuses freed pages. No post-commit operation can report the clear as rolled back.
- **UI defects:** rendered axe found error/warning contrast failures; actual200% zoom found header/diagnostic overflow. Both were fixed and rerun. Duplicate skip-target IDs after IPC failure were removed.

## Test coverage analysis
46 Node tests pass, including20 core properties/regressions,7 CLI,10 service,6 recovery and3 diagnostic tests. A clean frozen dependency install passes the same tests and produces byte-identical main/preload/renderer/CLI bundles. The signed candidate passes37 hidden tests (36 normal suite plus actual1.0.1 upgrade/rollback); a read-only DMG copy passes5 installed startup/usage/persistence/fatal/native-shutdown checks. Actual CodexCLI0.163.0 compatibility and desktop/manual selection passed2 tests separately. No line-coverage percentage is claimed.

Remaining evidence limits: no manual VoiceOver listening session, no physically exhausted system volume, no universal macOS/device coverage, no future-schema guarantee, no notarized/Gatekeeper-qualified distribution yet. Actual SQLite quota exhaustion, OS EACCES, native process shutdown, corrupt cache and locked settings are real boundaries, not mocked success responses. Programmatic accessibility includes actual AX tree, Tab/Enter, axe positive controls, focus, zoom and themes.

## Blast radius
| Boundary | Production callers / effect | Mitigation |
| --- | --- | --- |
| Store/Ingestor construction |2 entrypoints each: desktop service/cache and Node CLI | Same production parser/storage, independent temp test inputs |
| LensService |1 CacheHost owner; IPC reads/mutations and timer scans | Serialized operations, durable state, coalesced scans, cancellation |
| beginScan/stageScan/commitScan |1 Ingestor orchestration path | Transaction-wide rollback and independent projection oracle |
| Preload/IPC |6 fixed operations: snapshot/select/preferences/rescan/clear/recover | Exact sender/frame check, validated requests, no generic filesystem API |
| Main lifecycle |Window bounds, timer, IPC and native quit | Close queue, sanitized failures, hidden native lifecycle checks |
| Renderer |Single compact window and setup/settings/recovery states | Real signed-package interactions and external axe rules |

Data flow: untrusted read-only JSONL → validated allowlisted observations → SQLite transaction → ordered projection → copied Snapshot → isolated renderer. The CLI uses the same ingestion/projection store without Electron or implicit user directories. There is no auth/account/network service boundary in the product.

## Historical context
Git blame ties original direct bounds persistence and app state to d49e75c0;399d77dc added the hidden presentation mode. The current change preserves sandbox, contextIsolation, no Node integration, webSecurity, navigation/webview/window-open denial, permission denial and request blocking. Input validation moved from main.ts into LensService and gained key/undefined/NUL checks; it was not removed. Projection ordering from1.0.1 is retained and checked against an independent array reference. No security-related deletion was accepted merely because tests passed.

## Recommendations
Do not publish as production-ready until notarization, stapling and final Gatekeeper checks pass. Keep signed candidate archives and hashes; extract/stage native bundles outside synced Documents metadata. Re-run affected gates if source/dependencies change. Preserve disabled GitHub Actions, hidden-only tests and explicit real-model-test authorization. Monitor future Codex source changes through explicit compatibility work; do not silently reinterpret ambiguous counters or unknown ordinal boundaries.

## Methodology and limits
Focused review of all13 application source files, with deeper analysis of main/ingestion/projection/store/service/cache/diagnostics/CLI and preload/shared contracts. Renderer review was accompanied by the bounded UI worker and actual captures. Compared committed baseline, tracked diff and new files; traced callers, read relevant blame, checked failure families and regression tests, reviewed static raw errors and dependency installation/signatures/licenses. Upstream source links are pinned in source-compatibility.md. Native runtime dependencies were not comprehensively audited or fuzzed; project-owned runtime is TypeScript, so a native C/C++/Rust harness was inapplicable. Confidence is high for the exercised invariants and moderate for broad production behavior.

## Appendix: evidence locations
- docs/readiness-evidence.json: sanitized counts, platform and exact signed artifact hashes.
- docs/core-readiness.md and docs/source-compatibility.md: benchmark/property/actual history limits.
- docs/ui-readiness.md: UI/a11y methodology and manual-review limits.
- docs/dependency-policy.md and docs/semgrep-readiness.md: supply-chain/static coverage.
- docs/operations.md and docs/release-qualification.md: backup/recovery/signing/notarization procedures.
- Local ignored reports retain detailed execution output; private rollout data is excluded from publication.
