# codex-session-lens
A local-first macOS companion HUD for individual Codex sessions. It keeps cumulative usage separate from latest-request usage and shows unknown values as unavailable. It is not affiliated with or endorsed by OpenAI.

## Install

[Download Session Lens 1.3.0 for Apple Silicon](https://github.com/Ethant35/codex-session-lens/releases/download/v1.3.0/Codex.Session.Lens-1.3.0-arm64.dmg). The app is Developer ID signed, Apple notarized and stapled. A ZIP and final checksums are on the [release page](https://github.com/Ethant35/codex-session-lens/releases/tag/v1.3.0).

Open the DMG and drag **Codex Session Lens** into Applications. Open the app, review the suggested Codex folders or use **Choose folders…**, then scan and select a session. Give it an optional private local name so you can find it again. Setup can be skipped or replayed; the sample is synthetic. See the [first-use, update and recovery guide](docs/usability-release.md). Stop if macOS reports a security warning; check the official release and checksums instead of bypassing Gatekeeper.

Requires Apple Silicon and a macOS version supported by Electron 45. Validated on macOS 27.2; older macOS releases have not been tested. The acceptance environment is recorded in ACCEPTANCE.md. No account, backend, API key or network access is required by the HUD.

## Use

Open **Checkpoints** to save a baseline and compare observed token changes and compactions. See [checkpoint use and CLI commands](docs/checkpoints.md).

- Search and select a session manually; Cmd+K focuses search. Selection is saved and never changed just because another session becomes active. A name you assign is a private local alias for that observed session ID, not a title read from its prompts. If there is no alias, identify sessions by model, date or ID.
- The compact HUD keeps the selected session, cumulative input/output and last-request context estimate in view. Open **Details** for identifiers, cached input, request usage and provenance, compaction history and child activity. Cached input is a subset of input.
- Context is explicitly a last-request estimate when a complete sample and limit exist. Current effective occupancy is unavailable. Cumulative tokens are never used as context occupancy.
- An optional **Show project folder labels** setting adds a local folder-name cue from session metadata. It is off by default; folder names are not unique session identities, and selection remains manual. Local aliases take priority. Disabling the setting clears stored folder labels. Settings also controls theme, always-on-top, source folders, pause/resume, diagnostics, setup replay and Clear telemetry. Window size and position persist.

## Telemetry sources and limits

The app discovers uncompressed `.jsonl` files in `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions` (default `~/.codex`), or directories you set. It reads `session_meta`, `turn_context`, cumulative `token_count` / `token_usage_record`, compaction and task-status events. [ARCHITECTURE.md](ARCHITECTURE.md) documents fields, provenance and exact accounting rules. Forked subagent files use their explicit ordinal boundary to exclude inherited parent context. Records above8MiB are skipped with a diagnostic. Compressed archives, remote-only sessions and undocumented event formats are unsupported. It preserves previously ingested history if a source disappears. Version 1.0.1 makes projection independent of file discovery order and restart boundaries. Conflicting equal-time records are shown as unavailable with a warning. An upgraded v1 cache retains known history and discloses any coverage uncertainty.

**Automatic switching to the selected native Codex conversation is unsupported.** The app uses a manual selector. Activity sorting does not identify the foreground conversation. It does not use Accessibility, inject into Codex, or modify Codex. It does not import prompt-derived titles or invent session identities. Aliases are stored in the local cache with the selected IDs; clearing or rebuilding that cache removes them. A retained cache backup preserves its prior aliases.

Status means last observed status, not a guarantee that a process remains active. Unknown child identity is unavailable. Source changes can make metrics incomplete; diagnostics and warnings expose known problems. All telemetry stays local; see [SECURITY.md](SECURITY.md).

## CLI and quiet checks

From the source checkout, use `npm test` for routine checks. It runs in plain Node.js and never starts the desktop app. No packaging is needed.

```sh
npm run cli -- --help
npm run cli -- scan --source /absolute/path/to/session-fixtures
```

The CLI uses the same parser, projection and SQLite store as the HUD. It prints sessions and diagnostics as JSON after one scan. Sources are read-only and must be specified; the CLI does not automatically read your Codex history. Its temporary cache is removed on exit. Add `--cache /absolute/path/to/cli-cache` for restart/replay checks. This creates `lens-cli.sqlite`, separate from the HUD's `telemetry.sqlite`.

For JSON output without npm's command banners, run `npm run build:cli` once, then `node dist/cli/lens.cjs scan --source /absolute/path/to/session-fixtures`. Exit status is 0 for a clean scan, 1 for an operation failure, and 2 for invalid arguments or scan diagnostics. Errors go to the terminal. There are no app dialogs, network requests or model calls. Node 22 may print its SQLite experimental warning to stderr.

UI checks remain separate: `npm run test:e2e` launches a hidden app only when UI verification is needed. Routine parser/storage work should use `npm test`.

## Build and verify

```sh
git clone https://github.com/Ethant35/codex-session-lens.git
cd codex-session-lens
npm ci
npm run prepare:electron  # Reviewed, version-pinned binary setup; no app launch
npm run dev
npm run build
npm run package:mac
npm test                 # Node CLI/core/recovery checks; no app launches
npm run test:e2e          # Separate hidden UI checks
npm run test:e2e:real
```

Node.js 22.13.1+ and npm are required. npm10.9.2 is the tested install client. Dependency install scripts are disabled by project policy; see [dependency-policy.md](docs/dependency-policy.md). Packaging targets arm64 and writes DMG/ZIP files under `release/`. Real E2E checks require the installed, signed-in Codex CLI and running Codex desktop. Deterministic E2E checks need neither and use temporary synthetic JSONL inputs in the actual packaged app. Tests run in the background by default: no HUD window, Dock icon, or focus changes. Results appear in the terminal. The app executable accepts `--background` (or `LENS_BACKGROUND=1`) for this mode; failures go to stderr and exit nonzero. Ctrl+C or SIGTERM stops background mode through the normal shutdown path. Normal launches still show the HUD. See [ACCEPTANCE.md](ACCEPTANCE.md) for results and [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow.

GitHub Actions and CI are intentionally omitted at Ethan's request. Equivalent applicable acceptance runs locally. The original MIT license is preserved.

## Recovery and support

If startup cannot open the local cache, the app offers Retry. For known damaged data, it also offers an explicit backup and rebuild. The backup stays beside the database; source files are never deleted. See [operations.md](docs/operations.md) for backup, restore, deletion, diagnostics and update steps. The current production qualification state is in [production-readiness.md](docs/production-readiness.md).

## Screenshots

Synthetic telemetry, compact light and dark modes:

<img src="docs/hud-compact.png" alt="Compact light HUD with separate cumulative tokens and estimated context" width="360"> <img src="docs/hud-dark.png" alt="Compact dark HUD" width="360">
