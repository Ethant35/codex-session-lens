# Folder setup and sample

Author: Ethan

## Sub-features

Fresh setup, Skip setup, synthetic first result, explicit absolute folder path, returning to real sessions.

## How to get to it (user POV)

Open a fresh isolated instance. Use Use synthetic sample or Enter paths manually. Settings > Show setup returns to onboarding.

## Driving it with Playwright and the Node CLI

tests/onboarding-accessibility.spec.ts: use the Getting started region, Use synthetic sample, Use my sessions, Session directories and Save folder and scan controls. Verify sample-session is plainly synthetic, real folders are unchanged by Skip, and invalid paths remain editable.

## Gotchas

Synthetic data must never enter real totals. Source directory fixtures belong to the test. A missing folder must produce a diagnosis and a usable correction path.
