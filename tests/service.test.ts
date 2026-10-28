// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/main/store';
import { LensService } from '../src/main/service';

async function fixture(t: any, legacy = false) {
  const root = await mkdtemp(join(tmpdir(), 'lens-service-'));
  const source = join(root, 'sessions'), database = join(root, 'telemetry.sqlite');
  await mkdir(source);
  await writeFile(join(source, 'real.jsonl'), JSON.stringify({ timestamp: '2026-10-22T10:00:00Z',
    type: 'session_meta', payload: { id: 'real-session' } }) + '\n');
  const store = new Store(database);
  if (legacy) store.set('preferences', { theme: 'dark', compact: true, alwaysOnTop: false,
    directories: [source], selectedId: null, recentIds: [], paused: false });
  const service = new LensService(store, [source]);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  return { store, service, source, root, database };
}

test('fresh setup gates source reads until the user completes it', async t => {
  const { service, store } = await fixture(t);
  await service.rescan();
  assert.equal(service.snapshot().preferences.onboardingCompleted, false);
  assert.equal(service.snapshot().diagnostics.files, 0);
  assert.deepEqual(store.sessions(), []);
  await service.preferences({ onboardingCompleted: true });
  assert.equal(service.snapshot().sessions[0].id, 'real-session');
  assert.equal(store.get<any>('preferences').onboardingCompleted, true);
});

test('legacy preferences retain settings and do not restart setup', async t => {
  const { service } = await fixture(t, true);
  assert.equal(service.snapshot().preferences.onboardingCompleted, true);
  assert.equal(service.snapshot().preferences.theme, 'dark');
  assert.equal(service.snapshot().preferences.compact, true);
  await service.rescan();
  assert.equal(service.snapshot().sessions[0].id, 'real-session');
});

test('compact mode is the default for fresh preferences', async t => {
  const { service } = await fixture(t);
  assert.equal(service.snapshot().preferences.compact, true);
  assert.deepEqual(service.snapshot().preferences.aliases, {});
});

test('project folder labels are opt-in, bounded basenames and clear atomically when disabled', async t => {
  const { service, store, source, database } = await fixture(t);
  const sourcePath=join(source,'real.jsonl');
  const cwd='/private/PRIVATE_PROJECT_PATH_SENTINEL/Private Project';
  const prompt='PRIVATE_MESSAGE_SENTINEL';
  const header=JSON.stringify({timestamp:'2026-10-22T10:00:00Z',type:'session_meta',payload:{id:'real-session',cwd,prompt}})+'\n';
  await writeFile(sourcePath,header);
  const sourceHash=()=>createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  const before=sourceHash();

  await service.rescan();
  assert.equal(service.snapshot().sessions.length,0,'fresh setup must not read source folders');
  assert.equal((store as any).db.prepare('SELECT count(*) AS n FROM project_labels').get().n,0);
  await service.preferences({onboardingCompleted:true});
  assert.equal(service.snapshot().sessions[0].projectLabel,undefined);
  assert.equal(store.get<any>('preferences').showProjectLabels,false);
  assert.equal((store as any).db.prepare('SELECT count(*) AS n FROM project_labels').get().n,0);

  await service.preferences({showProjectLabels:true});
  assert.equal(service.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,'Private Project');
  assert.equal(service.snapshot().sessions.find(s=>s.id==='real-session')?.id,'real-session');
  assert.equal((store as any).db.prepare('SELECT label FROM project_labels WHERE id=?').get('real-session').label,'Private Project');
  const dbBytes=await readFile(database);
  assert.equal(dbBytes.includes(Buffer.from(cwd)),false,'full source path must not enter the cache');
  assert.equal(dbBytes.includes(Buffer.from(prompt)),false,'source payload text must not enter the cache');
  assert.equal(sourceHash(),before,'the source JSONL is read-only');

  await service.close();
  const reopenedStore=new Store(database),reopened=new LensService(reopenedStore,[source]);
  try {
    assert.equal(reopened.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,'Private Project');
    await reopened.rescan();
    assert.equal(reopened.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,'Private Project');
    await reopened.preferences({showProjectLabels:false});
    assert.equal(reopened.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,undefined);
    assert.equal((reopenedStore as any).db.prepare('SELECT count(*) AS n FROM project_labels').get().n,0);
    assert.equal(reopenedStore.get<any>('preferences').showProjectLabels,false);
    assert.equal(sourceHash(),before);
  } finally { await reopened.close(); }

  const disabledStore=new Store(database),disabled=new LensService(disabledStore,[source]);
  try {
    assert.equal(disabled.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,undefined);
    assert.equal((disabledStore as any).db.prepare('SELECT count(*) AS n FROM project_labels').get().n,0);
  } finally { await disabled.close(); }
});

