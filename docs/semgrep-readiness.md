# Local Semgrep scan
Author: Ethan
Date:2026-10-22

Ethan explicitly approved the full plan. The refreshed run uses the same approved seven official packs and four repository URLs, Community1.182.1, all severities and at most two scanner processes. Metrics, source/results upload, paid/Pro login, autofix and CI remain off. Pro validation is unavailable. The supplied skill runner and SARIF merger were used. Prior outputs remain in static_analysis_semgrep_1; the final post-fork-repair refresh is retained separately in static_analysis_semgrep_3.

All11 scan outputs were produced and merged into seven distinct findings: two WARNING, five INFO, zero ERROR. There are no failed/skipped/empty-coverage/oversized entries in the runner summary. This does **not** mean all rules compiled or all files parsed: raw errors below override the summary's false partial flags. The output directory pattern `static_analysis_semgrep_3` is excluded from every scan; ignored dependency/build/private folders and scanner-default test exclusions are outside this coverage. Maximum target size is20,000,000bytes.

| Finding | Location at scan | Review |
| --- | --- | --- |
| WARNING generic-obfuscation-operators | src/main/main.ts:48,49 | Numeric geometry bounds checks and an explicit four-field rectangle copy. No concealed payload or executable decoding. False positives for malicious obfuscation; security checks are retained. |
| INFO generic-one-liners | src/main/main.ts:50 | BrowserWindow configuration with explicit security options. Readability notice. |
| INFO generic-one-liners | src/renderer/main.tsx:247,268 | Compaction-list JSX and clear-confirmation controls. Readability notices. |
| INFO generic-one-liners | scripts/measure-ingestion.mjs:124,172 | JSON benchmark result formatting. Readability notices. |

No rule was suppressed and no code was weakened to remove notices. These inspected findings do not establish malicious behavior.

## Actual coverage limits

- Community engine has no cross-file Pro taint analysis.
- Baseline/Trail of Bits/elttam outputs list65 files, including every current application source module and CLI. JavaScript language packs list16 files; their coverage must not be described as all TypeScript/tests. The malicious-code pack lists26 and akabe1/Swift list1 each. Per-pack raw paths are retained.
- Six raw outputs report partial renderer parsing at src/renderer/main.tsx:258 (`Settings & diagnostics` JSX text). TypeScript/Vite accept this source. The affected region is reviewed directly and by the rendered suite; static coverage is partial.
- elttam reports12 Java rule parse errors. This project has no Java application source, but those rules did not run.
- apiiro reports3 rule parse errors: Dart conditions, Java declarations, and JavaScript/TypeScript switch conditions. The last is relevant to this stack and limits that pack's obfuscation coverage.
- All15 exact failed rule IDs and parser details are recorded in coverage-errors.json and raw results. Runner exit0/partial:false must not conceal them.

Merged SARIF was parsed and counted successfully. Exact third-party Git revisions were saved before deleting only the temporary rule clones. Rulesets, raw JSON/SARIF, scans.json, coverage errors and merged results remain local in ignored static_analysis_semgrep_3. No raw scan material is published. This is one security input, not a complete security or production-readiness qualification.
