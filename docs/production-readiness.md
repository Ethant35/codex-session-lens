# Production readiness
Author: Ethan
Candidate:1.1.0. Usability phase active; final release qualification in progress. Not yet published.

The earlier notarization deferral has been lifted. The revised signed app passed40 hidden tests and50 Node tests; a clean frozen install passed49 tests before one test-only regression was added, and all6 emitted files matched. Apple accepted app submission95e7f254-ade1-48c9-94c1-52e56e1478f0 with no issues. Final stapling, DMG/downloaded installation and publication are pending. The matrix below records the prior phase until final evidence replaces the distribution rows.
Baseline:399d77dcc83da42baaa87b70b90a6e14088af939 / released1.0.1

## Readiness matrix
| Area | Current proof | Remaining gate or limit |
| --- | --- | --- |
| Supported boundary | Local, single-user, offline Apple Silicon/macOS27.2; read-only uncompressed JSONL | Windows/Linux/Intel/remote/compressed sources unqualified; manual session selection |
| Quiet developer workflow | Pure Node CLI and46 Node checks; Electron excluded from npm test | GUI changes use separate hidden packaged gate |
| Accounting/replay/isolation | Independent generated oracle, equal-time ambiguity, cumulative snapshots, replay/restart, real CLI acceptance | Fork repair verified on48 real child files:45 exact direct totals,3 explicit conflicts,0 unexplained mismatches |
| Resource use | Batches128, projection yields256, SQLite cache budgets, stable file handles, cancellation rollback | Outputs/compaction lists scale with history; no universal constant-memory claim |
| Load/soak |50k final synthetic723.73ms/+36.23MiBRSS/12.13ms maxlag;138file3.2GB shape27.87s/+75.47MiB;120s append soak | Shape has sparse telemetry. Final real3.26GB scan61.36s/414MiB peakRSS;39 oversized records in15 files disclosed |
| Storage/recovery | Corrupt cache retained until explicit backup/rebuild; real lock, denied filesystem access, SQLite quota-full, cancellation, queued close and retry | SQLite quota is deterministic full-disk behavior, not a physically exhausted system volume |
| Upgrade/rollback | Actual installed1.0.1 generated cache upgraded to1.1.0, rolled back and upgraded again; saved settings and removed-source history preserved | Historical visible1.0.0 migration evidence retained; no disruptive rerun |
| Privacy/IPC/security | Trusted sender/frame check, sandbox/context isolation/CSP/deny network and permissions; hidden privacy tests; bounded allowlisted diagnostics | No claim of a full upstream Electron/SQLite audit |
| Static analysis | Approved11packs refreshed;7 inspected heuristic findings; no confirmed exploit in findings |15 rule parse errors, partial renderer parsing, Community single-file and per-pack coverage limits disclosed |
| Dependencies/licenses | Clean frozen install; automatic lifecycle scripts off; audited explicit Electron installer; npm audit0; registry signatures valid with npm11 auditor; runtime notices included | npm10 signature-key failure documented; audit is a dated snapshot |
| UI/onboarding/accessibility | Final signed37/37 including upgrade and3 operational tests; fresh/sample/skip/replay/recovery; axe positive control and zero serious/critical; theme/200%zoom; accessible tree and keyboard traversal | Manual VoiceOver listening/exhaustive hands-on review not claimed |
| Real integration | CodexCLI0.163.0 real Luna turn matched15130 input/10output/0cached through restart/overlap; desktop presence/manual selection checked | Does not establish foreground automatic switching; fork-history recheck passed with size/conflict limits |
| Diagnostics/support |100 records/64KiB, fixed categories, opaque runIDs; fatal private sentinel absent; operations and backup/reset docs | Local diagnostics only, no automatic report/upload |
| Build/distribution | Clean install46 Node checks and build passed after fork repair; all6 emitted files byte-identical; signed hardened-runtime package verified | Temp staging fixed synced-folder metadata signing failure. Signed DMG installation5/5 passed. Notarization credentials unavailable in inspected locations; deferred by Ethan |
| Release | Reviewable candidate branch; no tag/release or Actions/config/hooks changes | Notarization, stapling and final Gatekeeper checks remain required before production publication |

## Actual skill use
All named skills were loaded from the explicitly invoked project-local installation. Scope below records actual work rather than asserting that every generic checklist item applies to an offline utility.

