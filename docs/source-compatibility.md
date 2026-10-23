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
