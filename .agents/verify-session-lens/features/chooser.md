# Native chooser and cancellation

Author: Ethan

## Sub-features

Cancel, choose one or more folders, draft state, explicit Save.

## How to get to it (user POV)

Getting started or Settings > Choose folders….

## Driving it with Playwright and the Node CLI

tests/usability.spec.ts: click Choose folders… with Electron dialog result first null, then the temporary source path. Assert Cancel leaves preferences unchanged, selection alone does not save, and Save folder and scan persists the exact folders.

## Gotchas

The automated boundary is mocked to avoid native dialogs on Ethan’s desktop. Do not claim it proves macOS chooser navigation. Historical independent native evidence is distinct.
