# Recognize and name a session

Author: Ethan

## Sub-features

Opt-in project-folder hints, user aliases, search, duplicate labels and stable IDs.

## How to get to it (user POV)

Settings > Show project folder labels. Switch session chooses a source. Details exposes the local-name editor.

## Driving it with Playwright and the Node CLI

tests/usability.spec.ts drives Local session name and Save name, verifies session-id remains unchanged, searches Work Mac, then restarts. Service tests verify basename-only storage, off-default behavior, disable deletion and source immutability. UI assertions exercise opt-in, disable, restart, and absence of labels after opt-out. A backend regression withholds hints while a conflicting source is unreadable.

## Gotchas

Project labels are untrusted hints, not verified chat titles or identities. Never read prompt/message text for names. Equal aliases or folder names must not merge sessions. Prototype-like IDs must remain own keys.
