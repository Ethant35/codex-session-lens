# Scan warning patch release 1.3.1
Author: Ethan
Date: 2026-10-29
Status: Qualified candidate; publication and installed-app update pending.

## Changes

Scan errors now show a warning above the compact HUD's session values. The warning explains that retained values may be stale or incomplete and provides keyboard access to Settings and diagnostics. The footer shows Scan incomplete while errors remain; paused ingestion stays labeled paused. Missing-folder recovery removes the warning when diagnostics clears. Skipped-record diagnostics remain visible until the source configuration is saved again. Sample and cache-recovery modes retain their own status.

The first-use guide now targets this release and covers checkpoints, data clearing and rollback limits. No accounting, ingestion, database schema, source access, IPC or dependency changes are part of this patch.

## Qualification

The working checkout and a separate clean locked install each pass all 67 Node tests. All six independently built runtime outputs are byte-identical. The production dependency audit reports no known advisories. The two new warning regressions first failed against the released 1.3.0 binary at the missing-warning assertion, then passed against the changed package. Eighteen existing hidden UI checks also passed before release qualification. The new tests cover retained totals, missing and malformed sources, diagnostics focus, pause labeling, recovery, and light/dark compact layouts.

All 47 signed-package checks passed without failures, skips or retries. Four focused checks passed on the quarantined app copied from the DMG, including both warning regressions, upgrade/rollback from 1.0.1 and reinstall. App and DMG notarization were separately Accepted with no issues, and both tickets were stapled and validated. Strict signatures and Gatekeeper passed. A hidden test of an actual-data copy preserved all 185 sessions and cached totals without scanning live sources. Exact hashes and submission IDs are in [machine-readable evidence](scan-warning-release-evidence.json). Public-download and installed-app update checks remain pending. No visible test windows or real model calls are used. Tests use disposable state. Native chooser behavior is mocked at its Electron boundary; no manual VoiceOver or unfamiliar-user study is claimed. Security review of this patch is limited to the changed renderer and documentation; the prior full security scan remains historical evidence, not a scan of these bytes.

## Data and cleanup

The existing installation was 1.0.1. Its closed data directory was copied to a private backup and all 29 regular-file hashes matched. Upgrade checks use disposable data, including a copy of that backup. The actual data directory is preserved when replacing the app bundle. Final data-preservation and cleanup results will be appended after installation.

Evidence is retained in `.local/release-1.3.1/`. Old release tags and sealed remote artifacts are not changed.
