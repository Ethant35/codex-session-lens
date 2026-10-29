// Author: Ethan
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import fc from 'fast-check';
import { Ingestor } from '../../src/main/ingestion';
import { Store } from '../../src/main/store';

const stamp = (second: number) => `2026-10-22T10:00:${String(second).padStart(2, '0')}.000Z`;
const record = (type: string, payload: unknown, second = 0) => JSON.stringify({ timestamp: stamp(second), type, payload });
const count = (id: string, input: number, second: number, extra: Record<string, unknown> = {}) => record('event_msg', {
  type: 'token_count', thread_id: id,
  info: {
    total_token_usage: { input_tokens: input, output_tokens: 20, cached_input_tokens: 5 },
    last_token_usage: { input_tokens: input, output_tokens: 20, cached_input_tokens: 5, total_tokens: input + 20 },
    ...extra,
  },
}, second);
const session = (id: string, rows: string[]) => [record('session_meta', { id }), ...rows].join('\n') + '\n';

test('current paired usage formats preserve a matching context estimate without adding totals twice', async t => {
  const f=await fixture(t),path=join(f.source,'paired.jsonl'),store=new Store(f.db);t.after(()=>store.close());
  const detail=(second:number,input=100)=>record('token_usage_record',{
    thread_id:'paired',thread_token_usage:{input_tokens:input,output_tokens:20,cached_input_tokens:5,cache_write_input_tokens:7},
    usage:{input_tokens:input,output_tokens:20,cached_input_tokens:5,total_tokens:input+20,cache_write_input_tokens:7},
  },second);
  await writeFile(path,session('paired',[detail(1),count('paired',100,1,{model_context_window:1000})]));
  const ingestor=new Ingestor(store);await ingestor.scan([f.source]);
  assert.deepEqual(ingestor.sessions.get('paired')?.total,{input:100,output:20,cached:5});
  assert.equal(ingestor.sessions.get('paired')?.context?.percent,12);
  assert.equal(ingestor.sessions.get('paired')?.sources?.latest?.event,'token_count');
  await ingestor.scan([f.source]);assert.equal(ingestor.sessions.get('paired')?.total?.input,100);
  await appendFile(path,detail(2,200)+'\n');await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('paired')?.context,null,'a newer usage record without a window cannot reuse old context');
  await appendFile(path,count('paired',201,2,{model_context_window:1000})+'\n');await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('paired')?.context,null,'disagreeing paired usage remains unavailable');
  assert.equal(ingestor.sessions.get('paired')?.total,null);
});

async function fixture(t: { after(fn: () => void): void }) {
  const root = await mkdtemp(join(tmpdir(), 'lens-core-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), db = join(root, 'data', 'telemetry.sqlite');
  await mkdir(source);
  return { root, source, db };
}

test('incomplete UTF-8 JSONL record survives chunk boundaries and is ingested after append', async t => {
  const f = await fixture(t), path = join(f.source, 'session.jsonl'), store = new Store(f.db);
  t.after(() => store.close());
  const complete = session('utf8-session', [count('utf8-session', 40, 1).replace('"type":"token_count"', '"type":"token_count","note":"café"')]);
  const buffer = Buffer.from(complete);
  const split = buffer.indexOf(Buffer.from('é')) + 1;
  await writeFile(path, buffer.subarray(0, split));
  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('utf8-session')?.total, null);
  const cursor = (ingestor as any).cursors.get(path);
  assert.equal(cursor.tail, '', 'incomplete source text is rewound instead of retained in memory');
  assert.equal(cursor.offset, Buffer.byteLength(record('session_meta', { id: 'utf8-session' }) + '\n'));
  assert.ok([...ingestor.errors.values()].some(message => message.includes('Incomplete trailing')));
  await appendFile(path, buffer.subarray(split));
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('utf8-session')?.total?.input, 40);
  assert.equal([...ingestor.errors.values()].some(message => message.includes('Incomplete trailing')), false);
});

