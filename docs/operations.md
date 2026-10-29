# Operations and recovery
Author: Ethan

## First use and return use

Download a published Apple Silicon DMG from the repository's [Releases](https://github.com/Ethant35/codex-session-lens/releases) page. Open it, drag **Codex Session Lens** into Applications, eject the disk image, then open the app. Do not bypass a macOS security warning. Check the release page and stop if the warning says the app cannot be verified or is damaged.

On first launch, review the suggested Codex session folders. Keep them, add folders with the native chooser, or skip setup and set folders later in Settings. Save the folders and scan. Select a session from the results. The selector is manual: recent activity does not show which conversation is currently foreground in Codex.

You can assign a private local alias to a selected session after the app has observed its stable ID. The alias labels that ID; it does not come from prompt text and does not create a session. Without an alias, use the model, date and ID shown in the selector to recognize a session. Your selection and aliases persist with local preferences/cache. If you use Clear telemetry or rebuild the cache, the app will scan available sources again and aliases are lost; a retained cache backup keeps the earlier aliases. Setup can be replayed from Settings without reinstalling.

Settings also has **Show project folder labels**, off by default. When enabled, the app derives a sanitized folder basename from the `cwd` field in the bounded first session record and stores that name locally. It does not store the full project path or use prompt/message text. Folder names can repeat, so use them only as a clue; the selector remains manual and session identity still comes from the session ID. An alias takes priority when present. If a configured source cannot be read, folder hints are withheld until a complete scan succeeds. Turning the option off deletes stored folder labels. Turning it back on allows a later scan to derive them again.

The compact HUD keeps the selected session, cumulative input/output and last-request context estimate in the first view. Open **Details** for identifiers, cached-input breakdown, latest-request usage and metric provenance, local folder label, compaction history and child activity. Cumulative input/output token counts come from observed Codex snapshots. Cached input is a subset of input. A context value, when available, is an estimate from the last request; it is not current context occupancy. Values that lack sufficient source data or have conflicting observations remain unavailable. Manual mode cannot follow the foreground Codex conversation automatically.

The optional sample is synthetic, visibly labeled, and kept separate from session folders and telemetry. Return to real sessions by leaving sample mode and scanning the selected folders.

## Folder and scan problems

Use the folder chooser to select a local directory that contains readable, uncompressed Codex `.jsonl` session files. Review the selected folder list before saving. Session Lens reads source files without changing them. If a folder is unavailable or unreadable, correct its location or permissions in Settings and rescan. Compressed archives, remote-only sessions and undocumented event formats are unsupported. Oversized records are skipped with a diagnostic.

If a scan cannot be saved, earlier committed history stays available. Fix the storage problem and rescan. Failed or cancelled scans do not publish partial telemetry. If diagnostics report invalid stored telemetry, retain a backup as below, then use Clear telemetry to reimport readable source files.

## Cache unavailable

Retry after closing other app copies, freeing disk space or restoring folder access. A locked or inaccessible cache is never automatically replaced. For known damaged data, the app offers a separate backup-and-rebuild confirmation. It rechecks the cache before moving it. Rebuild retains the failed SQLite database and regular sidecars in a private sibling `cache-backup-*` directory, then starts fresh setup. Source logs remain untouched. History absent from source files can be recovered only from the retained cache or backup.

## Backup, update and rollback

Quit Session Lens before copying its data. The default folder is `~/Library/Application Support/codex-session-lens`; an explicitly set `LENS_DATA_DIR` overrides it. Copy the whole folder to a private backup location. Treat it as private data: it includes session identifiers, telemetry, configured directories, selection and aliases. It is not encrypted by the application.

The app has no automatic updater or network connection. To update, download the newer published DMG from the repository's Releases page, quit Session Lens, open the DMG and replace the app in Applications. Keep the data folder in place. On first launch after the update, confirm the selected session, folders, preferences and diagnostics. If you need to roll back, quit the newer app, keep a copy of its data, restore the prior app and restore a closed-cache backup if the release notes require it. Never overwrite an open database or mix a database with unrelated journal/WAL sidecars. The published 1.2.0 release passed actual 1.0.1 and 1.1.0 cache upgrade/rollback/forward checks; see [qualification status](production-readiness.md). The final public-DMG installed app also passed all 43 checks, with zero failures, skips or retries.

## Retention and deletion

Settings → Clear telemetry removes observations, projections, deduplication keys and local aliases, then pauses ingestion. SQLite secure deletion overwrites deleted pages; the file retains allocated free space for reuse. Preferences and bounds remain. Clear does not delete source JSONL files or earlier `cache-backup-*` folders. Resume imports readable source files again.

To remove all app data, quit the app and move its entire data folder to Trash. This removes preferences, diagnostics and recovery backups with it. Removing the app alone leaves data intact. Deleting original Codex session logs is a separate decision; Session Lens never does that.

## Support diagnostics

`diagnostics.json` in the data folder keeps the last 100 allowlisted local support events, at most 64 KiB. It records event/time, a fixed error category, app version and an opaque run ID. It does not contain exception messages, raw stacks, source contents, session IDs, aliases or source paths. Repeated identical failures are coalesced; logging is best effort when storage fails. Nothing is automatically uploaded. The UI also reports scan errors and last-scan time.

For a bug report, provide app/macOS versions, the action, expected and actual behavior, and this sanitized diagnostics file if useful. Reproduce with synthetic fixtures when possible. Do not attach telemetry.sqlite, source logs, screenshots containing private session data, or Playwright traces from real-session tests to a public issue. Security reports should use the repository's private security channel when available.

## Quiet developer checks

Run `npm test` for Node CLI, service, cache recovery, parser/property and diagnostic checks. It does not launch Electron. Packaged UI checks use `--background`, isolated temporary sources/data and automatic process cleanup. The test harness verifies no visible/focused/focusable window or Dock icon. Native SIGTERM and fatal-error tests also verify process exit. Do not enable visible-test flags on another person's desktop.

This offline single-process app has no distributed traces, remote log aggregator, account authentication, web server, production traffic rollout or cloud alerting. Those service-specific checklist items are inapplicable.
