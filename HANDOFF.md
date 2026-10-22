# Codex Session Lens v1.0.1 handoff
Author: Ethan
Updated: 2026-10-22, America/Los_Angeles

The telemetry audit, repair and local acceptance are complete. Repository: https://github.com/Ethant35/codex-session-lens. Release: https://github.com/Ethant35/codex-session-lens/releases/tag/v1.0.1. Use `gh release view v1.0.1` to check publication state on resume. Application source commit: 01a746c90180105c5966297e9b460745704ccbda. Later evidence/documentation commits do not change the application. See docs/patch-audit.md and docs/patch-*.json for sanitized evidence.

## Changed and checked
Three v1 defects reproduced in the released package: reverse discovery lost model/usage, restart kept suppressed metrics missing, and late compaction left stale context. The patch persists sanitized observations and projects changed sessions in timestamp order. Equal-time conflicts are explicit unknowns; cumulative snapshots are not added. The transactional v1 upgrade keeps preferences/history, clears old deduplication hashes once and discloses missing historical coverage.

Final primary background suite23/23; independent clean clone23/23; actual Codex CLI/desktop2/2; DMG-installed checks5/5. The final real turn matched input15827/output10/cached7168 after terminal-first ingestion, restart and overlap. Both v1 migration cases passed before the background-mode request. Native installed --background ingested correctly, exited0 through SIGTERM/app.quit and passed SQLite integrity. Primary/clean/installed app.asar SHA256: 39cf6a7c99368bfaef1a09e579b5a8242d7d5d1c4bf20e30c44cfb5e65922182.

## Required working rules
Ethan requested no disruptive app tests. Tests and preview captures default to --background: hidden window and Dock icon, no focus, terminal failures, nonzero exit on fatal errors. Ctrl+C/SIGTERM performs normal shutdown. Do not set LENS_VISIBLE_TESTS=1 or LENS_ALLOW_VISIBLE_BASELINE=1 without an explicit request. v1 cannot run hidden; its migration evidence already passed and should not be rerun visibly. Keep test cleanup automatic. Normal GUI launches still show the HUD.

GitHub Actions are disabled and run count is zero. Preserve that state, verify before pushes/tags, and never create or dispatch workflows. No config.toml changes. Use only local E2E checks. No subagent work is active. The supported account usage checker runs every45seconds during active work; stop all work if any applicable window reaches100%used. No credit/reset/provider bypass.

## Installed files and limits
Installed app: /Users/ethantarnarider/Applications/Codex Session Lens.app. Previous install retained at .local/installed-v1.0.0.app. Final DMG/ZIP under release/. Clean clone under .local/audit-clean-checkout. The mounted DMG was ejected. No raw user rollouts or test traces are published.

Manual session selection only; context is a last-request estimate, not current occupancy. Only uncompressed local JSONL and Apple Silicon/macOS27.2 were exercised. Source timestamp conflicts remain conservative. Missing v1 history cannot be reconstructed without sources. No Developer ID signing/notarization. Production dependency audit has zero findings; eight moderate packaging-tool findings remain disclosed. Personal author fields are Ethan where supported; DMG/ZIP/plain source have no portable author field. Factual producer metadata and the original MIT license remain intact.
