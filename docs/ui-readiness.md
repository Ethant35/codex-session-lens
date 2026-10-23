# UI readiness: onboarding and accessible operation

Author: Ethan
Status: signed Apple Silicon package passed37 hidden checks, including UI, lifecycle, operational failures and actual1.0.1 upgrade/rollback. Programmatic keyboard and accessibility-tree checks passed; manual VoiceOver listening is not claimed.

## Supported interface

The UI serves a single local user on Apple Silicon macOS. It reads local Codex session folders selected by the user, displays local telemetry, and caches it on the same Mac. It does not display prompts, ask for an account or API key, upload source data, or request Accessibility permission. Users can type or paste absolute folder paths; the UI does not open a native folder chooser. This review does not qualify other operating systems or remote/compressed sources.

## Changes and verification

| Requirement | Change | Verification |
| --- | --- | --- |
| First useful result | Setup offers the existing local folder path, editing, scanning, a synthetic sample, or skip. Scanning waits until setup is completed. | Packaged fresh install, skip, path setup, missing absolute path diagnosis and correction passed. |
| Returning users | Persisted `onboardingCompleted` controls setup visibility. Settings has a replay action. | Setup replay and saved completion passed. Legacy-preference migration remains outside this UI suite. |
| Sample safety | Sample mode is labeled synthetic, says it was not read from source folders, and offers a return to real sessions. | Packaged sample, switch-back, and replay passed. A populated real-session screenshot was captured. |
| Loading and errors | Initial load has a status. Read errors offer Retry. Failed folder saves remain announced and preserve input. | Persistent injected snapshot IPC failure, recovery through Retry, and relative-path rejection passed. |
| Cache recovery | Recovery hides stale telemetry, offers Retry, and provides an explicit backup/rebuild confirmation. Copy explains the retained backup, preference reset, and unchanged source files. | Corrupt-cache retry and explicit backup/rebuild passed. The source bytes and retained backup were checked. |
| Keyboard and semantics | Skip link, named actions, native controls, visible focus, and setup/session landmarks. | Packaged checks passed for names, Tab focus, skip destinations, duplicate IDs, axe serious/critical rules, and an axe positive control. Manual screen-reader review remains. |
| Contrast, type and narrow windows | Larger operational type, stronger warning/error text, focus outlines and responsive wrapping. | Axe checks passed in light, dark and system states. Computed system surface colors passed. The 360px and actual 200% zoom checks had no horizontal overflow. |

## Skill application record

| Installed skill | Files/workflow reviewed | Application and verification |
| --- | --- | --- |
| `impeccable` (Operate) | `SKILL.md`; `reference/mode-operate.md`; `reference/craft-floor.md`; `reference/critique.md`; `reference/audit.md`; `reference/harden.md`; `reference/polish.md`; `reference/onboard.md`; `impeccable context --target src/renderer/main.tsx` | Preserved the compact companion layout and native controls. Added brief setup, skip, editable source path, and sample; improved warning contrast and narrow-width wrapping. Hidden screenshots were inspected at setup, empty, sample, recovery, light, dark, narrow and 200% zoom. No formal two-assessor critique or screen-reader review is claimed. |
| `baseline-ui` | `SKILL.md` | Kept the existing React/CSS stack and native semantic controls. Packaged interactions and screenshots passed. |
| `fixing-accessibility` | `SKILL.md` | Added skip link, named folder control, real buttons, visible focus, labelled setup region and live loading status. Packaged Playwright and axe checks passed. Manual screen-reader review remains. |
| `web-design-guidelines` | `SKILL.md`; latest `command.md` fetched from its upstream URL on 2026-10-22 | Applied guidance for semantic actions, labels, focus, async status, keyboard access, number formatting, wrapping and error recovery. This is not a complete accessibility qualification. Source: <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>. |
| `react-best-practices` (`vercel-react-best-practices`) | `SKILL.md`; compiled `AGENTS.md`; relevant rerender/effect guidance | Used a small conditional setup surface and existing preferences API. No new state framework or heavy dependency. TypeScript build and packaged UI suite passed. |
| `composition-patterns` (`vercel-composition-patterns`) | `SKILL.md`; `rules/architecture-avoid-boolean-props.md`; `rules/architecture-compound-components.md` | A compound component or provider was not warranted for this one setup section. |

