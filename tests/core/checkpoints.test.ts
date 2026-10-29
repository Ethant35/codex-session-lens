// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../src/main/store';
import { LensService } from '../../src/main/service';
import { checkpointView, parseCheckpoint } from '../../src/main/checkpoints';

const row = (type:string,payload:unknown,second=0) => JSON.stringify({type,payload,timestamp:new Date(Date.UTC(2026,9,28,10,0,second)).toISOString()})+'\n';
const usage = (input:number,output:number,cached:number,second:number) => row('event_msg',{type:'token_count',info:{
  total_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cached},
  last_token_usage:{input_tokens:10,output_tokens:2,cached_input_tokens:4,total_tokens:12},model_context_window:1000,
}},second);
async function fixture(t:any,withUsage=true){
  const root=await mkdtemp(join(tmpdir(),'lens-checkpoints-')),source=join(root,'source'),database=join(root,'cache.sqlite');
  await mkdir(source);const file=join(source,'a.jsonl');
  await writeFile(file,row('session_meta',{id:'a'})+(withUsage?usage(1000,200,500,1):''));
  const store=new Store(database),service=new LensService(store,[source]);
  t.after(async()=>{await service.close();await rm(root,{recursive:true,force:true});});
  await service.preferences({onboardingCompleted:true});await service.select('a');
  return {root,source,database,file,store,service};
}

test('checkpoint deltas use cumulative differences, deduplicate compactions and survive restart and selection',async t=>{
  const f=await fixture(t),before=await readFile(f.file,'utf8');
  await f.service.checkpoint('create','a','Before work');
  const first=f.service.snapshot().checkpoints![0];
  assert.deepEqual(first.delta,{input:0,output:0,cached:0});
  const compact=row('compacted',{message:'PRIVATE_COMPACTION_TEXT',replacement_history:['PRIVATE_HISTORY']},2);
  await appendFile(f.file,compact+compact+usage(1600,350,750,3));
  const expectedSource=before+compact+compact+usage(1600,350,750,3);
  await f.service.rescan();await f.service.rescan();
  let view=f.service.snapshot().checkpoints![0];
  assert.deepEqual(view.delta,{input:600,output:150,cached:250});assert.equal(view.observedCompactions,1);
  await f.service.checkpoint('create','a','After work');
  const second=f.service.snapshot().checkpoints!.find(p=>p.selected)!;
  assert.deepEqual(second.delta,{input:0,output:0,cached:0});
  await f.service.checkpoint('select','a',first.id);
  await f.service.close();
  const reopened=new LensService(new Store(f.database),[f.source]);
  try{
    view=reopened.snapshot().checkpoints!.find(p=>p.selected)!;
    assert.equal(view.id,first.id);assert.deepEqual(view.delta,{input:600,output:150,cached:250});
    await reopened.rescan();assert.equal(reopened.snapshot().checkpoints![0].observedCompactions,1);
    await reopened.checkpoint('delete','a',second.id);assert.equal(reopened.snapshot().checkpoints!.length,1);
    const bytes=await readFile(f.database);assert.equal(bytes.includes(Buffer.from('PRIVATE_COMPACTION_TEXT')),false);assert.equal(bytes.includes(Buffer.from('PRIVATE_HISTORY')),false);
    assert.equal(await readFile(f.file,'utf8'),expectedSource);
    await reopened.clear();assert.deepEqual(reopened.snapshot().checkpoints,[]);
  }finally{await reopened.close();}
});

test('missing baseline remains unavailable after usage arrives; history errors never appear as exact zero',async t=>{
  const f=await fixture(t,false);await f.service.checkpoint('create','a','No usage yet');
  await appendFile(f.file,usage(1000,200,500,1));await f.service.rescan();
  assert.equal(f.service.snapshot().checkpoints![0].delta,null);
  await f.service.checkpoint('create','a','Valid baseline');
  await appendFile(f.file,usage(10,2,5,2));await f.service.rescan();
  const selected=f.service.snapshot().checkpoints!.find(p=>p.selected)!;
  assert.equal(selected.delta,null);assert.match(selected.notes.join(' '),/uncertain/);
});

test('late compaction counts as newly observed; checkpoints never imply a source timestamp interval',async t=>{
  const f=await fixture(t);await f.service.checkpoint('create','a','Selected point');
  await appendFile(f.file,row('compacted',{message:'ignored'},0));await f.service.rescan();
  assert.equal(f.service.snapshot().checkpoints![0].observedCompactions,1);
  assert.deepEqual(f.service.snapshot().checkpoints![0].delta,{input:0,output:0,cached:0});
});

