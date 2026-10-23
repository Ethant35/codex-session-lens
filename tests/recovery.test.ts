// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CacheHost } from '../src/main/cache';

async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'lens-recovery-'));
  const path = join(root, 'telemetry.sqlite'), source = join(root, 'sources');
  await mkdir(source);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path, source };
}

test('corrupt cache stays intact until explicit backup/rebuild; fresh setup follows recovery', async t => {
  const f = await fixture(t);
  await writeFile(f.path, 'CORRUPT_PRIVATE_SENTINEL');
  const host = new CacheHost(f.path, [f.source]);
  try {
    assert.equal(host.snapshot().recovery?.canRebuild, true);
    assert.doesNotMatch(JSON.stringify(host.snapshot()), /CORRUPT_PRIVATE_SENTINEL/);
    assert.equal(await readFile(f.path, 'utf8'), 'CORRUPT_PRIVATE_SENTINEL');
    await assert.rejects(host.recover('invalid'));
    await host.recover('retry');
    assert.equal(await readFile(f.path, 'utf8'), 'CORRUPT_PRIVATE_SENTINEL');
    const result = await host.recover('rebuild');
    assert.equal(result.recovery, undefined);
    assert.equal(result.preferences.onboardingCompleted, false);
    const backup = (await readdir(f.root)).find(name => name.startsWith('cache-backup-'))!;
    assert.ok(backup);
    assert.equal(await readFile(join(f.root, backup, 'telemetry.sqlite'), 'utf8'), 'CORRUPT_PRIVATE_SENTINEL');
    assert.deepEqual(await readdir(f.source), []);
  } finally { await host.close(); }
});

test('a locked cache offers retry, never destructive rebuild, and recovers after unlock', async t => {
  const f = await fixture(t), first = new CacheHost(f.path, [f.source]);
  await first.preferences({ onboardingCompleted: true, theme: 'dark' });
  await first.close();
  const lock = new DatabaseSync(f.path);
  lock.exec('BEGIN EXCLUSIVE');
  const host = new CacheHost(f.path, [f.source]);
  try {
    assert.equal(host.snapshot().recovery?.canRebuild, false);
    await assert.rejects(host.recover('rebuild'));
    assert.equal((await readdir(f.root)).filter(n => n.startsWith('cache-backup-')).length, 0);
    lock.exec('ROLLBACK'); lock.close();
    assert.equal((await host.recover('retry')).preferences.theme, 'dark');
    assert.equal(host.snapshot().recovery, undefined);
  } finally { if (lock.isOpen) lock.close(); await host.close(); }
});

test('symlink cache is refused without modifying the target or offering rebuild', async t => {
  const f = await fixture(t), target = join(f.root, 'private-target');
  await writeFile(target, 'do not change'); await symlink(target, f.path);
  const host = new CacheHost(f.path, [f.source]);
  try {
    assert.equal(host.snapshot().recovery?.canRebuild, false);
    await assert.rejects(host.recover('rebuild'));
    assert.equal(await readFile(target, 'utf8'), 'do not change');
  } finally { await host.close(); }
});

test('invalid saved preferences recover through explicit backup with original database retained', async t => {
  const f = await fixture(t), first = new CacheHost(f.path, [f.source]);
  await first.close();
  const db = new DatabaseSync(f.path);
  db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('preferences', '{broken'); db.close();
  const host = new CacheHost(f.path, [f.source]);
  try {
    assert.equal(host.snapshot().recovery?.canRebuild, true);
    await host.recover('rebuild');
    assert.equal(host.snapshot().recovery, undefined);
    assert.equal((await readdir(f.root)).filter(n => n.startsWith('cache-backup-')).length, 1);
  } finally { await host.close(); }
});

test('shutdown cancels queued recovery without moving the failed cache', async t => {
  const f = await fixture(t);
  await writeFile(f.path, 'PRIVATE_CORRUPT_BYTES');
  const host = new CacheHost(f.path, [f.source]);
  const pending = host.recover('rebuild');
  const rejected = assert.rejects(pending, /closing/);
  await Promise.all([host.close(), host.close(), rejected]);
  assert.equal(await readFile(f.path, 'utf8'), 'PRIVATE_CORRUPT_BYTES');
  assert.equal((await readdir(f.root)).filter(n => n.startsWith('cache-backup-')).length, 0);
});

test('actual denied folder access offers retry and preserves settings after permissions return', async t => {
  const f = await fixture(t);
  const directory = join(f.root, 'restricted');
  await mkdir(directory);
  const path = join(directory, 'telemetry.sqlite');
  const first = new CacheHost(path, [f.source]);
  await first.preferences({ theme: 'dark', onboardingCompleted: true });
  await first.close();
  const before = await readFile(path);
  await chmod(directory, 0o000);
  let host: CacheHost | undefined;
  try {
    // Positive control: the filesystem itself must deny this user, not a mock.
    await assert.rejects(readFile(path), { code: 'EACCES' });
    host = new CacheHost(path, [f.source]);
    assert.equal(host.snapshot().recovery?.canRebuild, false);
    await assert.rejects(host.recover('rebuild'));
    await chmod(directory, 0o700);
    assert.deepEqual(await readFile(path), before);
    const recovered = await host.recover('retry');
    assert.equal(recovered.recovery, undefined);
    assert.equal(recovered.preferences.theme, 'dark');
    assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('cache-backup-')), []);
  } finally { await chmod(directory, 0o700); await host?.close(); }
});
