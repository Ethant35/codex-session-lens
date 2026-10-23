# Session Lens project rules
Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.
Preserve hidden tests, disabled GitHub Actions, read-only sources and local privacy. Do not open visible test windows without Ethan's explicit request. Use HANDOFF.md and docs/production-readiness.md for current evidence and blockers.
Use `npm test` for routine parser/storage checks. It runs the Node CLI without Electron. Only run the separate hidden E2E suite when a UI or Electron change requires it. Never make Ethan dismiss test dialogs; clean up test-owned processes and dialogs yourself. Do not close his normal app as test cleanup.