test('checkpoint boundaries reject unknown sessions, cross-session IDs, unsafe names and samples',async t=>{
  const f=await fixture(t);await f.service.checkpoint('create','a','One');
  const id=f.service.snapshot().checkpoints![0].id;
  await writeFile(join(f.source,'b.jsonl'),row('session_meta',{id:'b'}));await f.service.rescan();
  for(const [action,session,value] of [['create','unknown','Name'],['select','b',id],['delete','b',id],['create','a','x'.repeat(81)],['create','a','\u202eevil'],['create','a','   '],['bogus','a',id]]){
    await assert.rejects(f.service.checkpoint(action,session,value));
  }
  await f.service.select('b');assert.deepEqual(f.service.snapshot().checkpoints,[]);
  await f.service.select('a');assert.equal(f.service.snapshot().checkpoints![0].id,id);
  await f.service.preferences({sampleMode:true});await assert.rejects(f.service.checkpoint('create','a','Sample'));assert.deepEqual(f.service.snapshot().checkpoints,[]);
});

test('locked checkpoint mutations roll back; deleted checkpoints and clear remain deleted after restart',async t=>{
  const f=await fixture(t);await f.service.checkpoint('create','a','Keep');
  const point=f.service.snapshot().checkpoints![0];
  const lock=new DatabaseSync(f.database);lock.exec('BEGIN EXCLUSIVE');
  try{await assert.rejects(f.service.checkpoint('delete','a',point.id));assert.equal(f.service.snapshot().checkpoints![0].id,point.id);}finally{lock.exec('ROLLBACK');lock.close();}
  assert.equal(f.service.snapshot().checkpoints![0].id,point.id);
  await f.service.checkpoint('delete','a',point.id);await f.service.close();
  const reopened=new LensService(new Store(f.database),[f.source]);
  try{assert.deepEqual(reopened.snapshot().checkpoints,[]);await reopened.checkpoint('create','a','Clear me');await reopened.clear();}finally{await reopened.close();}
  const finalStore=new Store(f.database);try{assert.deepEqual(finalStore.checkpoints(),[]);}finally{finalStore.close();}
});

test('checkpoint capacity is bounded and a failed create retains the previous selection',async t=>{
  const f=await fixture(t);for(let i=0;i<20;i++)await f.service.checkpoint('create','a',`Point ${i}`);
  const prior=f.service.snapshot().checkpoints!.find(p=>p.selected)!.id;
  await assert.rejects(f.service.checkpoint('create','a','Too many'));
  assert.equal(f.service.snapshot().checkpoints!.length,20);assert.equal(f.service.snapshot().checkpoints!.find(p=>p.selected)!.id,prior);
});

test('incomplete scan status survives restart and prevents an exact checkpoint baseline',async t=>{
  const f=await fixture(t);await appendFile(f.file,'INVALID_PRIVATE_LINE\n');await f.service.rescan();await f.service.close();
  const reopened=new LensService(new Store(f.database),[f.source]);
  try{await reopened.checkpoint('create','a','Incomplete');const p=reopened.snapshot().checkpoints![0];assert.equal(p.incomplete,true);assert.equal(p.delta,null);assert.match(p.notes.join(' '),/incomplete/);}finally{await reopened.close();}
});

test('checkpoint validation and comparison fail closed for lost or inconsistent history',async t=>{
  const f=await fixture(t);await f.service.checkpoint('create','a','One');
  const point=f.store.checkpoints()[0],session=f.service.snapshot().sessions[0];
  assert.throws(()=>parseCheckpoint(JSON.stringify({...point,name:'\u0000'})),SyntaxError);
  assert.throws(()=>parseCheckpoint(JSON.stringify({...point,total:{input:0,output:0,cached:1}})),SyntaxError);
  assert.equal(checkpointView(point,undefined,false).delta,null);
  assert.equal(checkpointView(point,{...session,total:{input:1100,output:210,cached:700}},false).delta,null,'cached delta cannot exceed input delta');
  assert.equal(checkpointView({...point,compactions:2},session,false).observedCompactions,null);
});

test('failure after deleting checkpoint rows rolls back durable data and scan coverage publishes only on commit',async t=>{
  const f=await fixture(t);await f.service.checkpoint('create','a','Retain after failure');
  const before=f.store.checkpoints();
  const db=new DatabaseSync(f.database);
  db.exec("CREATE TRIGGER checkpoint_write_failure BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
  try{await assert.rejects(f.service.checkpoint('create','a','Must roll back'));assert.deepEqual(f.store.checkpoints(),before);}
  finally{db.exec('DROP TRIGGER checkpoint_write_failure');db.close();}
  f.store.beginScan();f.store.stageCoverage(true);assert.equal(f.store.incompleteCoverage(),false);f.store.rollbackScan();assert.equal(f.store.incompleteCoverage(),false);
  f.store.beginScan();f.store.stageCoverage(true);await f.store.commitScan();assert.equal(f.store.incompleteCoverage(),true);
  await f.service.close();const reopened=new Store(f.database);
  try{assert.deepEqual(reopened.checkpoints(),before);assert.equal(reopened.incompleteCoverage(),true);}finally{reopened.close();}
});
