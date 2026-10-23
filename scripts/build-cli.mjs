// Author: Ethan
import { build } from 'esbuild';
await build({ entryPoints: ['src/cli/lens.ts'], bundle: true, platform: 'node',
  format: 'cjs', outfile: 'dist/cli/lens.cjs', target: 'node22', external: ['node:sqlite'] });
