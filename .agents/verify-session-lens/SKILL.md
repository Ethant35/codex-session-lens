---
name: verify-session-lens
description: Verify Session Lens CLI and hidden macOS app journeys with synthetic data, retained evidence and owned-process cleanup. Invoke explicitly by this file path.
disable-model-invocation: true
---

# Verify Session Lens

Author: Ethan

Explicit invocation: read this file in the Session Lens repository. This unique directory is intentionally outside the shared `.agents/skills` symlink. Picker discovery is not claimed. Do not install it globally or copy it into another app.

## Choose the check

Read `AGENTS.md`, `CONSTRAINTS.md` and the current handoff. Use `npm test` for CLI/parser/storage work. Use the hidden app journey pass for UI, IPC, metadata or lifecycle changes. Read the [feature map](features/README.md) and select affected journeys; a full maintenance pass covers every mapped journey. A failed behavior is a product finding, not a reason to weaken the map.

The supported target is the local Apple Silicon macOS app. A development package is not a notarized release. These checks do not establish unfamiliar-user usability, manual VoiceOver qualification or publication readiness. Do not use private history or paid model services.

## Launch and doctor

Run commands from the repository root. Check installed tools first:

```sh
node --version
npm ls --depth=0
test -x node_modules/.bin/playwright
test -x node_modules/.bin/tsc
```

Stop on missing prerequisites. If restoring existing locked dependencies is within the task scope, use `npm ci --ignore-scripts --no-audit --no-fund`; do not change package versions or the lockfile. The reviewed Electron installer is `npm run prepare:electron`.

Build a separate local test package. These commands do not replace sealed `release/` artifacts or the user's installed app:

```sh
npm run build
npm run prepare:notices
CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --mac --dir --arm64 --publish never --config.directories.output=.local/verification-package
```

Use the exact test binary for the rest of this session:

```sh
export LENS_EXECUTABLE="$PWD/.local/verification-package/mac-arm64/Codex Session Lens.app/Contents/MacOS/Codex Session Lens"
export LENS_VISIBLE_TESTS=0
test -x "$LENS_EXECUTABLE"
shasum -a 256 '.local/verification-package/mac-arm64/Codex Session Lens.app/Contents/Resources/app.asar'
```

The doctor for each actual launch is `tests/helpers.ts::launchLens`: wait for the `CODEX SESSION LENS` element and `window.lens`, obtain a snapshot, then assert no visible, focused or focusable window and no Dock icon. It creates separate temporary source/data folders and passes `--background`. Never substitute the normal installed app or enable visible-test flags. If a drive fails, inspect its report and recheck this doctor before continuing.

## Drive and evidence

Keep a unique evidence directory per run. The commands below use one named run; change the directory for subsequent runs so earlier evidence survives.

```sh
mkdir -p .local/verification-2026-10-27
npm test > .local/verification-2026-10-27/node.log 2>&1
LENS_TEST_REPORT=.local/verification-2026-10-27/journeys.json ./node_modules/.bin/playwright test tests/acceptance.spec.ts tests/privacy.spec.ts tests/edge.spec.ts tests/order.spec.ts tests/onboarding-accessibility.spec.ts tests/lifecycle.spec.ts tests/operational-ui.spec.ts tests/usability.spec.ts --output=.local/verification-2026-10-27/artifacts
```

Run this single mapped feature first when proving the procedure itself:

```sh
LENS_TEST_REPORT=.local/verification-2026-10-27/first-proof.json ./node_modules/.bin/playwright test tests/usability.spec.ts --grep 'compact is the default' --output=.local/verification-2026-10-27/first-proof-artifacts
```

Existing screenshot helpers also write `.local/usability-screens` and `.local/readiness-screens`. Copy useful screenshots into the run evidence directory before another run can replace them. Record the package hash, command exit codes, test pass/failure counts and limits. View the compact screenshot; `toBeVisible` alone does not prove content fits the viewport. The compact tests must check element bounds against the client viewport.

The CLI reads only explicitly supplied sources and uses temporary cache storage by default. `tests/cli.test.mjs` checks source content/mtime, cleanup, replay and separation from the HUD cache. Backend service tests cover optional folder metadata and opt-out deletion. Use these observable side effects alongside the UI assertions.

For update coverage, use `tests/upgrade-current.spec.ts` only with a retained, hidden-capable prior executable identified by `LENS_BASELINE_EXECUTABLE`; set `LENS_BASELINE_VERSION` to its verified version (1.0.1 or 1.1.0). The current version assertion must match package.json. Do not run `tests/migration.spec.ts`, which requires visible historical-app behavior, as part of this quiet workflow. If no baseline binary exists, record update verification as unavailable rather than recycling earlier results as a new pass.

Native chooser automation mocks only Electron's dialog boundary. It proves cancellation and Save semantics, not interaction with the macOS chooser. Preserve that limitation in results.

## Cleanup and maintenance

Each test must execute `closeLens` in `finally`. The helper waits for the real shutdown listener, then stops only its owned debugger process and removes its temporary root. Fatal tests throw an uncaught error and assert the real exit code plus sanitized diagnostics. The measured signed-app shutdown deadline is 15 seconds. Native shutdown tests wait for the main process exit, separately from closure of inherited stdio, and check SQLite integrity. Cleanup releases a failed test's inspector without treating forced cleanup as a successful exit. Never kill by app name, close the user's normal app or delete evidence to clean up.

After the run, check for remaining processes whose command points to the exact test package. Stop only a process confirmed to belong to this run. Confirm the JSON report, logs and copied screenshots still exist after temporary data is gone. A pass with stranded test processes or missing evidence is incomplete.

Maintain the feature map by checking its source entry points and driving every listed journey. Record product defects separately from harness or documentation drift. Re-run changed procedures. Do not create CI workflows, hooks, schedules or releases from this skill.

Method references: pinned pstack [create-verification-skill](https://github.com/cursor/plugins/blob/9580c23696ac8d7abed0c166f2f9918800afb819/pstack/skills/create-verification-skill/SKILL.md), [maintain-verification-skill](https://github.com/cursor/plugins/blob/9580c23696ac8d7abed0c166f2f9918800afb819/pstack/skills/maintain-verification-skill/SKILL.md), and [blast-radius](https://github.com/cursor/plugins/blob/9580c23696ac8d7abed0c166f2f9918800afb819/pstack/skills/blast-radius/SKILL.md). This is a local procedure, not an installation or activation of the upstream suite.