| Installed skill | Reviewed scope and concrete result | Evidence |
| --- | --- | --- |
| source-driven-development | Installed lockfile/runtime, official Node SQLite/Electron security/signing and pinned Codex protocol; exact fork-boundary source checked | dependency-policy.md, source-compatibility.md, release-qualification.md |
| constraint-driven-development | SKILL/floor guard, original acceptance and later quiet-test/privacy requirements reconciled | CONSTRAINTS.md; separate fast/task/release gates |
| documentation-and-adrs | Existing handoff/architecture/security/history, decisions on CLI/transactions/recovery/diagnostics/signing | decisions.md, operations.md, updated architecture/security/handoff |
| test-driven-development | Failing undefined patch/transient storage/null usage/oversize and fork regressions before fixes; actual production modules | tests/service.test.ts, recovery.test.ts, core tests |
| property-based-testing | Fixed seeds, independent array oracle, latest-value invariant, permutation/replay/session partitions and positive controls | core-readiness.md; fast-check tests |
| systematic-debugging | Reproduced source diagnostics, inspected actual packaged source; isolated CSP/frozen IPC fixture and startup-handshake issues before repairs | UI reports, lifecycle tests, source compatibility regression |
| variant-analysis | Searched null/legacy/timestamp, storage failure classification, file identity, shutdown and repeated-ID variants | core/service/recovery regressions; differential review |
| api-and-interface-design | Shared validated immutable service, serialized durable mutations and explicit retry/rebuild states; narrow preload API | service.ts/cache.ts/shared.ts/preload.ts; contract tests |
| security-and-hardening | Read security checklist; reviewed source/cache file types, private data, sender/frame, network/permissions, config and supply chain | privacy suite, recovery/core tests, dependency policy |
| sharp-edges | Avoided implicit real CLI directories, ambiguous destructive recovery, silent failed settings and post-commit VACUUM errors | CLI tests, operations docs, service/recovery tests |
| differential-review | Read methodology/adversarial/reporting; baseline plus dirty/untracked source review and caller tracing | CODEX_SESSION_LENS_DIFFERENTIAL_REVIEW_2026-10-22.md |
| find-bugs | Checked new service/cache/diagnostic and incremental projection paths for correctness/security defects; retained regression tests | null-total, transient error, undefined patch, closed-DB/shutdown and fork findings |
| semgrep | Actual SKILL/workflow/ruleset selection; explicit human approval; supplied runner/merger; raw error review | semgrep-readiness.md; local raw output/revisions |
| harness-writing | Scope inspected: no project-owned C/C++/Rust runtime boundary; TypeScript app, Electron/Node SQLite dependencies, Swift icon-build utility | Native fuzz harness inapplicable; real SQLite/filesystem/native lifecycle tests used |
| performance-optimization | Corrected invalid benchmark, established baseline, bounded staging/streaming reducer, measured exact totals and lag with control | core-readiness.md, measure-ingestion.mjs |
| observability-and-instrumentation | SKILL/global checklist; bounded sanitized local categories/counts/runID and operational diagnosis | diagnostics.ts, diagnostics.test.ts, operations.md |
| deprecation-and-migration | Retained actual prior version/cache; tested forward/rollback/forward including missing sources | upgrade-current.spec.ts and upgrade report |
| impeccable | Operate/craft floor/onboard/critique/audit/harden/polish references; compact identity preserved, contrast/wrapping repaired | ui-readiness.md; rendered screenshots; final regex detector limits |
| baseline-ui | Semantic/native controls, existing CSS/React, direct empty/setup actions, no stack migration/ornamental motion | renderer source and packaged views |
| fixing-accessibility | Labels/regions/skip link/focus, axe with failing control, keyboard/zoom/system appearance | onboarding-accessibility/operational-ui tests |
| web-design-guidelines | Current upstream command.md, semantic actions/focus/async errors/wrapping | ui-readiness.md sources and packaged checks |
| vercel-react-best-practices | Installed React19 guidance/effect/rerender scope; small state/API additions | renderer build and interactions; no Next.js assumptions |
| vercel-composition-patterns | Inspected boolean-prop/compound-component scope; no complexity requiring a new provider/library | Deliberately retained existing small renderer structure |
| code-simplification | Inspected scope; removed duplicated app policy into shared service only where CLI/queue/recovery required it | No unrelated rewrite; outputs/errors/order guarded by tests |
| shipping-and-launch | Local packaging/identity/notarization/install/update/rollback/licenses/support checklist; hosted-service items inapplicable | release-qualification.md; no production publication yet |
| verification-before-completion | Read completion gate; current commands separated from historical release and external blockers | This matrix, local reports and final artifact hashes when available |

## Evidence classes
Synthetic fault/property tests establish deterministic boundaries, not live provider behavior. The real CLI test is an actual account-backed turn. The read-only full-history scan is actual local data, reported only as counts/timing/categories. Hidden renderer tests inspect the real packaged app but do not establish a manual VoiceOver experience. Signing, notarization and Gatekeeper installation each require separate results. Historical1.0.1/1.0.0 evidence never substitutes for checks of this candidate.
