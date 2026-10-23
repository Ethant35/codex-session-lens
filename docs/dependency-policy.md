# Dependency installation policy
Author: Ethan

Session Lens is an independent npm project. No parent package.json declares it as a workspace. package-lock.json is the sole dependency graph. The tested client is npm10.9.2 with Node22.13.1. Use `npm ci`; do not regenerate dependencies during verification.

Project .npmrc sets `ignore-scripts=true`. npm10 has no verified version-specific per-package approval facility, so all automatic dependency lifecycle scripts remain disabled. Explicit `npm run` commands still work. See [npm10 ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci/#ignore-scripts).

After installation run `npm run prepare:electron`. This explicitly runs the reviewed Electron45.0.0 installer only when its SHA256 matches the recorded source. The installer uses @electron/get, the package's pinned checksums and official release archives; it creates the local binary and path.txt. It does not launch the GUI. Review this script and its checksum again when upgrading Electron. Do not enable lifecycle scripts globally to repair an install.

Reviewed lifecycle packages in this graph: esbuild0.28.2 postinstall selects/checks a native binary; the optional platform package already supplies it, so its script remains disabled. electron-winstaller5.4.0 copies Windows7zip files; it is unnecessary for the supported macOS target and remains disabled. fsevents2.3.3 has a lockfile install marker but ships its native file; no build is enabled. Electron45.0.0 uses an explicit install-electron binary rather than an automatic postinstall. fast-check4.10.2 and axe-core4.14.0 have no dependency install lifecycle scripts.

Known-advisory audits query public package names/versions, not application source or session files. Run `npm audit` and `npm audit signatures` explicitly. A clean audit does not establish that all packages are benign. Never use a forced audit fix without reviewing the resulting dependency changes.

Verification on2026-10-22: clean `npm ci --ignore-scripts --no-audit` installed314 packages in an isolated directory. Explicit Electron preparation and esbuild transform succeeded. `npm audit` reported zero advisories at all severities. npm10 signature verification failed with EMISSINGSIGNATUREKEY for pkijs3.4.3; a separately installed npm11.18.0 auditor (scripts blocked, no global change) completed with empty invalid and missing signature lists. These are registry signature checks, not proof of package behavior.

Runtime React19.3.1, ReactDOM19.3.1, scheduler0.28.0 and Electron45.0.0 use MIT notices. `prepare:notices` retains their exact installed licenses and the official Electron distribution's Chromium/embedded-library notice file. Packaging includes them in Contents/Resources/licenses. Test-only axe-core4.14.0 is MPL-2.0 and fast-check4.10.2 is MIT; neither is shipped as runtime application code. Rebuild notices after a dependency change. Plain license text has no personal author field; upstream attribution is preserved. Prior dependency installation occurred before this policy was added; this policy is not retroactive proof of that installation.