test('mixed file identities remain blocked while a separate valid file is ingested', async t => {
  const f = await fixture(t), store = new Store(f.db);
  t.after(() => store.close());
  const conflicting = [
    record('session_meta', { id: 'first-session' }),
    record('session_meta', { id: 'second-session' }),
    record('session_meta', { id: 'second-session' }),
    count('second-session', 999, 4),
  ].join('\n') + '\n';
  await writeFile(join(f.source, 'a-conflict.jsonl'), conflicting);
  await writeFile(join(f.source, 'b-valid.jsonl'), session('valid-session', [count('valid-session', 42, 5)]));
  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.has('second-session'), false);
  assert.equal(ingestor.sessions.get('valid-session')?.total?.input, 42);
  assert.ok([...ingestor.errors.values()].some(message => message.includes('Conflicting session identities')));
});

test('forked subagent history ignores inherited parent rows and projects only child evidence', async t => {
  const f = await fixture(t), path = join(f.source, 'forked-child.jsonl');
  let store = new Store(f.db);
  t.after(() => store.close());
  const ordinalRecord = (ordinal: number, raw: string) => JSON.stringify({ ...JSON.parse(raw), ordinal });
  const childMeta = record('session_meta', {
    id: 'fork-child', forked_from_id: 'fork-parent', parent_thread_id: 'fork-parent',
    subagent_history_start_ordinal: 4, history_mode: 'paginated', multi_agent_version: 'v2',
    source: { subagent: { thread_spawn: { parent_thread_id: 'fork-parent' } } },
  }, 0);
  const parentMeta = record('session_meta', { id: 'fork-parent' }, 1);
  const parentUsage = count('fork-parent', 7000, 2);
  const parentStatus = record('event_msg', { type: 'task_complete', thread_id: 'fork-parent' }, 3);
  const missingOrdinalChildUsage = count('fork-child', 9000, 3);
  const childUsage = count('fork-child', 44, 4);
  const childStatus = record('event_msg', { type: 'task_started', thread_id: 'fork-child' }, 5);
  await writeFile(path, [
    ordinalRecord(0, childMeta), ordinalRecord(1, parentMeta),
    ordinalRecord(2, parentUsage), ordinalRecord(3, parentStatus), missingOrdinalChildUsage,
    ordinalRecord(4, childUsage), ordinalRecord(5, childStatus),
  ].join('\n') + '\n');

  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  const child = ingestor.sessions.get('fork-child');
  assert.equal(child?.total?.input, 44);
  assert.equal(child?.latest?.input, 44);
  assert.equal(child?.parentId, 'fork-parent');
  assert.equal(child?.status, 'Running', 'inherited completion status must not overwrite child status');
  assert.equal(ingestor.sessions.has('fork-parent'), false, 'inherited parent metadata and usage do not create a child-local parent session');
  assert.equal(store.sessions().length, 1);
  assert.ok([...ingestor.errors.values()].includes('Forked subagent record has a missing or invalid ordinal; skipped.'));

  store.close();
  store = new Store(f.db);
  const restarted = new Ingestor(store);
  await restarted.scan([f.source]);
  assert.equal(restarted.sessions.get('fork-child')?.total?.input, 44);
  assert.equal(restarted.sessions.get('fork-child')?.status, 'Running');
  assert.equal(restarted.sessions.has('fork-parent'), false);
  assert.equal(store.sessions().length, 1, 'restart replay must be idempotent');
});

test('source reader refuses symlinks and opens FIFOs without blocking', async t => {
  const f = await fixture(t), store = new Store(f.db);
  t.after(() => store.close());
  const target = join(f.root, 'outside.jsonl'), link = join(f.source, 'linked.jsonl'), fifo = join(f.source, 'pipe.jsonl');
  const content = session('outside-session', [count('outside-session', 7, 1)]);
  await writeFile(target, content);
  await symlink(target, link);
  execFileSync('mkfifo', [fifo]);
  const ingestor = new Ingestor(store);
  const started = Date.now();
  await assert.rejects((ingestor as any).read(link));
  await assert.rejects((ingestor as any).read(fifo), /regular file/);
  assert.ok(Date.now() - started < 1000, 'nonblocking open rejects a FIFO promptly');
  assert.equal(await readFile(target, 'utf8'), content);
  assert.equal(store.sessions().length, 0);
});