test('project labels reject unsafe paths and omit ambiguous duplicate session folders', async t => {
  const {service,source}=await fixture(t);
  const row=(id:string,cwd:string)=>JSON.stringify({timestamp:'2026-10-22T10:01:00Z',type:'session_meta',payload:{id,cwd}})+'\n';
  await writeFile(join(source,'windows.jsonl'),row('windows-session','C:\\\\Users\\\\ethan\\\\Project Cedar'));
  await writeFile(join(source,'root.jsonl'),row('root-session','/'));
  await writeFile(join(source,'relative.jsonl'),row('relative-session','not a project path'));
  await writeFile(join(source,'bidi.jsonl'),row('bidi-session',`/private/Hidden${String.fromCharCode(0x202e)}exe/Unsafe`));
  await writeFile(join(source,'duplicate-a.jsonl'),row('duplicate-session','/work/Project A'));
  await writeFile(join(source,'duplicate-b.jsonl'),row('duplicate-session','/work/Project B'));
  const emojiLabel=Array.from({length:64},()=>String.fromCodePoint(0x1f680)).join('');
  await writeFile(join(source,'emoji.jsonl'),row('emoji-session',`/work/${emojiLabel}`));
  await writeFile(join(source,'identity-conflict.jsonl'),row('conflicted-session','/work/Should Not Appear')+
    JSON.stringify({timestamp:'2026-10-22T10:01:01Z',type:'session_meta',payload:{id:'different-session',cwd:'/work/Other'}})+'\n');
  try {
    await service.preferences({onboardingCompleted:true,showProjectLabels:true});
    const labels=new Map(service.snapshot().sessions.map(s=>[s.id,s.projectLabel]));
    assert.equal(labels.get('windows-session'),'Project Cedar');
    assert.equal(labels.get('root-session'),undefined);
    assert.equal(labels.get('relative-session'),undefined);
    assert.equal(labels.get('bidi-session'),undefined);
    assert.equal(labels.get('duplicate-session'),undefined);
    assert.equal(labels.get('conflicted-session'),undefined);
    assert.equal(labels.get('emoji-session'),emojiLabel);
  } finally { await service.close(); }
});

test('an unreadable conflicting source withholds project labels without discarding sessions', async t => {
  const {service,source}=await fixture(t);
  const row=(cwd:string)=>JSON.stringify({timestamp:'2026-10-22T10:00:00Z',type:'session_meta',payload:{id:'real-session',cwd}})+'\n';
  const duplicate=join(source,'duplicate.jsonl');
  await writeFile(join(source,'real.jsonl'),row('/tmp/First'));
  await writeFile(duplicate,row('/tmp/Second'));
  await service.preferences({onboardingCompleted:true,showProjectLabels:true});
  assert.equal(service.snapshot().sessions[0].projectLabel,undefined);
  await chmod(duplicate,0);
  try{
    await service.rescan();
    assert.equal(service.snapshot().sessions[0].id,'real-session');
    assert.equal(service.snapshot().sessions[0].projectLabel,undefined);
    assert.ok(service.snapshot().diagnostics.errors>0);
  }finally{await chmod(duplicate,0o600);}
  await writeFile(duplicate,row('/tmp/First'));
  await service.rescan();
  assert.equal(service.snapshot().sessions[0].projectLabel,'First');
});

test('corrupt cached project labels fail with a fixed sanitized cache error', async t => {
  const root=await mkdtemp(join(tmpdir(),'lens-corrupt-project-label-'));
  const database=join(root,'telemetry.sqlite');
  t.after(()=>rm(root,{recursive:true,force:true}));
  new Store(database).close();
  const raw=new DatabaseSync(database);
  raw.prepare('INSERT INTO project_labels VALUES(?,?)').run('real-session','/private/path');
  raw.close();
  assert.throws(()=>new Store(database),error=>{
    assert.equal((error as Error).name,'SyntaxError');
    assert.equal((error as Error).message,'Invalid cached project label');
    assert.equal((error as Error).message.includes('/private/path'),false);
    return true;
  });
});

