#!/usr/bin/env node
// Author: Ethan
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from '../main/store';
import { Ingestor } from '../main/ingestion';

const help = `Session Lens CLI — no Electron, windows, Dock icon, or app dialogs.

Usage: lens scan --source DIRECTORY [--source DIRECTORY ...] [--cache DIRECTORY]
       lens --help

Reads local JSONL sources once and prints normalized sessions and diagnostics as JSON.
Sources are read-only. No source directory is selected automatically.
The default cache is temporary and removed on exit. --cache retains a separate
lens-cli.sqlite database for replay/restart checks; it never opens the HUD cache.
Exit codes: 0 clean scan, 1 operation failed, 2 invalid arguments or scan diagnostics,
130 interrupted, 143 terminated. No network access or model calls.
`;

async function main() {
  let options;
  try {
    options = parseArgs({ allowPositionals: true, options: {
      help: { type: 'boolean', short: 'h' },
      source: { type: 'string', multiple: true },
      cache: { type: 'string' },
    } });
    if (options.values.help) { process.stdout.write(help); return; }
    if (options.positionals.length !== 1 || options.positionals[0] !== 'scan' ||
        !options.values.source?.length || options.values.source.some(s => !s.trim()) ||
        (options.values.cache !== undefined && !options.values.cache.trim())) throw new Error('Invalid arguments');
  } catch {
    process.stderr.write('Use: lens scan --source DIRECTORY [--cache DIRECTORY]. See --help.\n');
    process.exitCode = 2;
    return;
  }

  let temporary: string | undefined;
  let store: Store | undefined;
  let ingestor: Ingestor | undefined;
  let interrupted = 0;
  const interrupt = () => { interrupted = 130; ingestor?.stop(); };
  const terminate = () => { interrupted = 143; ingestor?.stop(); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const directory = options.values.cache ? resolve(options.values.cache) :
      (temporary = await mkdtemp(join(tmpdir(), 'session-lens-cli-')));
    store = new Store(join(directory, 'lens-cli.sqlite'));
    ingestor = new Ingestor(store);
    if (interrupted) ingestor.stop();
    await ingestor.scan(options.values.source!.map(s => resolve(s)));
    if (!interrupted) {
      process.stdout.write(JSON.stringify({
        sessions: [...ingestor.sessions.values()].sort((a, b) => a.id.localeCompare(b.id)),
        diagnostics: { errors: ingestor.errors.size, files: ingestor.files,
          lastScan: ingestor.lastScan, messages: [...new Set(ingestor.errors.values())] },
      }, null, 2) + '\n');
      process.exitCode = ingestor.errors.size ? 2 : 0;
    }
  } finally {
    ingestor?.stop();
    try { store?.close(); }
    finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      if (interrupted) process.exitCode = interrupted;
    }
  }
}

main().catch(() => {
  // Keep paths and source contents out of failure logs. Node never opens a dialog.
  process.stderr.write('Session Lens CLI: local operation failed. Check source/cache access and available disk space.\n');
  process.exitCode = 1;
});