test('oversized complete record is diagnosed and the next valid session is still ingested', async t => {
  const f = await fixture(t), path = join(f.source, 'oversized.jsonl'), store = new Store(f.db);
  t.after(() => store.close());
  const oversized = `{"type":"ignored","payload":"${'x'.repeat(8 * 1024 * 1024)}"}`;
  await writeFile(path, `${oversized}\n${session('after-large-line', [count('after-large-line', 77, 1)])}`);
  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.has('after-large-line'), true);
  assert.equal(ingestor.sessions.get('after-large-line')?.total?.input, 77);
  assert.ok([...ingestor.errors.values()].some(message => message.includes('Oversized record skipped')), JSON.stringify([...ingestor.errors]));
  assert.equal(ingestor.sessions.size, 1);
});

test('oversized UTF-8 record is measured in bytes and reported before the following valid record', async t => {
  const f = await fixture(t), path = join(f.source, 'oversized-utf8.jsonl'), store = new Store(f.db);
  t.after(() => store.close());
  const multibyte = `{"type":"ignored","payload":"${'é'.repeat(4 * 1024 * 1024)}"}`;
  assert.ok(multibyte.length < 8 * 1024 * 1024);
  assert.ok(Buffer.byteLength(multibyte, 'utf8') > 8 * 1024 * 1024);
  await writeFile(path, `${multibyte}\n${session('after-utf8-large-line', [count('after-utf8-large-line', 78, 1)])}`);
  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('after-utf8-large-line')?.total?.input, 78);
  assert.ok([...ingestor.errors.values()].some(message => message.includes('Oversized record skipped')));
  assert.equal(ingestor.sessions.size, 1);
});

test('SQLite write failure rolls back, resets the cursor, and replays after lock removal and restart', async t => {
  const f = await fixture(t), path = join(f.source, 'retry.jsonl');
  await writeFile(path, session('retry-session', [count('retry-session', 91, 1)]));
  let store = new Store(f.db);
  const blocker = new DatabaseSync(f.db);
  blocker.exec(`CREATE TRIGGER reject_observation BEFORE INSERT ON observations
    BEGIN SELECT RAISE(ABORT, 'synthetic lock/write failure'); END;`);
  const first = new Ingestor(store);
  await assert.rejects(first.scan([f.source]), /synthetic lock\/write failure/);
  assert.equal(first.sessions.has('retry-session'), false);
  blocker.exec('DROP TRIGGER reject_observation;');
  blocker.close();
  await first.scan([f.source]);
  assert.equal(first.sessions.get('retry-session')?.total?.input, 91);
  store.close();

  store = new Store(f.db);
  t.after(() => store.close());
  const restarted = new Ingestor(store);
  await restarted.scan([f.source]);
  assert.equal(restarted.sessions.get('retry-session')?.total?.input, 91);
  assert.equal(store.sessions().length, 1);
  assert.equal(store.has((await import('node:crypto')).createHash('sha256').update('retry-session').update(count('retry-session', 91, 1)).digest('hex')), true);
});

test('cancelling after an ingestion batch commits no partial sessions and replay recovers all data', async t => {
  const f = await fixture(t), path = join(f.source, 'cancel.jsonl'), store = new Store(f.db);
  t.after(() => store.close());
  const base = Date.parse('2026-10-22T10:00:00.000Z');
  const rows = Array.from({ length: 900 }, (_, index) => {
    const value = JSON.parse(count('cancel-session', index + 1, 1));
    value.timestamp = new Date(base + (index + 1) * 1000).toISOString();
    return JSON.stringify(value);
  });
  await writeFile(path, session('cancel-session', rows));
  const ingestor = new Ingestor(store);
  const stage = store.stageScan.bind(store);
  let batches = 0;
  store.stageScan = observations => {
    stage(observations);
    if (++batches === 1) ingestor.stop();
  };
  await ingestor.scan([f.source]);
  assert.equal(batches, 1, 'the test cancels after the first bounded stage batch');
  assert.equal(store.sessions().length, 0, 'cancelled scan leaves the prior durable state intact');
  assert.equal(store.has((await import('node:crypto')).createHash('sha256').update('cancel-session').update(rows[0]).digest('hex')), false);

  const replay = new Ingestor(store);
  await replay.scan([f.source]);
  assert.equal(replay.sessions.get('cancel-session')?.total?.input, 900);
  assert.equal(store.sessions().length, 1);
});

