# Independent weekly accounting check
Author: Ethan

This Python verifier reads raw JSONL, gzip and Zstandard logs. It does not import Lens source or consume Lens results to set expected answers. Zstandard input uses the local `zstd` CLI. It never writes source logs or opens the HUD database. Source filenames are fingerprinted in the output. Prompts, message content and full project paths are not retained.

Run from the repository root:

```sh
python3 verification/weekly-oracle/test_oracle.py
python3 verification/weekly-oracle/oracle.py \
  --source "$HOME/.codex/sessions" \
  --source "$HOME/.codex/archived_sessions" \
  --start 2026-11-02 --end 2026-11-08 \
  --timezone America/Los_Angeles \
  --output .local/weekly-verification/oracle-real.json
```

The date range includes both selected local dates. Its upper timestamp is midnight after the end date. The primary calculation sums per-response `token_usage_record.usage`, using the actual `thread_id`, with response-ID deduplication. Child identity comes from the first metadata header's `id`. A later inherited parent header does not overwrite it. Historical copied child records with a different owner or before its history ordinal are excluded. Each session contributes its own responses once; parent IDs retain the family relationship.

The paired `token_count` channel is not another charge. Its cumulative total can differ from the detailed cumulative total. Its emission can be delayed several seconds. A matching latest preceding response ordinal and `last_token_usage`, or the same detailed cumulative snapshot, identifies the duplicate channel without an arbitrary time window. Otherwise the oracle uses legacy cumulative increases and records the fallback. An initial absolute cumulative value without a prior baseline counts only the last request, if available. Missing first-call usage is explicit. Legacy observation timestamps cannot establish the exact time of every intervening call.

Hand-calculated checks cover an inclusive Pacific date boundary, inherited child history, a plain/compressed duplicate run, paired channels, delayed delivery and disagreement between cumulative channels. The detailed call record is the primary evidence when both channels exist.

Private run evidence belongs under `.local/weekly-verification/`: full decoded source fingerprints and before/after stat stability, a frozen answer and receipt made before reading product results, selected raw-run proofs, and reconciliation. `prove_selected.py --session ID` independently re-reads specified raw runs and sums only detailed responses for the fixed November 2–8 verification week.

Project grouping uses the original cwd identity, with a hash key and basename display label. It does not infer Git repositories or merge worktree/project directories. Cached input is a subset of input and is not added again. These are recorded token totals, not billing, money or account allowance. Zero detected parser issues does not prove that absent files or unrecorded events never existed. The oracle streams the source but retains normalized usage rows for arithmetic; it is a verification tool, not the production memory/performance benchmark.