test('a rewritten or mixed-identity source clears its prior project label', async t => {
  const {service,source,store}=await fixture(t);
  const file=join(source,'real.jsonl');
  const row=(id:string,cwd:string)=>JSON.stringify({timestamp:'2026-10-22T10:00:00Z',type:'session_meta',payload:{id,cwd}})+'\n';
  await writeFile(file,row('real-session','/work/Before'));
  try {
    await service.preferences({onboardingCompleted:true,showProjectLabels:true});
    assert.equal(service.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,'Before');
    await writeFile(file,row('real-session','/work/Before')+row('another-id','/work/Other'));
    await service.rescan();
    assert.equal(service.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,undefined);
    assert.equal((store as any).db.prepare('SELECT count(*) AS n FROM project_labels WHERE id=?').get('real-session').n,0);

    await writeFile(file,'not-json anymore\n');
    await service.rescan();
    assert.equal(service.snapshot().sessions.find(s=>s.id==='real-session')?.projectLabel,undefined);
    assert.equal((store as any).db.prepare('SELECT count(*) AS n FROM project_labels WHERE id=?').get('real-session').n,0);
  } finally { await service.close(); }
});

test('session aliases are private labels, validated, and survive a service restart', async t => {
  const { service, store, source, database } = await fixture(t);
  await writeFile(join(source, 'other.jsonl'), JSON.stringify({ timestamp: '2026-10-22T10:01:00Z',
    type: 'session_meta', payload: { id: 'other-session' } }) + '\n');
  await service.preferences({ onboardingCompleted: true });
  await service.alias('real-session', '  Workbench  ');
  await service.alias('other-session', 'Workbench');
  assert.deepEqual(service.snapshot().preferences.aliases, { 'real-session': 'Workbench', 'other-session': 'Workbench' });
  assert.deepEqual(store.get<any>('preferences').aliases, { 'real-session': 'Workbench', 'other-session': 'Workbench' });
  assert.deepEqual(service.snapshot().sessions.map(session => session.id).sort(), ['other-session', 'real-session']);

  await assert.rejects(service.alias('unknown-session', 'Unknown'), /Unknown session/);
  for (const label of ['x'.repeat(81), 'line\nbreak', '\nfoo', '\u202ehidden']) {
    await assert.rejects(service.alias('real-session', label));
    assert.deepEqual(service.snapshot().preferences.aliases, { 'real-session': 'Workbench', 'other-session': 'Workbench' });
  }
  await service.alias('real-session', '   ');
  assert.deepEqual(service.snapshot().preferences.aliases, { 'other-session': 'Workbench' });
  await service.alias('real-session', 'Return label');
  await service.close();

  const reopenedStore = new Store(database);
  const reopened = new LensService(reopenedStore, [source]);
  try {
    assert.deepEqual(reopened.snapshot().preferences.aliases, { 'real-session': 'Return label', 'other-session': 'Workbench' });
    assert.deepEqual(reopened.snapshot().sessions.map(session => session.id).sort(), ['other-session', 'real-session']);
    await reopened.clear();
    assert.deepEqual(reopened.snapshot().preferences.aliases, {});
    assert.deepEqual(reopenedStore.get<any>('preferences').aliases, {});
  } finally { await reopened.close(); }
});

test('session aliases cannot be added to synthetic samples', async t => {
  const { service } = await fixture(t);
  await service.preferences({ onboardingCompleted: true, sampleMode: true });
  await assert.rejects(service.alias('sample-session', 'Example'), /Unknown session/);
  assert.deepEqual(service.snapshot().preferences.aliases, {});
});

test('prototype-like session IDs keep own local aliases without changing identities across reload', async t => {
  const { service, source, database } = await fixture(t);
  const specialIds = ['constructor', '__proto__', 'toString'];
  await Promise.all(specialIds.map(id => writeFile(join(source, `${id}.jsonl`), JSON.stringify({
    timestamp: '2026-10-22T10:02:00Z', type: 'session_meta', payload: { id },
  }) + '\n')));
  await service.preferences({ onboardingCompleted: true });
  for (const id of specialIds) await service.alias(id, `Local ${id}`);

  const aliases = service.snapshot().preferences.aliases!;
  assert.equal(Object.getPrototypeOf(aliases), Object.prototype);
  for (const id of specialIds) {
    assert.equal(Object.hasOwn(aliases, id), true);
    assert.equal(aliases[id], `Local ${id}`);
  }
  assert.deepEqual(service.snapshot().sessions.map(session => session.id).sort(), [...specialIds, 'real-session'].sort());
  await service.select('__proto__');
  assert.equal(service.snapshot().preferences.selectedId, '__proto__');
  await service.close();

  const reopenedStore = new Store(database);
  const reopened = new LensService(reopenedStore, [source]);
  try {
    const saved = reopened.snapshot().preferences.aliases!;
    assert.equal(Object.getPrototypeOf(saved), Object.prototype);
    for (const id of specialIds) {
      assert.equal(Object.hasOwn(saved, id), true);
      assert.equal(saved[id], `Local ${id}`);
    }
    assert.equal(reopened.snapshot().preferences.selectedId, '__proto__');
    assert.deepEqual(reopened.snapshot().sessions.map(session => session.id).sort(), [...specialIds, 'real-session'].sort());
  } finally { await reopened.close(); }
});

