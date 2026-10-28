# Compact metrics and Details

Author: Ethan

## Sub-features

Selected name, context estimate or Unavailable, cumulative input/output, secondary details, themes and keyboard access.

## How to get to it (user POV)

Start in Compact display. Select a synthetic session; open Details only for secondary information.

## Driving it with Playwright and the Node CLI

tests/usability.spec.ts checks the priority element rectangles against the default client viewport at 460x650, and opens Details to reach session-id, cached totals, request values and provenance. tests/onboarding-accessibility.spec.ts covers keyboard, zoom, long names and contrast. Retain and inspect a screenshot.

## Gotchas

Visibility assertions alone do not prove no scrolling. Context is a last-request estimate; current occupancy is unavailable. Keep error/unknown labels readable. Narrow windows and enlarged text may scroll, but may not clip controls or content.
