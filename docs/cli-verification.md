# CLI verification
Author: Ethan
Date: 2026-10-22

Ethan requested routine checks without rapid app launches or dialogs. `npm test` now builds and tests the Node CLI. No Electron process is started by that command. The CLI shares the HUD's actual ingestion, projection and SQLite code, but selects no implicit source and uses an independent cache.

Verified on local Node v22.13.1:
- `npm test`: seven subprocess integration checks passed (716 ms test duration).
- Known JSONL usage gives input1200/output300/cached500 and context25%, with source bytes and modification time preserved.
- Default temporary cache is removed; inherited HUD environment paths are not used.
- Persistent replay does not double count; the HUD cache sentinel remains intact; CLI database permissions are0600.
- Malformed records return sanitized diagnostics; partial records become complete on the next run.
- Missing sources return status2. Corrupt caches return status1 through stderr and remain intact.
- Help/invalid arguments do not scan implicit sources.
- `npm run cli -- --help` and the full `npm run build` passed. `git diff --check` passed.

The initial CLI-only check did not launch the UI, package, install, publish or call a model. Later candidate qualification is recorded in production-readiness.md. Computer use found no open error dialog; process inspection found only the normal installed app and its helpers. CLI results alone do not qualify UI behavior; the later hidden packaged suite supplies that evidence.

Plain source/Markdown files do not support portable personal-author metadata. Their author comments are Ethan; package author remains Ethan.
