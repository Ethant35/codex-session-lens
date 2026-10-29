# Codex JSONL fork and subagent compatibility

Author: Ethan

## Confirmed source behavior

Codex rollout records include a top-level `ordinal`. A child rollout can begin with its own `session_meta`, followed by inherited parent records, including the parent's `session_meta`. The child's metadata can include `forked_from_id`, `parent_thread_id`, `history_mode`, `multi_agent_version`, and `subagent_history_start_ordinal`.

The upstream Codex thread-history materializer at inspected commit `30587d78850abf2bfc484ffb0ab0f71497cc9c05` reads that boundary from session metadata and classifies a row as inherited when `ordinal < subagent_history_start_ordinal`. It does not project inherited rows into the subagent's own history. The upstream type describes this field as the first rollout ordinal belonging to the subagent's projected history. These are ordinal comparisons, not physical JSONL line-number comparisons:

- [Codex thread-history materializer](https://github.com/openai/codex/blob/30587d78850abf2bfc484ffb0ab0f71497cc9c05/codex-rs/thread-store/src/local/thread_history_materialization.rs), especially the inherited-subagent predicate and conditional projection.
- [Codex thread-store metadata type](https://github.com/openai/codex/blob/30587d78850abf2bfc484ffb0ab0f71497cc9c05/codex-rs/thread-store/src/types.rs), which documents `subagent_history_start_ordinal`.

## Ingestion behavior

Session Lens recognizes this inherited prefix only when the first valid `session_meta` has a valid fork ID and parent ID that match each other and `source.subagent.thread_spawn.parent_thread_id`, and a safe integer boundary greater than the header's top-level ordinal. The header provides the child identity and parent relationship. Later rows with ordinals below the boundary are ignored. A repeated `session_meta` is exempt from mixed-ID rejection only when its ID equals the declared fork parent and its ordinal is below the boundary. At or after the boundary, normal identity checks apply. A mixed identity without this verified shape remains blocked for the rest of that file until it is reset.

When a fork boundary is active, rows without a valid top-level ordinal are not attributed to the child. One fixed sanitized diagnostic is retained per affected file, bounded by the existing 500-diagnostic limit. This avoids guessing a boundary from line position or timestamps. The scanner does not inherit the parent's usage, model, context, status, or compaction data into the child.

## Verification

`tests/core/ingestion.test.ts` models the real structure with a child header, an inherited parent header and telemetry, and post-boundary child telemetry. It checks exact child totals, parent relationship, status isolation, absence of a parent session created from inherited rows, and duplicate-free restart replay. The unmarked mixed-ID regression remains in the same suite. The independent core suite passes 20/20 on Node v22.13.1.

The local compatibility inventory found this header/inherited-parent pattern in 48 of 154 source files during a read-only metadata pass. This document includes no paths, session IDs, source contents, prompts, account identifiers, or base instructions. The post-repair full scan removed all48 mixed-identity diagnostics. An independent allowlisted comparison then matched45 actual child totals exactly;3 were explicitly unavailable because their latest timestamp contained conflicting cumulative records. No unexplained mismatch remained. See core-readiness.md for limits and timing. The post-fix full actual-history CLI scan remains separate verification and must complete before this format is qualified against all local history.

## Limits

Ordinal-based filtering applies only to sources with the validated metadata shape above. The scanner does not infer fork boundaries for older or incomplete metadata. In those files, conflicting session identities continue to block the remainder of the file, preserving the conservative behavior. No source file is changed.


## Current telemetry check, October 28, 2026

The current [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server) describes `thread/tokenUsage/updated` notifications and `contextCompaction` items; the older `thread/compacted` notification is deprecated. Those are live RPC shapes, not the on-disk rollout format. Session Lens continues to read local JSONL only; it does not connect to app-server or start a model turn.

A read-only, bounded local inventory examined at most 8 MiB from each of 12 recently modified October 27/28 rollouts (51,815,450 bytes). It found 944 `token_usage_record`, 953 `token_count`, 12 top-level `compacted` records, and 19 timestamps shared by both usage formats. Only aggregate counts and field names were retained in the ignored compatibility report. No prompts, session IDs, account values or full paths were exported. This sample does not establish compatibility with every Codex release or all history.

Current records include `cache_write_input_tokens` in usage objects. The parser reads input, output and cached-input counters and ignores that extra field; it does not add cache-write counts to input or claim a price estimate. Compacted records can contain replacement history, resume metadata, window metadata and a latest usage record. Only the outer compaction marker and timestamp are retained; nested message/history/usage content is not read into the cache. Duplicate compaction records at one timestamp count once; this is an observed timestamp count, not proof of all compactions performed.

The paired-format inventory exposed a context-estimate defect. A detailed record has no context-window field and used to invalidate a matching same-time `token_count` estimate. Version 1.3.0 uses the complete same-time sample when usage agrees. Conflicting samples remain unavailable, and a later detailed record without a window invalidates an older estimate. Existing cached observations use the same reducer when sources are rescanned. A cache-only session retains its earlier conservative snapshot until newer evidence is projected.

Synthetic regression coverage: `tests/core/ingestion.test.ts` checks paired records, optional cache-write fields, replay, conflicting counters and later missing-window invalidation. Existing fork and identity rules remain unchanged. The live metadata inventory is separate from deterministic synthetic accounting tests and does not constitute a new paid model call.
