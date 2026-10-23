# Download, first use and updates
Author: Ethan

This guide covers the signed, notarized and stapled 1.1.0 Apple Silicon release. Download from the repository's [release page](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.1.0).
## Install and get a first result

1. Download the Apple Silicon DMG for the released version and open it.
2. Drag **Codex Session Lens** to Applications. Eject the mounted disk image, then open the app from Applications. If macOS reports that it cannot verify the app or says it is damaged, stop and confirm that the release and download are authentic. Do not bypass Gatekeeper.
3. Review the suggested local Codex session folders. Keep them, add a folder with the native chooser, or skip setup and configure folders later in Settings. The app reads only the folders shown in setup/settings and leaves source files unchanged.
4. Scan, then choose a session from the results. If you want a recognizable name, assign a private local alias to that observed session. The alias stays local and labels its stable session ID; it is not extracted from prompts and does not invent an identity. Without an alias, recognize it by the model, date and ID shown by the selector.

Setup is short and optional. You can skip it on first launch and replay it from Settings. The optional sample is synthetic and clearly labeled. It is kept separate from your real folders and telemetry.

## Use and return

The HUD opens compact. Expand it when you need latest-request usage, metric provenance or compaction history. Your selected session, folders and display preferences persist between launches. A manually selected session stays selected; Session Lens cannot tell which conversation is currently foreground in Codex, so select another session when needed.

Token values are based on data observed in local Codex session files. Cumulative input and output counts are snapshots; cached input is a subset of input. A context figure, when available, estimates usage from the last request and its known limit. It does not show current context occupancy. Missing or conflicting evidence remains unavailable. The app does not read prompts to create titles.

Aliases are saved with the local cache. Clear telemetry and cache rebuild remove them. Rebuild keeps a separate cache backup, which retains the aliases from before rebuild. If you clear or rebuild, scan your folders and assign aliases again as needed.

## Update or roll back

Session Lens has no automatic updater and does not connect to a release service. To update, download the newer DMG from Releases, quit the app, open the DMG and replace the app in Applications. Leave the application data folder in place. Launch the new version and confirm the selected session, folder list, preferences and diagnostics. Keep a closed-cache backup before a major update if you need a direct rollback path. The [operations guide](operations.md) explains backup, restore and cache recovery.

To roll back, quit the updated app and restore the prior app. Keep the newer version's cache separately. Restore a pre-update cache backup only when release notes or support instructions call for it. Never copy or replace a database while the app is open, and do not combine a database with unrelated journal/WAL sidecars.

## Recovery

If session folders are missing, open Settings, use the folder chooser to correct the list, save and rescan. If the cache is locked or inaccessible, close other copies, check disk space and folder access, then retry. For a recognized damaged cache, use the app's explicit backup-and-rebuild action; it retains the old database and sidecars in a private sibling backup folder. It does not delete Codex source files. Clear telemetry is a separate action: it removes cached observations and aliases, pauses ingestion, and leaves source logs and earlier recovery backups intact.

For support, include app and macOS versions, the action, expected and actual behavior, and optionally the sanitized `diagnostics.json`. Do not share session logs or `telemetry.sqlite`; they contain private session data. Diagnostics are local and are not uploaded automatically.

## Release verification status

The exact final DMG and ZIP were uploaded to the draft GitHub release, downloaded and matched against post-staple SHA256SUMS.txt. Both passed Gatekeeper and ticket validation. The read-only DMG copy installed into a temporary Applications directory passed40 hidden tests, including first result, names/settings persistence, sample exit/replay, actual1.0.1 update/rollback, damaged-cache recovery and native shutdown. The normal installed app was preserved. Final hashes and submission IDs are in [readiness-evidence.json](readiness-evidence.json).

The workflow is programmatic with synthetic fixtures and isolated data. The macOS folder chooser is mocked at its Electron boundary to keep dialogs hidden. No unfamiliar-user study, manual VoiceOver session, or human Finder drag-and-drop test occurred. These limits do not replace the observed signature, notarization, quarantine assessment and installed-app results.
