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

## Usability phase refresh
The same explicitly approved11-pack Community1.182.1 plan ran again on the chooser/alias changes in static_analysis_semgrep_4, with two processes, metrics off, and no Pro/cloud/CI/autofix. All11 outputs merged successfully; no failed/skipped/covered-nothing/oversized entries. Eight inspected heuristics: two WARNING on the unchanged bounds checks, six INFO on readable long JSX/config/benchmark lines. No confirmed security defect in those findings; no suppressions added. Raw output still reports15 unsupported third-party rule-pattern errors and six partial renderer parses at the literal Settings ampersand, despite false partial flags in the runner summary. These are coverage limits, not passes. Rule revisions and raw coverage errors were saved before temporary clone cleanup. npm audit reports zero advisories for the current lockfile.

## 1.2.0 source refresh, October 27, 2026

The existing explicit approval was reused without expanding its seven official packs or four third-party repositories. Community 1.182.1 ran all severities, two scanner processes maximum, through the installed runner. Pro validation was unavailable; no login/install of Pro, metrics, uploads, autofix or CI. The missing scanner runtime was restored from the existing exact dependency lock into ignored `.local/semgrep`, without changing application dependencies or global settings. Output is `static_analysis_semgrep_5`.

All 11 outputs merged; failed, skipped, coveredNothing and oversized are empty. Eight inspected heuristics remain: two WARNING geometry/bounds expressions in main.ts and six INFO long statements in renderer/config/benchmark code. None shows an executable payload or a confirmed vulnerability. No suppression was added. Raw outputs still contain 12 Java rule-pattern errors, three apiiro rule-pattern errors (including the relevant JavaScript/TypeScript switch pattern), and six partial renderer parses around the literal Settings ampersand. The runner's partial:false does not override these raw errors.

Baseline/Trail of Bits/elttam opened 80 files; JavaScript packs 16; malicious-code pack 26; Swift and akabe1 one each. This does not mean each pack covers all TypeScript. Ignored build/dependency/private files and default test exclusions remain outside scope. Maximum target size is 20,000,000 bytes; the output folder pattern is excluded. Approved rulesets, raw JSON/SARIF, merged SARIF, rule revisions and coverage-errors.json are retained locally. Temporary rule clones were removed. The current dependency audit reports zero advisories. This dated scan is one security input, not a complete upstream dependency audit.
