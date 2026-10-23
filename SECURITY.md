# Security and privacy
Author: Ethan

The app reads only configured local JSONL session directories. No account, external API key, cloud backend or network connection is required. The app does not read Codex authentication files or modify Codex binaries, settings, databases or logs. It does not request Accessibility permissions, inject code or attempt automatic foreground conversation detection.

Prompt and response text may exist in source JSONL files. The framing parser sees each source line in memory, but persists only allowlisted token counts, identifiers, model, timestamps, parent identities, status, compaction provenance, warnings and hashes. Session filenames and configured directory paths are local data; the diagnostics UI is not an export. No raw parsing errors or input payloads are logged. SQLite uses owner-only file permissions; this is not encryption at rest. Use macOS account security and FileVault as appropriate.

Settings → Clear telemetry deletes the local telemetry observations, projected history, private local names and fingerprints, securely overwrites deleted SQLite pages and pauses ingestion. The database retains free pages for reuse. Original Codex files are preserved. Resuming ingestion imports them again. Preferences and window bounds remain saved. Removing the app does not remove its data; data normally lives in `~/Library/Application Support/codex-session-lens`. The environment variable LENS_DATA_DIR can set an isolated data directory.

Renderer Node integration is disabled; context isolation, renderer sandboxing and web security are enabled. IPC checks sender identity and input shape. The native folder chooser returns only user-selected directory paths; persistence requires explicit Save. No arbitrary path reads are exposed to the renderer. Navigation, new windows, webviews, permissions and external requests are denied. There is no auto-updater or crash-upload configuration.

Production 1.1.0 artifacts are Developer ID signed and Apple notarized, with stapled app and DMG tickets. Development packages from npm run package:mac remain unsigned by the distribution identity. Do not bypass Gatekeeper warnings; verify that the download came from the official repository release and matches its checksums.

Report security issues privately through the repository's GitHub security reporting channel if available. Otherwise contact the maintainer before posting sensitive details; do not include conversation logs or secrets in public issues.

## Local support diagnostics and recovery
`diagnostics.json` in the app data folder contains at most100 sanitized support events and is limited to64KiB. It contains no raw errors, stacks, prompts, responses, session identifiers or source paths. Events use fixed names/categories plus app version, time and an opaque process identifier. Diagnostic writes reject symlinks/hard links and are best effort when storage is unavailable. Nothing is uploaded automatically.

Explicit cache rebuild moves the failed database and regular SQLite sidecars to a private `cache-backup-*` directory. Backups contain local telemetry and preferences and remain until the user removes them. Clear telemetry does not remove prior recovery backups or source logs. Quit before backing up or restoring the app data directory. See docs/operations.md.

Local session names are user-entered labels stored only in the cache, keyed by observed IDs. They are never taken from prompts or uploaded. Names do not change source identities, counters or Codex chat titles. Clear or rebuild removes them; a retained recovery backup still contains its old names.
