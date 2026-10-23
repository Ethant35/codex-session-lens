// Author: Ethan
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('.');
const output = resolve('.local/core-tests');
const source = resolve('tests/core');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = (await readdir(source)).filter(name => name.endsWith('.test.ts')).sort();
if (!files.length) throw new Error(`No core tests found in ${source}`);

for (const file of files) {
  await build({
    absWorkingDir: root,
    entryPoints: [resolve(source, file)],
    outfile: resolve(output, file.replace(/\.ts$/, '.cjs')),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    packages: 'external',
    sourcemap: 'inline',
  });
}

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(file => resolve(output, file.replace(/\.ts$/, '.cjs')))], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