## Hidden UI and lifecycle verification

`tests/onboarding-accessibility.spec.ts` covers first-run skip without changing directories, labelled synthetic sample and switching back, setup replay, relative-path validation, a missing absolute source directory and correction, long session IDs/model names, keyboard and narrow-window access, actual Electron 200% zoom, and explicit/system light and dark themes. The transient snapshot test installs a persistent failure at the main-process IPC handler boundary, restores the original handler, retries, and confirms the error clears without duplicate IDs. It injects the pinned local `axe-core@4.14.0` into the hidden packaged renderer through DevTools. Before auditing, the test requires axe to detect a deliberate missing-alt positive control. It checks critical and serious violations across setup, sample, empty, recovery, error, replay, settings and populated views. CSP bypass is scoped to the test DevTools session; the packaged app CSP is unchanged. Recovery checks that Retry preserves corrupt bytes, explicit rebuild retains a backup, resets preferences and preserves source files.

`tests/lifecycle.spec.ts` checks sanitized fatal diagnostics and native background SIGTERM shutdown after observing a new startup `runId`. It checks SQLite integrity and persisted totals after exit. SL-15 in `tests/edge.spec.ts` checks nonzero exit, generic stderr and absence of the raw private sentinel. The packaged helper checks that each launch remains hidden, unfocused and absent from the Dock, then cleans up test-owned children.

Final verification used this local unsigned Apple Silicon candidate: `.local/ui-candidate/mac-arm64/Codex Session Lens.app`. No system-installed app was launched or changed. `npm run build` and `electron-builder --mac dir --arm64 --publish never --config.directories.output=.local/ui-candidate` passed. The final `npm run test:e2e` run passed 33/33 tests in one worker with no retries or skips (53.1 seconds). A further populated-session screenshot test passed 1/1 after adding its capture. The Playwright JSON report is `.local/readiness-ui-report.json`; rendered screenshots are in `.local/readiness-screens/`.

The axe positive control passed, and all tested views had zero critical or serious violations after two contrast fixes. System-theme light and dark computed surface colors passed. The 360px check and Electron's actual 200% page zoom reported no horizontal overflow. No candidate test process remained after the run. These results cover automated behavior and rendered captures. They do not establish manual screen-reader behavior, a full keyboard walkthrough, legacy-v1 migration, or every filesystem/device failure mode.

## Additional operational qualification

The primary check exercised Chromium's actual accessibility tree: Getting started is a named region, Session directories a named textbox and Skip setup a named button. Actual Tab traversal and Enter completed setup, and completion survived restart. An unfinished setup also survived restart. An actual chmod-denied source directory produced the documented local error and cleared after access returned. These tests use the hidden package and do not claim a VoiceOver listening session.

The real SQLite exclusive-lock test passed: a failed settings save announced an error without changing visible preferences; retry after unlocking committed the change. All3 additional operational tests passed in4.3seconds. The first test attempt used an incorrect accessible button name; the corrected exact name matches the existing aria-label, without changing product code. Actual v1.0.1 upgrade/rollback passed, including persisted preferences and removed-source history. The final Impeccable detector scanned renderer TSX/CSS with regex only and emitted no findings; it explicitly did not run parsed-page tiny-text/contrast rules. Rendered axe and geometry checks provide separate evidence.

Manual VoiceOver listening and exhaustive hands-on keyboard review were not performed. They are disclosed limits, not claims of verified assistive-technology behavior. Programmatic keyboard, accessible-tree, focus, contrast, zoom and flow checks are the current evidence.
