// Author: Ethan
// Explicitly invoke only the reviewed Electron installer; npm lifecycle scripts remain blocked.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manifest = require('electron/package.json');
const installer = require.resolve('electron/install.js');
const digest = createHash('sha256').update(readFileSync(installer)).digest('hex');
if (manifest.version !== '45.0.0' || digest !== '3b9e0c3c9070edbdb732dc05ed23c6f1c6b7a404bd623033a2f0b71052534e93') {
  throw new Error('Electron installer changed. Review its exact source and update the approved version/hash before running it.');
}
const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
