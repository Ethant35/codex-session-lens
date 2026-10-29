#!/usr/bin/env node
// Author: Ethan
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Store } from '../main/store';
import { Ingestor } from '../main/ingestion';
import { LensService } from '../main/service';

const help = `Session Lens CLI — no Electron, windows, Dock icon, or app dialogs.

Usage: lens scan --source DIRECTORY [--source DIRECTORY ...] [--cache DIRECTORY]
       lens checkpoint --cache DIRECTORY --session ID [--name NAME | --select ID | --delete ID]
       lens --help

Reads local JSONL sources once and prints normalized sessions and diagnostics as JSON.
Sources are read-only. No source directory is selected automatically.
The default cache is temporary and removed on exit. --cache retains a separate
lens-cli.sqlite database for replay/restart checks; it never opens the HUD cache.
Checkpoints use that separate CLI cache. Run scan with --cache first. With no
action flag, checkpoint lists saved points and observed changes for the session.
--name saves the latest scanned totals; it does not scan or call a model.
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
      session: { type: 'string' }, name: { type: 'string' },
      select: { type: 'string' }, delete: { type: 'string' },
    } });
    if (options.values.help) { process.stdout.write(help); return; }
    const command = options.positionals[0], v = options.values;
    if (options.positionals.length !== 1 || !['scan','checkpoint'].includes(command) ||
        (v.cache !== undefined && !v.cache.trim())) throw new Error('Invalid arguments');
    if (command === 'scan' && (!v.source?.length || v.source.some(s => !s.trim()) ||
        [v.session,v.name,v.select,v.delete].some(x => x !== undefined))) throw new Error('Invalid scan arguments');
    if (command === 'checkpoint' && (!v.cache || !v.session || v.source !== undefined ||
        [v.name,v.select,v.delete].filter(x => x !== undefined).length > 1)) throw new Error('Invalid checkpoint arguments');
  } catch {
    process.stderr.write('Use lens scan or lens checkpoint. See --help.\n');
    process.exitCode = 2;
    return;
  }

  let temporary: string | undefined;
  let store: Store | undefined;
  let ingestor: Ingestor | undefined;
  let service: LensService | undefined;
  let interrupted = 0;
  const interrupt = () => { interrupted = 130; ingestor?.stop(); };
  const terminate = () => { interrupted = 143; ingestor?.stop(); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const directory = options.values.cache ? resolve(options.values.cache) :
      (temporary = await mkdtemp(join(tmpdir(), 'session-lens-cli-')));
    store = new Store(join(directory, 'lens-cli.sqlite'));
    if (options.positionals[0] === 'checkpoint') {
      if (interrupted) return;
      service = new LensService(store, []);
      await service.select(options.values.session!);
      const v = options.values;
      if (v.name !== undefined) await service.checkpoint('create',v.session,v.name);
      if (v.select !== undefined) await service.checkpoint('select',v.session,v.select);
      if (v.delete !== undefined) await service.checkpoint('delete',v.session,v.delete);
      if (!interrupted) process.stdout.write(JSON.stringify({ checkpoints: service.snapshot().checkpoints },null,2)+'\n');
      return;
    }
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
    try { if (service) await service.close(); else store?.close(); }
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
