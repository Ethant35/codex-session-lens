# Switch sessions without mixing totals

Author: Ethan

## Sub-features

Selection, recents, alias search, duplicate names, independent parent/child totals.

## How to get to it (user POV)

Switch session > select a named synthetic entry; repeat between two sessions.

## Driving it with Playwright and the Node CLI

tests/acceptance.spec.ts SL-04 selects bravo with 999 input then alpha with 111 input and 11 output. tests/usability.spec.ts uses constructor, __proto__ and toString with identical aliases, and checks identity/storage/restart in the renderer realm.

## Gotchas

Playwright object serialization can hide __proto__ keys; test own-key/value primitives inside the renderer rather than assuming transfer output is the app state. Do not combine child usage into parent totals.
