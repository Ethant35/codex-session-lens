// Author: Ethan
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/diagnostics.test.ts'], bundle: true, platform: 'node', format: 'cjs',
  outfile: '.local/diagnostics.test.cjs', packages: 'external', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', '.local/diagnostics.test.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
