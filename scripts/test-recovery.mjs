// Author: Ethan
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['tests/recovery.test.ts'], bundle: true, platform: 'node', format: 'cjs',
  outfile: '.local/recovery.test.cjs', packages: 'external', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', '.local/recovery.test.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
