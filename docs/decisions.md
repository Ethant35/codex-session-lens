# Architecture decisions
Author: Ethan
Date: 2026-10-22

## ADR-001: Quiet verification and a shared application boundary
Status: accepted.

Repeated visible Electron launches disrupted the desktop and left exception dialogs. A pure Node CLI now shares ingestion, projection and SQLite code, with explicit sources and a separate cache. Routine tests run through Node. Packaged tests remain a separate hidden gate that checks visibility, focus and Dock state. Main-process unexpected failures use sanitized stderr/local diagnostics and nonzero exit in both modes. This preserves meaningful native qualification while keeping ordinary development quiet.

## ADR-002: Bounded scan transactions and incremental projection
Status: accepted after measured comparison.

The baseline50k-record scan retained the entire observation batch and stalled the event loop for765.61ms. Ingestion now stages128 observations at a time into one SQLite transaction. Projection streams ordered observations, reduces equal-time groups and yields every256 rows. Cancellation rolls back staged observations, deduplication state and projections together. A verified file handle ties metadata/anchor/content to one opened regular file; incomplete tails rewind instead of remaining in memory. SQLite cache budgets and file-backed temporary state limit database working memory. Session summaries and output histories still scale with actual output; this is not a universal fixed-memory guarantee. See core-readiness.md for independent equivalence, cancellation and load evidence.

## ADR-003: Explicit cache recovery with retained backups
Status: accepted.

An unavailable cache is not automatically corruption. Lock, disk and permission failures offer retry. Known corrupt data or invalid saved preferences permit an explicit retained backup and rebuild. The cache is retried before backup so stale UI state cannot replace a cache that has recovered. Cache/sidecar renames are local, source files remain read-only, and missing-source history survives only in the retained backup. Service writes commit before becoming visible and share a queue with scans; shutdown cancels ingestion before waiting for final bounds/close. Clear uses SQLite secure_delete in the same transaction; freed pages are reused rather than a separate post-commit VACUUM whose failure could misreport the committed operation.

## ADR-004: Local diagnostics and offline support
Status: accepted.

No analytics or upload service is introduced. A bounded local diagnostic file records fixed categories, counts, version and an opaque run identifier. Raw exceptions, paths, prompts, session identifiers and source records are excluded. The file is best effort and cannot itself trigger a fatal dialog. Users choose whether to share a report. Cloud service SLOs, authentication, DNS, canaries and web vitals do not apply to this offline single-user macOS utility. Packaged flows, event-loop response, exact telemetry and recovery evidence serve as release gates.

## ADR-005: Reproducible dependencies and separate release signing
Status: accepted; distribution gate pending.

The lockfile and npm ci fix the dependency graph. Repository .npmrc disables automatic lifecycle scripts. An explicit Electron installer checks its reviewed version/hash; runtime third-party notices ship unchanged. Development packaging remains unsigned and hidden-testable. A separate configuration requires Developer ID signing with hardened runtime and V8 JIT entitlement only. Notarization and stapling are separate explicit gates; a signed candidate is not a production-qualified release. No CI, hooks or global configuration changes are needed.
