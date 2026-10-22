# Architecture
Author: Ethan

Codex Session Lens is a companion HUD, not a native Codex extension. Electron hosts a React renderer. TypeScript runs in both processes. A sandboxed preload exposes five narrow asynchronous operations. The renderer has no Node access, remote content, filesystem API, or general IPC interface. The main process checks the sender and validates preference inputs. Chromium requests outside the bundled renderer are blocked; the CSP disallows connections. There is no server, account integration, updater, analytics SDK, or credential reader.

## Data path
Configured directories → recursive read-only JSONL discovery → incremental UTF-8 framing → allowlisted telemetry projection → SQLite → validated IPC → React.

The default sources are `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions`, with `~/.codex` as the default home. Only uncompressed `.jsonl` files are supported. The app ignores symlinks and limits directory nesting. It checks for appends every second; incomplete trailing lines wait for the next append. Oversized lines are discarded with a diagnostic. Inode changes, size decreases, and same-size modification trigger replay. A missing source does not delete local history. Paths can be changed in Settings.

Session identity comes only from `session_meta.payload.id`, not filenames, working directories, model names, or activity times. A record with a conflicting thread identity is skipped. SHA-256 event fingerprints make replay idempotent. Only sanitized session projections and fingerprints are stored, never raw events or prompts. SQLite transactions save the fingerprint and projection together; secure deletion and VACUUM run when clearing data. Files use owner-only permissions. Clear also pauses ingestion, so the next scan does not immediately repopulate history. Original Codex files are never changed.

## Accounting contracts
- `event_msg` / `token_count` / `info.total_token_usage` is the authoritative cumulative snapshot. Replace it; never add it to an earlier cumulative value.
- `token_usage_record.thread_token_usage`, when present, is another cumulative snapshot, not another billable response to add. `usage` is its latest-request sample. Missing cumulative usage is not reconstructed from an incomplete response history.
- Cached input is a subset of input. It is shown separately but never added to input. Output already includes reasoning; reasoning is not added again.
- Missing, negative, unsafe-integer, or internally inconsistent usage is unavailable. Counter regressions retain prior totals with an explicit uncertainty warning. Older timestamps cannot overwrite newer projections.
- Latest-request usage is shown separately from lifetime totals. A context estimate is produced only when that same token-count record contains a complete latest total and a positive context limit. The ratio is latest total / limit. It is **not exact current occupancy**, does not subtract Codex UI's baseline allowance, and is not promised to match Codex's remaining-context display. Model changes, new tasks, compaction, and samples without a complete limit invalidate the estimate.
- `compacted` and `context_compacted` record known compactions, deduplicated when their timestamps match. Different timestamps remain separate observations; missing events cannot establish that no compaction occurred.
- `session_meta.source.subagent.thread_spawn.parent_thread_id` provides an observed parent relationship. Child totals never merge into parent totals. Missing identity is unavailable. Status is the last recorded task status, not a liveness guarantee.

## Desktop selection investigation
On 2026-10-22 the installed CLI was 0.163.0; desktop was com.openai.codex in ChatGPT.app, version 26.1016.61520, emitting 0.163.0-alpha.11.1 rollout metadata. The documented [Codex app-server](https://learn.chatgpt.com/docs/app-server) protocol can start and manage client-owned threads and deliver usage notifications. No documented foreground desktop conversation API was established in this investigation. Starting a second app-server does not establish which conversation is selected in another application.

A read-only macOS Accessibility probe confirmed the desktop was running but reported that assistive access was not granted. No permissions were changed. No reliable automatic selection was verified. v1 therefore implements a persistent manual selector with search by session ID/model, activity sorting and recent selections. A newly active session never overrides the manual selection. Accessibility-based automatic switching is not implemented. Activity order is not foreground detection.

Parser structure was checked against the installed rollout schema and the upstream [Codex protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs), including TokenUsageInfo, TokenUsageRecord and SubAgentSource. These formats can change; unsupported records are ignored. See ACCEPTANCE.md for the exact locally tested version and evidence.
