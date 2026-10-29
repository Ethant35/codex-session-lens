# Production-readiness constraints
Author: Ethan
Baseline: v1.0.1 / 399d77dcc83da42baaa87b70b90a6e14088af939

## Product and security boundary
A local, single-user, offline macOS companion for users who have readable Codex JSONL session files. The production qualification target is Apple Silicon on the locally tested macOS version. Other operating systems and compressed/remote-only rollouts are unsupported until qualified. No hosted service, accounts, API keys, analytics, automatic uploads or Accessibility access. Source files are read-only and untrusted. SQLite is a local cache, not an authoritative source or an encrypted vault.

## Release gates
- Zero known unresolved correctness, privacy or recovery defects in supported workflows. Unsupported/ambiguous source data must be explicit, never fabricated.
- Preserve cumulative-snapshot accounting, cached-input subset, session isolation, replay/order/restart invariance, and conservative context labeling. Property tests must use independent invariants and positive controls.
- Zero type errors (`npm run build`). No suppressed checker findings, skipped tests, weakened assertions or incomplete stubs to obtain a pass. Compare against the baseline tag, including uncommitted and untracked work.
- Hidden packaged tests remain mandatory. No rapid visible test windows or dialogs. Old-version tests must use a non-disruptive method or preserve their exact historical evidence with clear limits.
- Local security scan requires the installed Semgrep skill's explicit plan approval. Community-engine limits and failed/skipped rulesets must be disclosed. No metrics, source upload, Pro install/login, cloud scan or CI.
- Accessibility: no critical/serious axe violations in supported rendered states; keyboard, focus, zoom, contrast and themes also need manual/programmatic checks. This external standard complements project tests.
- Performance: measure representative workloads before setting an evidence-based budget. Actual local source inventory is 138 JSONL files / 3051.3 MiB / largest604.2 MiB (counts only; no content published). Qualify bounded memory/work, responsive cancellation and sustained updates, rather than imposing web-vitals thresholds on a desktop app.
- Recoverable startup/storage errors, locking, interruption, version upgrades, backups and reset must have tested behavior. Never silently discard an existing cache or source data.
- Onboarding must reach a useful result from a fresh install, with skip/replay/returning-user and missing-source/error paths. Safe samples must be plainly synthetic and separate from real metrics.
- Production distribution requires signed/notarized packaged artifacts and installation/update/recovery documentation. A working Developer ID identity exists locally. Each new release requires its own accepted notarization submissions, tickets and downloaded-byte verification.
- No GitHub Actions, hooks, global changes or config.toml edits. Verify disabled Actions before pushes, PRs, tags and releases. Author personal metadata as Ethan.

## Verification placement
Fast: type/build and focused tests after relevant edits. Task: property/contract/recovery and hidden UI checks. Release: measured load/soak, security/dependency/license review, real rollout compatibility, fresh/upgrade packaged flows, accessibility and distribution verification. No arbitrary coverage quota. Record commands, environment, seeds, failures and evidence in docs/production-readiness.md.

## Exceptions
None. An externally blocked distribution requirement is not an exception or a pass.