test('large equal-timestamp groups are projected incrementally and stay conservative', async t => {
  const f = await fixture(t), store = new Store(f.db);
  t.after(() => store.close());
  const observations = Array.from({ length: 5000 }, (_, index) => ({
    key: `same-time-${String(index).padStart(5, '0')}`,
    session: 'same-time-session',
    provenance: { file: 'same-time.jsonl', line: index + 1, event: 'token_count', timestamp: stamp(1) },
    total: { input: index + 1, output: 1, cached: 0 },
  }));
  store.beginScan();
  for (let index = 0; index < observations.length; index += 128) store.stageScan(observations.slice(index, index + 128));
  const sessions = await store.commitScan();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].total, null);
  assert.ok(sessions[0].warnings.some(message => message.includes('Conflicting cumulative')));
  assert.equal(store.sessions()[0].total, null);
});

test('malformed cached session shapes fail with a fixed sanitized error', async t => {
  const f = await fixture(t), store = new Store(f.db);
  store.close();
  const cache = new DatabaseSync(f.db);
  cache.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run('malformed', '{"id":"private-raw-value"}');
  cache.close();
  const reopened = new Store(f.db);
  t.after(() => reopened.close());
  assert.throws(() => reopened.sessions(), error => {
    assert.equal((error as Error).name, 'SyntaxError');
    assert.equal((error as Error).message, 'Invalid cached session');
    assert.equal((error as Error).message.includes('private-raw-value'), false);
    return true;
  });
});

test('malformed cached observation errors stay sanitized and leave prior snapshots intact', async t => {
  const f = await fixture(t);
  let store = new Store(f.db);
  const original = {
    key: 'valid-observation', session: 'cached-session',
    provenance: { file: 'cached.jsonl', line: 1, event: 'token_count', timestamp: stamp(1) },
    total: { input: 10, output: 1, cached: 0 },
  };
  store.save([original]);store.close();
  const cache = new DatabaseSync(f.db);
  cache.prepare('UPDATE observations SET value=? WHERE id=?').run('private damaged cache bytes', original.key);
  cache.close();
  store = new Store(f.db);
  t.after(() => store.close());
  store.beginScan();
  store.stageScan([{ ...original, key: 'new-observation', provenance: { ...original.provenance, line: 2, timestamp: stamp(2) }, total: { input: 20, output: 2, cached: 0 } }]);
  await assert.rejects(store.commitScan(), error => {
    assert.equal((error as Error).name, 'SyntaxError');
    assert.equal((error as Error).message, 'Invalid cached observation');
    assert.equal((error as Error).message.includes('private damaged cache bytes'), false);
    return true;
  });
  assert.equal(store.sessions()[0].total?.input, 10);
  assert.equal(store.has('new-observation'), false);
});

test('SQLite full rollback preserves prior data and retries when the quota is raised', async t => {
  const f = await fixture(t), store = new Store(f.db);
  t.after(() => store.close());
  const prior = {
    key: 'prior-observation', session: 'quota-session',
    provenance: { file: 'prior.jsonl', line: 1, event: 'token_count', timestamp: stamp(1) },
    total: { input: 10, output: 1, cached: 0 },
  };
  store.save([prior]);
  const db = (store as any).db as DatabaseSync;
  const pages = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
  db.exec(`PRAGMA max_page_count=${pages + 1}`);
  const observations = Array.from({ length: 1000 }, (_, index) => ({
    key: `quota-${index}`, session: 'quota-session',
    provenance: { file: 'quota.jsonl', line: index + 2, event: 'token_count', timestamp: new Date(Date.parse(stamp(1)) + (index + 1) * 1000).toISOString() },
    total: { input: (index + 2) * 10, output: index + 2, cached: 0 },
  }));
  store.beginScan();
  assert.throws(() => store.stageScan(observations), error => {
    assert.ok((error as any).errcode === 13 || /full/i.test((error as Error).message));
    return true;
  });
  store.rollbackScan();
  assert.equal(store.sessions()[0].total?.input, 10);
  assert.equal(store.has('prior-observation'), true);
  assert.equal(store.has('quota-999'), false);

  db.exec('PRAGMA max_page_count=100000');
  store.beginScan();store.stageScan(observations);
  const committed = await store.commitScan();
  assert.equal(committed[0].total?.input, 10010);
  assert.equal(store.has('quota-999'), true);
});

