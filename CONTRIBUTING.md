# Contributing
Author: Ethan

Use macOS on Apple Silicon, Node.js 22.12 or later, and npm. Clone this repository into its own directory. Run `npm ci`, `npm run build`, `npm run package:mac`, then `npm run test:e2e`. `npm run dev` builds and launches the local application. It does not use a remote development server or hot reload.

Tests are real-app E2E tests only. Add realistic temporary JSONL inputs, launch the packaged Electron application, and assert visible values. Do not add unit tests, component tests, API mocks, or private conversation fixtures. The package must exist before the tests run. `LENS_EXECUTABLE` can point to an installed copy of the app executable. `npm run test:e2e:real` requires a signed-in local Codex CLI and a running installed Codex desktop; it performs one small real model turn using the normal Codex account. It does not use an API key or alter Codex config.

Keep accounting conservative. Unknown is preferable to a fabricated exact number. Changes to parsers must explain observed source fields, replay behavior and accounting provenance. Keep source files read-only. Do not log raw malformed records, prompts, paths containing private data, credentials, or response text.

GitHub Actions are intentionally disabled for this repository at the maintainer's request. Do not add or dispatch workflows. Run acceptance locally and record reproducible sanitized evidence. Use feature branches and pull requests; never force-push. Preserve the MIT license. Author artifacts as Ethan where identity metadata is supported, without altering factual tool provenance.

For the v1 upgrade gate, retain a v1.0.0 packaged executable and run `LENS_BASELINE_EXECUTABLE="/absolute/path/to/v1/Codex Session Lens" npx playwright test tests/migration.spec.ts`. The baseline app itself creates the old database; the current package must recover suppressed records and preserve removed-source history and preferences. This extra gate is separate from the deterministic suite so ordinary contributors do not need an old release to run that suite. Never skip it when changing migration behavior.
