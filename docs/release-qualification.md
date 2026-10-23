# Release qualification
Author: Ethan
Candidate:1.1.0; not published

## Build and sign locally

Use the pinned lockfile, Node22.13.1/npm10.9.2 and an Apple Silicon Mac. Run `npm ci`, `npm run prepare:electron`, `npm run prepare:notices`, `npm test` and `npm run build`. Automatic dependency scripts remain disabled. `npm run package:mac` creates unsigned development artifacts. Production candidates use:

```sh
npx --no-install electron-builder --config electron-builder.release.cjs --mac dmg zip --arm64 --publish never
```

Native bundles stage in the OS temporary `codex-session-lens-release` directory, outside synced Documents folders. An initial signing attempt in Documents failed because FinderInfo metadata reappeared on a helper bundle. Apple documents this signing restriction in [QA1940](https://developer.apple.com/library/archive/qa/qa1940/_index.html). ZIP/DMG artifacts can be copied into the repository after signing. The release configuration requires Developer ID Application signing, hardened runtime and the V8 JIT entitlement. It does not grant unsigned executable memory, disable library validation, or embed credentials. Verify with `codesign --verify --deep --strict --verbose=2` and inspect `codesign -d --verbose=4 --entitlements :-`. Inspect all nested code, application version, license resources and runtime tests. Signing alone does not pass Gatekeeper or notarization.

## Notarization and credential boundary

The Developer ID Application certificate for Ethan Tarnarider is available. On2026-10-22, metadata-only checks found no saved notarytool profile in accessible user Keychains, no standard App Store Connect private-key file, and no relevant configured environment variables. This does not rule out credentials stored elsewhere. No secret was read into a report or requested in chat.

If a profile exists elsewhere, provide only its name. Otherwise create a Keychain profile through Apple's supported local `xcrun notarytool store-credentials` flow. Enter credentials locally; do not paste passwords or private keys into chat. After profile setup, submit the signed artifact with `xcrun notarytool submit <artifact> --keychain-profile <profile> --wait`. Record the submission ID/status; retrieve the log if rejected. Do not distribute a rejected or unsubmitted candidate.

Staple and validate the accepted DMG. For ZIP distribution, notarize/staple the app before recreating the ZIP. Verify the final app with `spctl --assess --type execute --verbose=4`; verify the DMG with `stapler validate`, mount read-only, copy to a temporary installation directory and run hidden installed qualification. Record final hashes after stapling, not before. Do not replace Ethan's normal running app during testing.

## Required release evidence

- Current Node/build, hidden packaged UI/privacy/accessibility/lifecycle tests.
- Actual previous1.0.1 cache upgrade/rollback and bounded live Codex compatibility.
- Independent accounting properties, cancellation, large-load and sustained-scan evidence.
- Current approved Semgrep with coverage limits and dependency signatures/advisories/licenses.
- Signed/notarized/stapled installation checks and exact final artifact hashes.
- Accurate operations, retention, backup/restore and troubleshooting documentation.
- Repository Actions disabled before any push, PR, tag or release; no workflow dispatch.

Notarization is currently an external gate. Remaining local gates are tracked in production-readiness.md. Neither a clean scan nor successful development package is a production-readiness claim.

## Current signed candidate evidence

DeveloperID signing succeeded after staging native bundles outside synced Documents. Deep/strict signature verification passed for the app and nested code. The main signature has hardened-runtime flags and only allow-jit entitlement. The signed app passed37 hidden packaged tests in48.5seconds. A copy from the read-only mounted DMG passed signature verification and5 installed tests, then all test processes/temp installation were removed and the DMG was ejected. The normal installed1.0.1 app was not replaced.

Final Node46/46 and clean-install46/46 passed. All6 emitted main/preload/renderer/CLI files matched byte-for-byte across the normal and clean dependency trees. Runtime notices are present in the signed app; version1.1.0 and copyright Ethan were read from saved Info.plist. Personal package author remains Ethan. Archives do not provide a portable personal-author field.

Signed, unnotarized ZIP/DMG candidates are retained under `.local/signed-candidate/`; hashes and sizes are in readiness-evidence.json. The failed earlier bundle is separately retained under `.local/signing-failed-synced-folder`. Ethan explicitly deferred notarization after no saved credential profile was found. No notarization submission, stapling, Gatekeeper approval or production release is claimed. Resume with an available Keychain profile name, then perform the remaining steps above.
