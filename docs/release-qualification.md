# Release qualification
Author: Ethan
Version: 1.1.0, Apple Silicon / macOS 27.2

## Reproduce the build
Use the pinned lockfile and tested Node22.13.1/npm10.9.2 tools. Run `npm ci`, `npm run prepare:electron`, `npm run prepare:notices`, `npm test` and `npm run build`. Dependency lifecycle scripts stay disabled. `npm run package:mac` creates unsigned development artifacts. Production packaging uses `npx --no-install electron-builder --config electron-builder.release.cjs --mac zip --arm64 --publish never`.

The release configuration requires Developer ID signing, hardened runtime and only the V8 JIT entitlement. Native bundles stage under the OS temporary codex-session-lens-release directory, outside synced Documents. File-provider FinderInfo metadata caused a prior signing failure in Documents; staging outside that folder resolved it. No signed bundle is edited after signing except supported ticket stapling.

## Apple qualification
The final app ZIP submission **95e7f254-ade1-48c9-94c1-52e56e1478f0** was Accepted. Its Apple log reports no issues. The app was stapled and validated before its distribution ZIP was recreated with ditto. The final DMG was built from that stapled app using electron-builder's prepackaged mode and `-c.dmg.sign=true`.

Final DMG submission **21ca9921-f378-41dd-af5c-a60130233632** was Accepted, with no issues in its log. The DMG was then stapled and validated. Gatekeeper accepts both the app and DMG as Notarized Developer ID. These are Session Lens submissions, not another app's approvals.

Credentials stay in the local Keychain. Use `xcrun notarytool submit <artifact> --keychain-profile <local-profile>` and retrieve that submission's own status/log. Never place passwords or private keys in source, reports or chat. [Apple's workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) explains why a ZIP must be recreated after stapling its app.

## Final artifact checks
The SHA256SUMS.txt release asset records hashes after app/DMG stapling. GitHub normalizes spaces in asset names to periods; checksum filenames match the actual downloaded names. The original pre-staple Apple-submission ZIP hash is deliberately different from the final ZIP hash.

Both uploaded draft assets were downloaded through GitHub and matched the final checksums. The DMG was marked with a quarantine attribute, assessed by Gatekeeper, mounted read-only without opening Finder, and copied into an isolated temporary Applications directory. The mount was ejected. That installed app retained its valid signature and stapled ticket and passed Gatekeeper with quarantine set. The downloaded ZIP was extracted separately; its app also retained its ticket and passed Gatekeeper.

Installed application tests are programmatic, hidden and use isolated synthetic data. They cover clean setup, first exact telemetry, folder-picker cancel/save, local names and restart, sample exit/replay, settings, errors, cache recovery, native signal shutdown and actual1.0.1 upgrade/rollback. Final counts and release/public-download state are in readiness-evidence.json and production-readiness.md. The normal installed app is never replaced by qualification.

Native dialog responses are mocked at Electron's dialog boundary so tests do not show dialogs. This verifies IPC/options/cancel/save behavior, not hands-on interaction with the macOS chooser. No unfamiliar-user study, manual VoiceOver listening, or human Finder drag-and-drop test is claimed. No Gatekeeper bypass is used.

## Provenance and rollback
The signed bundle declares version1.1.0 and Copyright2026 Ethan. MIT License. Package author is Ethan; runtime notices are retained. README screenshots contain only synthetic fixtures, with PNG Author metadata Ethan. ZIP/DMG archives do not expose a portable personal-author field; their identity is established by the signature and hashes.

50 Node tests and the clean frozen dependency build pass; all6 emitted files match byte-for-byte. The signed app passed40 hidden checks. Core accounting/load/real-source evidence from the preceding phase remains applicable because this phase does not change the parser, projection or store. Earlier unnotarized archives remain local historical evidence only.

Updates are manual: quit, replace the app and retain application data. A closed-cache backup supports rollback; prior1.0.1 forward/rollback/forward behavior is tested. Revoke or replace this release if a supported-flow correctness, privacy or recovery defect is confirmed. There is no automatic rollout service or background update connection.

GitHub Actions must remain disabled before every push, merge, tag or release. No workflow, hook, global setting or Codex configuration changes are part of this release.
