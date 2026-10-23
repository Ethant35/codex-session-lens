// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, linkSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiagnostics } from '../src/main/diagnostics';

function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'lens-diagnostics-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, path: join(root, 'diagnostics.json') };
}
test('local diagnostics retain bounded structured events without raw errors or paths', t => {
  const f = fixture(t), log = new LocalDiagnostics(f.path, 'desktop', '1.0.1');
  for (let i = 0; i < 200; i++) log.record(i % 2 ? 'cache_unavailable' : 'operation_failed', Object.assign(new Error('SECRET /private/user/file'), { errcode: 13 }));
  log.record('fatal', new Error('PROMPT_SENTINEL'));
  const raw = readFileSync(f.path, 'utf8'), events = JSON.parse(raw);
  assert.equal(events.length, 100);
  assert.equal(events.at(-1).event, 'fatal');
  assert.equal(events[0].category, 'disk_full');
  assert.match(events[0].runId, /^[a-f0-9-]{36}$/);
  assert.equal(events[0].entryPoint, 'desktop');
  assert.doesNotMatch(raw, /SECRET|private|PROMPT_SENTINEL|stack/);
  assert.ok(Buffer.byteLength(raw) < 65536);
  assert.equal(statSync(f.path).mode & 0o777, 0o600);
  const restarted = new LocalDiagnostics(f.path, 'desktop', '1.0.1');
  restarted.record('started');
  assert.equal(JSON.parse(readFileSync(f.path, 'utf8')).at(-2).event, 'fatal');
});
test('diagnostic persistence never follows links or throws during failure handling', t => {
  const f = fixture(t), target = join(f.root, 'keep');
  writeFileSync(target, 'PRIVATE_KEEP'); symlinkSync(target, f.path);
  assert.doesNotThrow(() => new LocalDiagnostics(f.path, 'desktop', '1.0.1').record('fatal'));
  assert.equal(readFileSync(target, 'utf8'), 'PRIVATE_KEEP');
  const hardlink = join(f.root, 'hardlink'); linkSync(target, hardlink);
  assert.doesNotThrow(() => new LocalDiagnostics(hardlink, 'desktop', '1.0.1').record('fatal'));
  assert.equal(readFileSync(target, 'utf8'), 'PRIVATE_KEEP');
  const directory = join(f.root, 'directory'); mkdirSync(directory);
  assert.doesNotThrow(() => new LocalDiagnostics(directory, 'desktop', '1.0.1').record('fatal'));
});
test('preexisting diagnostic data is allowlisted before retaining it', t => {
  const f = fixture(t);
  writeFileSync(f.path, JSON.stringify([{ event: 'fatal', secret: 'PRIVATE_KEEP', category: 'SECRET', runId: 'SECRET' }]));
  const log = new LocalDiagnostics(f.path, 'desktop', '1.0.1'); log.record('started');
  assert.doesNotMatch(readFileSync(f.path, 'utf8'), /SECRET|PRIVATE_KEEP/);
});
