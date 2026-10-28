# Returning use, update and shutdown

Author: Ethan

## Sub-features

Selection/aliases, theme/compact/topmost, window bounds, retained source history, graceful close and fatal recovery.

## How to get to it (user POV)

Change settings in the isolated instance, close it, then reopen the same test data. For update tests, switch only the isolated executable against that data.

## Driving it with Playwright and the Node CLI

tests/acceptance.spec.ts SL-09 saves 520x700 bounds and checks settings, selection and totals after restart with source files removed. tests/lifecycle.spec.ts checks sanitized fatal exit and real SIGTERM with SQLite integrity. tests/upgrade-current.spec.ts requires LENS_BASELINE_EXECUTABLE pointing to a hidden-capable prior binary, with LENS_BASELINE_VERSION set to the verified version. The separate tests/install-current.spec.ts copies a signed bundle into a disposable Applications folder and checks reinstall persistence, data removal, fresh setup and source immutability.

## Gotchas

A restart is not an upgrade. Record missing prior executables as a coverage gap. Do not run the visible-only historical migration test. closeLens must stop only owned processes; reports/screenshots live outside temporary roots.
