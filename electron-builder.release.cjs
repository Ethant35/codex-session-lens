// Author: Ethan. Produces a signed candidate; notarization remains a separate release gate.
const base = require('./package.json').build;
const { join } = require('node:path');
const { tmpdir } = require('node:os');
module.exports = {
  ...base,
  extends: null,
  forceCodeSigning: true,
  // File-provider metadata in Documents can invalidate code signing of app bundles.
  // Stage native bundles outside synced folders; ZIP/DMG files can be copied afterward.
  directories: { output: join(tmpdir(), 'codex-session-lens-release') },
  mac: {
    ...base.mac,
    identity: 'Ethan Tarnarider (Z2SL92S4B6)',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.release.plist',
    entitlementsInherit: 'build/entitlements.release.plist',
    notarize: false,
  },
};