test('sample is isolated, preserves real selection and never enters stored history', async t => {
  const { service, store } = await fixture(t);
  await service.preferences({ onboardingCompleted: true });
  await service.select('real-session');
  await service.preferences({ sampleMode: true });
  assert.equal(service.snapshot().sessions[0].id, 'sample-session');
  await service.select('sample-session');
  assert.equal(store.get<any>('preferences').selectedId, 'real-session');
  assert.deepEqual(store.sessions().map(s => s.id), ['real-session']);
  await service.preferences({ sampleMode: false });
  assert.equal(service.snapshot().preferences.selectedId, 'real-session');
  assert.equal(service.snapshot().sessions[0].id, 'real-session');
});

test('invalid combined patches make no changes and caller mutations cannot alter settings', async t => {
  const { service } = await fixture(t);
  const initial = service.snapshot().preferences;
  for (const patch of [{ theme: 'dark', directories: ['relative'] }, { paused: 0 },
    { sampleMode: 'yes' }, { directories: [null] }, { selectedId: 'forged' }]) {
    await assert.rejects(service.preferences(patch));
    assert.deepEqual(service.snapshot().preferences, initial);
  }
  const dirs: string[] = [];
  const pending = service.preferences({ directories: dirs });
  dirs.push('/should-not-appear');
  await pending;
  assert.deepEqual(service.snapshot().preferences.directories, []);
  service.snapshot().preferences.directories.push('/also-not-allowed');
  assert.deepEqual(service.snapshot().preferences.directories, []);
});

test('failed settings write leaves memory and durable preferences consistent', async t => {
  const { service, store, database } = await fixture(t, true);
  const before = service.snapshot().preferences;
  const lock = new DatabaseSync(database);
  try {
    lock.exec('BEGIN EXCLUSIVE');
    await assert.rejects(service.preferences({ theme: 'light' }));
    assert.deepEqual(service.snapshot().preferences, before);
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.equal(store.get<any>('preferences').theme, 'dark');
  await service.preferences({ theme: 'light' });
  assert.equal(service.snapshot().preferences.theme, 'light');
});

test('clear is serialized, pauses ingestion, and preserves setup and source settings', async t => {
  const { service, source, store } = await fixture(t, true);
  await service.rescan();
  await Promise.all([service.clear(), service.preferences({ theme: 'light' })]);
  await service.rescan();
  assert.equal(service.snapshot().preferences.paused, true);
  assert.equal(service.snapshot().preferences.onboardingCompleted, true);
  assert.deepEqual(service.snapshot().preferences.directories, [source]);
  assert.deepEqual(service.snapshot().sessions, []);
  assert.deepEqual(store.sessions(), []);
  await service.preferences({ paused: false });
  assert.equal(service.snapshot().sessions[0].id, 'real-session');
});

test('source errors are visible and a successful retry clears them', async t => {
  const { service, source, root } = await fixture(t);
  await service.preferences({ onboardingCompleted: true, directories: [join(root, 'missing')] });
  assert.equal(service.snapshot().diagnostics.errors, 1);
  await service.preferences({ directories: [source] });
  assert.equal(service.snapshot().diagnostics.errors, 0);
  assert.equal(service.snapshot().sessions[0].id, 'real-session');
});

test('explicit undefined fields cannot erase valid preferences', async t => {
  const { service, store } = await fixture(t, true);
  const before = service.snapshot().preferences;
  for (const key of ['theme', 'directories', 'paused', 'onboardingCompleted']) {
    await assert.rejects(service.preferences({ [key]: undefined }));
    assert.deepEqual(service.snapshot().preferences, before);
  }
  assert.equal(store.get<any>('preferences').theme, 'dark');
});

test('storage read failures keep their classification instead of becoming damaged settings', async t => {
  const { store, source } = await fixture(t);
  const read = store.get.bind(store);
  const unavailable = Object.assign(new Error('private storage path'), { errcode: 5 });
  store.get = () => { throw unavailable; };
  try { assert.throws(() => new LensService(store, [source]), error => error === unavailable); }
  finally { store.get = read; }
});

test('close cancels work before saving final bounds and all callers await the same shutdown', async t => {
  const { service, database } = await fixture(t, true);
  const scan = service.rescan().catch(() => undefined);
  const bounds = { x: 10, y: 20, width: 460, height: 650 };
  await Promise.all([service.close(bounds), service.close(), scan]);
  const reopened = new Store(database);
  try { assert.deepEqual(reopened.get('bounds'), bounds); }
  finally { reopened.close(); }
  await assert.rejects(service.preferences({ paused: false }), /closing/);
});
