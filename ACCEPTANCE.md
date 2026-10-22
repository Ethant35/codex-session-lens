# Local acceptance
Author: Ethan
Date: 2026-10-22, America/Los_Angeles
Status: IN PROGRESS. NOT DONE. No release has been accepted yet.

GitHub Actions and CI are intentionally omitted per Ethan. Repository Actions were disabled and verified before any push; zero workflows existed. All applicable gates run locally.

## Environment and methods
Apple Silicon macOS, Node22.13.1/npm10.9.2, Electron45.0.0, React19.3.1; versions are pinned by package-lock.json. Codex CLI0.163.0; installed desktop26.1016.61520. Runtime process architecture is asserted arm64. The app is packaged with no distribution signing or notarization. Tests launch the actual packaged executable via Playwright Electron support and assert rendered values. Synthetic JSONL inputs are temporary input files, not mock responses. The real test creates one actual Codex session through the native CLI using the signed-in account, then ingests its actual rollout. No API key or config change is used.

## Commands and checkpoints
- 11:50 PDT: gh auth verified, exact origin verified; repository-only Actions permissions set enabled=false, confirmed no workflows.
- 11:54 PDT: npm run build passed TypeScript and renderer/main builds.
- 11:55 PDT: actual CLI smoke returned input15828/output10/cached7168; this was a source check, not the completed SL11 UI gate.
- 11:58 PDT: npm run package:mac created an unsigned arm64 DMG/ZIP.
- 12:02 PDT: first deterministic attempt 9 passed/3 failed. A bad context fixture assertion, asynchronous checkbox assertion and real shutdown-order bug were found. The real test runner also failed because its stdin was left open; SL12 manual fallback passed. These failures were not counted as acceptance.
- 12:05 PDT: targeted privacy check passed all assertions and clean shutdown. Test cleanup and selector timing were repaired. Full suite rerun in progress.

## Required gates
SL01–10: pending final clean run.
SL11: pending final real UI run.
SL12: manual selector passed; automatic switching explicitly unsupported. Accessibility permission was absent, and no supported foreground API was established. See ARCHITECTURE.md.
SL13: packaged executable passed preliminary run; installed DMG verification pending.
SL14: local network observation passed; final full run pending.
Clean checkout install/build: pending.
Merge/tag/release: pending all gates.

## Security evidence
npm audit --omit=dev: zero production dependency vulnerabilities. Development-only electron-builder dependency tree has eight moderate findings propagated from sprintf-js (GHSA-hp3w-g68c-fv3c); the latest published sprintf-js1.1.3 is affected. No vulnerable package is shipped as an app runtime dependency. This remains a disclosed build-tool limitation, not a claim of a clean all-dependency audit.
Privacy testing captures Chromium NetLog during ingestion and rejects TCP/UDP connect, transmitted socket bytes, HTTP request send and QUIC packet send events. It observes renderer requests and probes CSP denial. This establishes behavior in the tested local scenario, not a guarantee about all OS traffic or future dependencies. Chromium automation uses local debugger sockets; they do not upload session telemetry.

## Reproduce
npm ci
npm run build
npm run package:mac
npm run test:e2e
LENS_TEST_REPORT=.local/real-report.json npm run test:e2e:real

Reports are local under .local, ignored by Git. Only sanitized summaries, synthetic screenshots and metric counts may be published. Never upload real conversation rollouts, traces containing private data, credentials or raw network logs.
