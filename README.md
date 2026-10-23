# codex-session-lens
Live session telemetry and context tracking for Codex

A local-first macOS companion HUD for individual Codex sessions. It keeps cumulative usage separate from latest-request usage and shows unknown values as unavailable. It is not affiliated with or endorsed by OpenAI.

## Install

This source branch contains candidate1.1.0, including the setup, recovery and CLI features below. It has passed local signed-package checks, but notarization is deferred and1.1.0 is not published. The existing1.0.1 release uses the earlier interface. See [current qualification](docs/production-readiness.md).

Download the Apple Silicon DMG from [Releases](https://github.com/Ethant35/codex-session-lens/releases), open it and drag **Codex Session Lens** into Applications. Open the app, confirm your session folders in the short setup screen, then choose a session by ID or model. Setup can be skipped or replayed from Settings. The labeled sample uses synthetic values and never enters stored history. The development release is unsigned and not notarized. If macOS blocks it, review the source and use System Settings → Privacy & Security → Open Anyway for this app. Do not disable system security protections.

Requires Apple Silicon and a macOS version supported by Electron 45. Validated on macOS 27.2; older macOS releases have not been tested. The acceptance environment is recorded in ACCEPTANCE.md. No account, backend, API key or network access is required by the HUD.

## Use

- Search and select a session manually; Cmd+K focuses search. Selection is saved and never changed just because another session becomes active.
- Read cumulative input/output and cached input (a subset of input), with latest-request usage shown separately.
- Context is explicitly a last-request estimate when a complete sample and limit exist. Current effective occupancy is unavailable. Cumulative tokens are never used as context occupancy.
- Expand compaction history and distinguishable child activity. Child metrics stay separate.
- Settings controls system/light/dark theme, always-on-top, source directories, pause/resume, diagnostics and clear history. Compact reduces spacing and hides the latest-request detail strip. Resize and move the window; bounds persist.

## Telemetry sources and limits

The app discovers uncompressed `.jsonl` files in `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions` (default `~/.codex`), or directories you set. It reads `session_meta`, `turn_context`, cumulative `token_count` / `token_usage_record`, compaction and task-status events. [ARCHITECTURE.md](ARCHITECTURE.md) documents fields, provenance and exact accounting rules. Forked subagent files use their explicit ordinal boundary to exclude inherited parent context. Records above8MiB are skipped with a diagnostic. Compressed archives, remote-only sessions and undocumented event formats are unsupported. It preserves previously ingested history if a source disappears. Version 1.0.1 makes projection independent of file discovery order and restart boundaries. Conflicting equal-time records are shown as unavailable with a warning. An upgraded v1 cache retains known history and discloses any coverage uncertainty.

**Automatic switching to the selected native Codex conversation is unsupported.** The app uses a first-class manual selector. Activity sorting does not identify the foreground conversation. It does not use Accessibility, inject into Codex, or modify Codex. Search uses session ID and model; prompt-derived titles are deliberately not imported.

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
