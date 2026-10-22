# Local acceptance
Author: Ethan
Date: 2026-10-22, America/Los_Angeles
Result: ALL REQUIRED LOCAL GATES PASS. No skipped or flaky tests in the final runs.
Application source commit: f3a99d6fed4f971a102bb221db5efa59306a45b6. Subsequent release-preparation changes are documentation, evidence and preview tooling only.

GitHub Actions and CI are intentionally omitted per Ethan. Repository Actions were disabled and verified before any push. No workflows existed; Actions run count remained zero. Equivalent applicable gates ran locally.

## Environment
macOS27.2 (26B118), Apple Silicon arm64, Node22.13.1/npm10.9.2, Electron45.0.0, React19.3.1, Playwright1.64.1, electron-builder26.15.3. package-lock.json pins exact dependencies. Codex CLI0.163.0; installed desktop26.1016.61520.

## Final gate results
| Gate | Result | Evidence |
| --- | --- | --- |
| SL-01 clean packaged launch | PASS | Empty state and usable Settings |
| SL-02 discovery | PASS | Exact ID/model/input/output/cache rendered |
| SL-03 live append | PASS | Rendered counts update within five-second assertion timeout |
| SL-04 session isolation | PASS | Switches preserve independent counts; additional identity-mismatch fixture rejected |
| SL-05 cache accounting | PASS | Overlapping cumulative records replace rather than add; cached input stays a subset |
| SL-06 context correctness | PASS | Known complete sample25%; absent limit/latest usage unavailable; lifetime totals not substituted |
| SL-07 compaction | PASS | Correct session timeline; other session unaffected; stale estimate cleared |
| SL-08 corrupt/rotated input | PASS | Malformed/truncated lines, inode rotation, counter decrease, growing in-place rewrite; history retained |
| SL-09 persistence | PASS | Theme, topmost, compact mode, selected/recent sessions, bounds and history after source removal/restart |
| SL-10 subagents | PASS | Explicit parent identity; unavailable without it; no merged child metrics |
| SL-11 real Codex CLI | PASS | Actual native Codex turn; real rollout matches UI and CLI completion usage |
| SL-12 desktop selection | PASS, manual fallback | Installed Codex desktop present; selector works; automatic switching explicitly unsupported |
| SL-13 packaging/install | PASS | Real arm64 executable; mounted DMG copied into user Applications; discovery/navigation/live update; native Quit exit0 |
| SL-14 privacy | PASS | Zero observed outbound network events during ingestion; CSP blocks external fetch; renderer sandbox/isolation/Node denial verified |
| Clean checkout | PASS | Clone exact GitHub origin, npm ci, build/package and all14 deterministic tests |

## Commands, times and outcomes
All times below are PDT. Sanitized per-test names, durations, statuses and UTC start times are in [docs/acceptance-results.json](docs/acceptance-results.json).

1. `npm run package:mac` ran TypeScript checks, Vite/esbuild and electron-builder. Produced arm64 DMG/ZIP with no distribution signing or notarization.
2. 12:16:21: `npm run test:e2e` → **14 passed in50.5s** (SL01–10,13,14 plus two robustness cases).
3. 12:17:11: `LENS_TEST_REPORT=.local/real-report.json npm run test:e2e:real` → **2 passed in13.1s**, no skips. The actual gpt-6-luna run reported input15,827/output10/cached7,168; UI matched the saved rollout exactly. [Real evidence](docs/real-evidence.json).
4. A clean clone of the feature branch from the exact repository ran `npm ci && npm run package:mac` successfully. At12:18:43, `npm run test:e2e` → **14 passed in33.9s**.
5. Mounted `release/Codex Session Lens-1.0.0-arm64.dmg` read-only, copied the app to `~/Applications/Codex Session Lens.app` using `ditto`, then ejected the image. Launched the installed binary with isolated data/source directories. Computer Use selected `native-install-check`, verified1,000/250/400 and25% estimated context, then verified appended2,000/500/800. Native Cmd+Q exited0 without a debugger or error dialog. [Install evidence](docs/install-evidence.json).
6. 12:19:18: `LENS_TEST_REPORT=.local/installed-report.json LENS_EXECUTABLE="$HOME/Applications/Codex Session Lens.app/Contents/MacOS/Codex Session Lens" npx playwright test tests/acceptance.spec.ts --grep SL-13` → **1 passed in2.4s**.
7. Primary build, clean-checkout build and installed `app.asar` all SHA256 `76541cbb0b6c8d67ad2e23a552b1bba996ed44bcf2f15a24cbba407e3adaac92`.
8. `node scripts/preview.mjs` captured synthetic-fixture expanded, compact and dark screenshots. Visually inspected; compact view shows core metrics/context and compaction controls at default width, without horizontal overflow.

## Test implementation and repaired failures
Tests launch the actual packaged app through Playwright Electron support and assert rendered values. Fixtures are temporary JSONL input files, not API mocks. There are no unit/component/model-API tests. Test artifacts remain local unless explicitly sanitized.

Early runs found and repaired a real window-bounds write after SQLite closure, test cleanup deleting its database too early, selector timing errors, and an invalid context assertion for a record with no context limit. The real CLI test initially left stdin open and timed out; closing stdin fixed it. These failed runs were not counted as acceptance.

Electron45's attached Node inspector can keep a process alive after its quit event. Test cleanup now observes the actual `will-quit` event after the app's SQLite close listener, then terminates any debugger-attached process still alive. It does not stub the app or replace metric results. The separate installed/native Cmd+Q check above confirms normal shutdown without that test-only cleanup. No error dialog or test process was left for Ethan to close.

## Privacy, dependencies and metadata
[Privacy evidence](docs/privacy-evidence.json): zero renderer HTTP requests and zero outbound TCP/UDP connect, socket-send, HTTP-send or QUIC-send NetLog events during the ingestion scenario. An external synthetic fetch probe was denied. This tests application-controlled traffic in the recorded scenario, not all OS traffic. The application has no network backend or telemetry uploader. Raw NetLogs and real rollouts are not published.

`npm audit --omit=dev`: zero production dependency vulnerabilities. The development packaging dependency tree has eight moderate findings propagated from sprintf-js (GHSA-hp3w-g68c-fv3c); latest published sprintf-js1.1.3 is affected. None is a shipped application runtime dependency. This remains a disclosed build-tool limitation, not a clean all-dependency audit.

Verified package author and Git author are Ethan; app copyright names Ethan; generated PNGs have Author=Ethan text metadata. ICNS, DMG and plain source files have no portable personal author/last-modified-by field to verify. Factual Electron/Chromium producer metadata and the original MIT license were preserved. `codesign -dv` reports upstream linker ad-hoc signing with no TeamIdentifier; no Developer ID signing or notarization is claimed.

## Supported limits
Automatic native conversation switching is unsupported; manual selection is the accepted v1 integration. Context is a last-request estimate only; current occupancy is unavailable. No compressed archives, remote-only data, prompt-derived titles, or unsupported schemas are imported. Status is last observed, not guaranteed live. Counter regression retains prior values with uncertainty. Compaction entries are observations; distinct timestamps are not heuristically merged. Only Apple Silicon macOS27.2 was exercised.

## Reproduce
```sh
npm ci
npm run build
npm run package:mac
npm run test:e2e
LENS_TEST_REPORT=.local/real-report.json npm run test:e2e:real
```
The real suite requires signed-in native Codex and its running desktop app. No API key is needed; config.toml is not modified. See CONTRIBUTING.md for environment overrides.
