import { build } from 'esbuild';
await build({entryPoints:['src/main/main.ts','src/main/preload.ts'],bundle:true,platform:'node',format:'cjs',outdir:'dist/main',outExtension:{'.js':'.cjs'},external:['electron','node:sqlite'],target:'node24'});
