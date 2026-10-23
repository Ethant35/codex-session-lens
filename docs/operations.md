# Operations and recovery
Author: Ethan

## First use
Install the Apple Silicon package, then open Session Lens. Setup shows the source folders and the local-only data boundary. Use your folders, skip setup with the displayed defaults, or select the clearly labeled synthetic sample. Settings can replay setup. No login, API key, Accessibility permission or network service is required. The source folder must contain readable, uncompressed Codex JSONL files.

Choose a session by ID or model. The app preserves that manual selection. Activity order does not reveal which conversation is selected in Codex. Context is a last-request estimate; a missing or invalid source value stays unavailable.

## Cache unavailable
Retry after closing other app copies, freeing disk space or restoring folder access. A locked or inaccessible cache is never automatically replaced. For known damaged data, the app offers a separate backup-and-rebuild confirmation. It rechecks the cache before moving it. Rebuild retains the failed SQLite database and regular sidecars in a private sibling `cache-backup-*` directory, then starts fresh setup. Source logs remain untouched. History absent from the source files can be recovered only from the retained cache/backup.

If a scan cannot be saved, prior committed history stays available. Correct the storage problem and rescan. Failed or cancelled scans do not publish partial telemetry. If diagnostics report invalid stored telemetry, quit, retain a backup as below, then use Clear telemetry to reimport readable source files.

## Backup, restore and update
Quit Session Lens before copying its data. The default folder is `~/Library/Application Support/codex-session-lens`; an explicitly set `LENS_DATA_DIR` overrides it. Copy the whole folder to a private backup location. Treat it as private data: it includes session identifiers, telemetry, configured directories and selections. It is not encrypted by the application.

Before updating, retain the prior app and a closed-cache backup. Replace the app only after quitting it. Start the new version and check the selected session, settings and diagnostics. To roll back, quit the new app, retain its data separately, restore the prior app, and restore the closed-cache backup if the release notes require it. Never overwrite an open database or mix a database with unrelated journal/WAL sidecars. The current hidden upgrade test uses an actual v1.0.1-created cache; see readiness evidence for the executed result. Historical v1.0.0 migration evidence is separate.

## Retention and deletion
Settings → Clear telemetry removes observations, projections and deduplication keys and pauses ingestion. SQLite secure deletion overwrites deleted pages; the file retains allocated free space for reuse. Preferences and bounds remain. Clear does not delete source JSONL files or earlier `cache-backup-*` folders. Resume imports readable source files again.

To remove all app data, quit the app and move its entire data folder to Trash. This removes preferences, diagnostics and recovery backups with it. Removing the app alone leaves data intact. Deleting the original Codex session logs is a separate decision; Session Lens never does that.

## Support diagnostics
`diagnostics.json` in the data folder keeps the last100 allowlisted local support events, at most64KiB. It records event/time, a fixed error category, app version and an opaque run ID. It does not contain exception messages, raw stacks, source contents, session IDs or source paths. Repeated identical failures are coalesced; logging is best effort when storage fails. Nothing is automatically uploaded. The UI also reports scan errors and last-scan time.

For a bug report, provide app/macOS versions, the action, expected and actual behavior, and this sanitized diagnostics file if useful. Reproduce with synthetic fixtures when possible. Do not attach telemetry.sqlite, source logs, screenshots containing private session data, or Playwright traces from real-session tests to a public issue. Security reports should use the repository's private security channel when available.

## Quiet developer checks
Run `npm test` for Node CLI, service, cache recovery, parser/property and diagnostic checks. It does not launch Electron. Packaged UI checks use `--background`, isolated temporary sources/data and automatic process cleanup. The test harness verifies no visible/focused/focusable window or Dock icon. Native SIGTERM and fatal-error tests also verify process exit. Do not enable visible-test flags on another person's desktop.

## Diagnostic questions
1. Did the process start, fail, or recover? Read started/fatal/cache event names and run IDs.
2. Was the failure storage-related? Busy/full/permission/corrupt/io categories distinguish common causes without copying exception text.
3. Is ingestion progressing? Read last-scan time, error messages and file counts in Settings; use the CLI on synthetic or explicitly selected sources for a repeatable check.

This offline single-process app has no distributed traces, remote log aggregator, account authentication, web server, production traffic rollout or cloud alerting. Those service-specific checklist items are inapplicable.
