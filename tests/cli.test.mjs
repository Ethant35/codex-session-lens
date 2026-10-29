// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const executable = resolve('dist/cli/lens.cjs');
const row = (type, payload, second = 0) => JSON.stringify({
  timestamp: `2026-10-22T10:00:0${second}.000Z`, type, payload,
});
const usage = { input_tokens: 1200, output_tokens: 300, cached_input_tokens: 500, total_tokens: 1500 };
const fixture = [row('session_meta', { id: 'cli-session' }),
  row('turn_context', { model: 'gpt-6-luna' }, 1),
  row('event_msg', { type: 'token_count', info: {
    total_token_usage: usage, last_token_usage: usage, model_context_window: 6000,
  } }, 2)].join('\n') + '\n';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'lens-cli-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), temporary = join(root, 'temporary');
  await mkdir(source); await mkdir(temporary);
  const path = join(source, 'rollout.jsonl');
  await writeFile(path, fixture);
  const run = (...args) => spawnSync(process.execPath, [executable, ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, TMPDIR: temporary, LENS_DATA_DIR: join(root, 'must-not-use'),
      LENS_SESSION_DIR: join(root, 'must-not-read') },
  });
  return { root, source, path, temporary, run };
}

test('CLI parses real records in Node; preserves source and removes temporary cache', async t => {
  const f = await setup(t), before = await stat(f.path);
  const result = f.run('scan', '--source', f.source);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.diagnostics.errors, 0);
  assert.equal(output.diagnostics.files, 1);
  assert.equal(output.sessions.length, 1);
  assert.deepEqual(output.sessions[0].total, { input: 1200, output: 300, cached: 500 });
  assert.equal(output.sessions[0].model, 'gpt-6-luna');
  assert.equal(output.sessions[0].context.percent, 25);
  assert.equal(await readFile(f.path, 'utf8'), fixture);
  assert.equal((await stat(f.path)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readdir(f.temporary), []);
  assert.deepEqual((await readdir(f.root)).sort(), ['source', 'temporary']);
});

test('persistent CLI cache replays without double counting and leaves HUD cache untouched', async t => {
  const f = await setup(t), cache = join(f.root, 'cache');
  await mkdir(cache);
  await writeFile(join(cache, 'telemetry.sqlite'), 'HUD cache sentinel');
  const first = f.run('scan', '--source', f.source, '--cache', cache);
  const second = f.run('scan', '--source', f.source, '--cache', cache);
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout).sessions, JSON.parse(first.stdout).sessions);
  assert.equal(await readFile(join(cache, 'telemetry.sqlite'), 'utf8'), 'HUD cache sentinel');
  assert.equal((await stat(join(cache, 'lens-cli.sqlite'))).mode & 0o777, 0o600);
});

test('malformed records produce diagnostics without exposing their contents', async t => {
  const f = await setup(t);
  await writeFile(f.path, fixture + 'PRIVATE_PROMPT_SENTINEL\n');
  const result = f.run('scan', '--source', f.source);
  assert.equal(result.status, 2);
  const output = JSON.parse(result.stdout);
  assert.equal(output.diagnostics.errors, 1);
  assert.equal(output.sessions[0].total.input, 1200);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PROMPT_SENTINEL/);
});

test('incomplete record is deferred and ingested after append on the next CLI run', async t => {
  const f = await setup(t), cache = join(f.root, 'cache');
  const end = fixture.lastIndexOf('\n');
  await writeFile(f.path, fixture.slice(0, end - 10));
  const partial = f.run('scan', '--source', f.source, '--cache', cache);
  assert.equal(partial.status, 2);
  assert.equal(JSON.parse(partial.stdout).sessions[0].total, null);
  await writeFile(f.path, fixture);
  const complete = f.run('scan', '--source', f.source, '--cache', cache);
  assert.equal(complete.status, 0, complete.stderr);
  assert.deepEqual(JSON.parse(complete.stdout).sessions[0].total, { input: 1200, output: 300, cached: 500 });
});

test('missing directory exits with diagnostics', async t => {
  const f = await setup(t);
  const result = f.run('scan', '--source', join(f.root, 'missing'));
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).diagnostics.errors, 1);
});

test('invalid cache fails through stderr and preserves the existing file', async t => {
  const f = await setup(t), cache = join(f.root, 'cache');
  await mkdir(cache); await writeFile(join(cache, 'lens-cli.sqlite'), 'existing corrupt cache');
  const result = f.run('scan', '--source', f.source, '--cache', cache);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /local operation failed/);
  assert.equal(await readFile(join(cache, 'lens-cli.sqlite'), 'utf8'), 'existing corrupt cache');
});

test('help and argument validation never scan implicit directories', async t => {
  const f = await setup(t);
  assert.equal(f.run('--help').status, 0);
  for (const args of [[], ['scan'], ['scan', '--source', ''], ['scan', '--unknown'], ['clear']]) {
    const result = f.run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  }
  assert.deepEqual(await readdir(f.temporary), []);
});

test('CLI checkpoints persist across scans without Electron or the HUD cache', async t => {
  const f=await setup(t),cache=join(f.root,'cache');
  assert.equal(f.run('scan','--source',f.source,'--cache',cache).status,0);
  const command=(...args)=>f.run('checkpoint','--cache',cache,'--session','cli-session',...args);
  const created=command('--name','Before work');assert.equal(created.status,0,created.stderr);
  const point=JSON.parse(created.stdout).checkpoints[0];assert.deepEqual(point.delta,{input:0,output:0,cached:0});
  const next={...usage,input_tokens:1800,output_tokens:400,cached_input_tokens:700,total_tokens:2200};
  await writeFile(f.path,fixture+row('compacted',{message:'PRIVATE_CHECKPOINT_SENTINEL'},3)+'\n'+row('event_msg',{type:'token_count',info:{total_token_usage:next,last_token_usage:next}},4)+'\n');
  assert.equal(f.run('scan','--source',f.source,'--cache',cache).status,0);
  const list=command();assert.equal(list.status,0,list.stderr);
  const delta=JSON.parse(list.stdout).checkpoints[0];assert.deepEqual(delta.delta,{input:600,output:100,cached:200});assert.equal(delta.observedCompactions,1);
  assert.doesNotMatch(list.stdout,/PRIVATE_CHECKPOINT_SENTINEL/);
  assert.equal(command('--delete',point.id).status,0);assert.deepEqual(JSON.parse(command().stdout).checkpoints,[]);
  assert.equal(command('--name','x','--delete','x').status,2);
  assert.equal(command('--source',f.source).status,2);
  assert.equal(f.run('checkpoint','--session','cli-session').status,2);
});
