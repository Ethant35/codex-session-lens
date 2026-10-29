# Appended telemetry

Author: Ethan

## Sub-features

Live input/output/cached counters, cumulative replacement, request estimates, missing data.

## How to get to it (user POV)

Select a session created in the test source, then append complete JSONL records while it is running.

## Driving it with Playwright and the Node CLI

tests/acceptance.spec.ts SL-03 appends counters and checks their rendered update within five seconds. The compact usability test also verifies the reviewer example: 10000/1500 becomes 12000/1800, while the 2300-of-128000 last-request estimate stays separate. SL-05 checks overlapping cumulative records are not added. SL-06 uses cumulative 80000/20000 and latest 1000/250 with limit5000, proving 25% derives from latest usage; missing limits become Unavailable.

## Gotchas

A fixture without required usage fields is not evidence of a parser bug. Cached input is a subset of input. Source hashes/content/mtime checks belong to CLI/service tests. Never modify real source files.

The current paired-format regression in tests/core/ingestion.test.ts checks token_count and token_usage_record emitted at the same timestamp. Matching usage can use the complete context sample; conflicting usage or a later missing window stays unknown. tests/core/projection.test.ts prevents a legacy cache estimate from being reused by a live detailed record.