test('overlapping cumulative snapshots are retained once per session, independent of file enumeration', async t => {
  const f = await fixture(t), store = new Store(f.db);
  t.after(() => store.close());
  await writeFile(join(f.source, 'a.jsonl'), session('alpha', [count('alpha', 100, 1), count('alpha', 140, 2)]));
  await writeFile(join(f.source, 'b.jsonl'), session('beta', [count('beta', 7, 1)]));
  const ingestor = new Ingestor(store);
  await ingestor.scan([f.source]);
  assert.equal(ingestor.sessions.get('alpha')?.total?.input, 140);
  assert.equal(ingestor.sessions.get('beta')?.total?.input, 7);
  assert.equal(ingestor.sessions.size, 2);
  await ingestor.scan([f.source]);
  assert.equal(store.sessions().length, 2);
  assert.equal(ingestor.sessions.get('alpha')?.total?.input, 140);
});

test('generated interleaved observations remain isolated in their SQLite session partitions', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.constantFrom('alpha', 'beta', 'gamma'), { minLength: 1, maxLength: 40 }),
    async labels => {
      const root = await mkdtemp(join(tmpdir(), 'lens-isolation-property-'));
      const store = new Store(join(root, 'telemetry.sqlite'));
      try {
        const counts = new Map<string, number>();
        const observations = labels.map((id, index) => {
          const cumulative = (counts.get(id) ?? 0) + 1;
          counts.set(id, cumulative);
          return {
            key: `generated-${index}`, session: id,
            provenance: { file: 'synthetic.jsonl', line: index + 1, event: 'token_count', timestamp: stamp(index) },
            total: { input: cumulative * 10, output: cumulative, cached: cumulative },
          };
        });
        const sessions = store.save(observations);
        assert.deepEqual(new Set(sessions.map(value => value.id)), new Set(counts.keys()));
        for (const [id, count] of counts) {
          const value = sessions.find(session => session.id === id)!;
          assert.deepEqual(value.total, { input: count * 10, output: count, cached: count });
        }
        assert.equal(store.sessions().length, counts.size);
      } finally {
        store.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  ), { numRuns: 40, seed: 290810, endOnFailure: true });
});

test('generated monotonic snapshots project identically after duplicate replay, reverse order, and restart', async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({ input: fc.integer({ min: 1, max: 100 }), output: fc.integer({ min: 0, max: 20 }) }), { minLength: 1, maxLength: 30 }),
    async deltas => {
      const root = await mkdtemp(join(tmpdir(), 'lens-replay-property-'));
      const path = join(root, 'telemetry.sqlite');
      let cumulative = { input: 0, output: 0, cached: 0 };
      const observations = deltas.map((delta, index) => {
        cumulative = { input: cumulative.input + delta.input, output: cumulative.output + delta.output, cached: cumulative.cached + 1 };
        return {
          key: `property-${index}`, session: 'one-session',
          provenance: { file: 'synthetic.jsonl', line: index + 1, event: 'token_count', timestamp: stamp(index) },
          total: { ...cumulative },
        };
      });
      let store = new Store(path);
      try {
        const first = store.save(observations)[0];
        store.save([...observations].reverse().concat(observations));
        assert.deepEqual(store.sessions()[0], first);
        store.close();
        store = new Store(path);
        assert.deepEqual(store.sessions()[0], first);
        assert.deepEqual(store.save(observations)[0], first);
      } finally {
        store.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  ), { numRuns: 35, seed: 17261022, endOnFailure: true });
});
