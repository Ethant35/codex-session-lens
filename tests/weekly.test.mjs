// Author: Ethan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const temp=await mkdtemp(join(tmpdir(),'lens-weekly-test-'));
await build({entryPoints:['src/main/weekly.ts'],bundle:true,platform:'node',format:'cjs',outfile:join(temp,'weekly.cjs'),logLevel:'silent'});
const {scanWeekly}=createRequire(import.meta.url)(join(temp,'weekly.cjs'));
const u=(input,output,cached=0)=>({input_tokens:input,output_tokens:output,cached_input_tokens:cached});
const meta=(id,cwd='/example/project',extra={})=>({type:'session_meta',ordinal:0,timestamp:'2026-10-30T12:00:00Z',payload:{id,cwd,...extra}});
const token=(time,total,latest,ordinal=1)=>({type:'event_msg',timestamp:time,ordinal,payload:{type:'token_count',info:{total_token_usage:total,last_token_usage:latest}}});
const rows=async(dir,name,values)=>writeFile(join(dir,name),values.map(x=>JSON.stringify(x)).join('\n')+'\n');
const range=['2026-11-02','2026-11-08',{timeZone:'America/Los_Angeles'}];
try{
 await test('date boundary uses pre-range baseline and paired snapshots count once',async()=>{
  const d=await mkdtemp(join(temp,'boundary-'));
  await rows(d,'a.jsonl',[meta('a'),token('2026-11-02T07:59:00Z',u(100,10,40),u(100,10,40)),token('2026-11-02T08:01:00Z',u(160,16,60),u(60,6,20)),token('2026-11-02T08:01:00.001Z',u(160,16,60),u(60,6,20)),token('2026-11-09T08:00:00Z',u(260,26,80),u(100,10,20))]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:60,output:6,cached:20});
 });
 await test('child inherited rows and compressed duplicate copies are excluded',async()=>{
  const d=await mkdtemp(join(temp,'child-'));const t='2026-11-03T12:00:00Z';
  const parent=[meta('parent'),token(t,u(100,10,40),u(100,10,40),3)];
  const child=[meta('child','/example/project',{forked_from_id:'parent',parent_thread_id:'parent',source:{subagent:{thread_spawn:{parent_thread_id:'parent'}}},subagent_history_start_ordinal:10}),{...meta('parent'),ordinal:1},parent[1],token('2026-11-03T13:00:00Z',u(30,3,10),u(30,3,10),11)];
  await rows(d,'parent.jsonl',parent);await rows(d,'child.jsonl',child);execFileSync('/opt/homebrew/bin/zstd',['-q','-f',join(d,'child.jsonl'),'-o',join(d,'copy.jsonl.zst')]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:130,output:13,cached:50});assert.equal(r.projects[0].sessions.find(s=>s.id==='parent').descendantTotals.input,30);assert.ok(r.coverage.duplicateObservations>0);assert.equal(r.coverage.compressedFiles,1);
 });
 await test('unknown initial baseline never attributes inherited cumulative history as child work',async()=>{
  const d=await mkdtemp(join(temp,'carried-'));await rows(d,'child.jsonl',[meta('child','/example/project',{parent_thread_id:'absent'}),token('2026-11-03T12:00:00Z',u(1000,100,500),u(20,2,10))]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,20);assert.ok(r.projects[0].sessions[0].gaps.some(s=>s.includes('baseline')));
 });
 await test('same basename paths stay separate and malformed/partial compressed input surfaces a gap',async()=>{
  const d=await mkdtemp(join(temp,'gaps-'));await rows(d,'a.jsonl',[meta('a','/one/project'),token('2026-11-03T12:00:00Z',u(10,1),u(10,1))]);await rows(d,'b.jsonl',[meta('b','/two/project'),token('2026-11-03T12:00:00Z',u(20,2),u(20,2))]);await writeFile(join(d,'broken.jsonl.zst'),'not compressed');
  const r=await scanWeekly([d],...range);assert.equal(r.projects.length,2);assert.notEqual(r.projects[0].id,r.projects[1].id);assert.ok(r.gaps.some(s=>s.includes('compressed')));assert.equal(JSON.stringify(r).includes('/one/project'),false);
 });
 await test('detailed response wins over delayed legacy snapshot with different cumulative channel',async()=>{
  const d=await mkdtemp(join(temp,'offset-'));const detailed={type:'token_usage_record',timestamp:'2026-11-03T12:00:00Z',payload:{thread_id:'a',response_id:'r1',usage:u(40,4,20),thread_token_usage:u(1040,104,520)}};
  await rows(d,'a.jsonl',[meta('a'),detailed,token('2026-11-03T12:00:06Z',u(2040,204,1020),u(40,4,20)),{...detailed,timestamp:'2026-11-03T12:00:00.001Z'}]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:40,output:4,cached:20});
 });
 await test('legacy latest-only then matching cumulative does not count twice',async()=>{
  const d=await mkdtemp(join(temp,'only-'));await rows(d,'a.jsonl',[meta('a'),token('2026-11-03T12:00:00Z',null,u(10,1,5)),token('2026-11-03T12:00:00.001Z',u(10,1,5),u(10,1,5))]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:10,output:1,cached:5});
 });
 await test('unattributable initial cumulative remains a visible zero-total session gap',async()=>{
  const d=await mkdtemp(join(temp,'unknown-'));await rows(d,'a.jsonl',[meta('a'),token('2026-11-03T12:00:00Z',u(500,50,100),null)]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,0);assert.equal(r.projects[0].sessions.length,1);assert.ok(r.projects[0].sessions[0].gaps.length);
 });
 await test('uncertain cross-boundary jump counts only known last request',async()=>{
  const d=await mkdtemp(join(temp,'jump-'));await rows(d,'a.jsonl',[meta('a'),token('2026-11-02T07:59:00Z',u(100,10,20),u(100,10,20)),token('2026-11-02T08:01:00Z',u(300,30,80),u(10,1,5))]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,10);assert.ok(r.projects[0].sessions[0].gaps.some(s=>s.includes('date boundary')));
 });
 await test('distinct responses with identical usage and time stay distinct; same-time legacy mirror counts once',async()=>{
  const d=await mkdtemp(join(temp,'responses-'));const t='2026-11-03T12:00:00Z';const record=id=>({type:'token_usage_record',timestamp:t,payload:{thread_id:'a',response_id:id,usage:u(10,1,5),thread_token_usage:u(10,1,5)}});
  await rows(d,'a.jsonl',[meta('a'),token(t,u(10,1,5),u(10,1,5)),record('r1'),record('r2')]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:20,output:2,cached:10});
 });
 await test('a modern mirror cannot consume a later legitimate legacy request with the same usage',async()=>{
  const d=await mkdtemp(join(temp,'one-pair-'));const modern={type:'token_usage_record',timestamp:'2026-11-03T12:00:00Z',payload:{thread_id:'a',response_id:'r1',usage:u(10,1,5),thread_token_usage:u(1000,100,500)}};
  await rows(d,'a.jsonl',[meta('a'),modern,token('2026-11-03T12:00:06Z',u(100,10,50),u(10,1,5)),token('2026-11-03T13:00:00Z',u(110,11,55),u(10,1,5))]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,20);
 });
 await test('cross-boundary cumulative without known last request is withheld',async()=>{
  const d=await mkdtemp(join(temp,'unknown-boundary-'));await rows(d,'a.jsonl',[meta('a'),token('2026-11-02T07:59:00Z',u(100,10,20),u(100,10,20)),token('2026-11-02T08:01:00Z',u(300,30,80),null)]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,0);assert.ok(r.projects[0].sessions[0].gaps.some(s=>s.includes('date boundary')));
 });
 await test('telemetry without header and entirely invalid usage stay visible as global gaps',async()=>{
  const d=await mkdtemp(join(temp,'header-'));await rows(d,'a.jsonl',[token('2026-11-03T12:00:00Z',u(100,10),u(100,10))]);await rows(d,'b.jsonl',[meta('b'),token('2026-11-03T12:00:00Z',u(-1,10),u(-1,10))]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,0);assert.ok(r.gaps.some(s=>s.includes('header')));assert.ok(r.gaps.some(s=>s.includes('Invalid usage')));
 });
 await test('zero-own-usage parent remains in the lineage drill',async()=>{
  const d=await mkdtemp(join(temp,'ancestor-'));await rows(d,'parent.jsonl',[meta('parent')]);await rows(d,'child.jsonl',[meta('child','/example/project',{parent_thread_id:'parent'}),token('2026-11-03T12:00:00Z',u(10,1),u(10,1))]);
  const r=await scanWeekly([d],...range);const parent=r.projects.flatMap(p=>p.sessions).find(s=>s.id==='parent');assert.equal(parent.totals.input,0);assert.equal(parent.descendantTotals.input,10);assert.equal(r.totals.input,10);
 });
 await test('stale unchanged cumulative snapshot crossing range start adds no old last request',async()=>{
  const d=await mkdtemp(join(temp,'stale-'));await rows(d,'a.jsonl',[meta('a'),token('2026-10-14T12:00:00Z',u(1000,100,500),u(10,1,5)),token('2026-11-05T12:00:00Z',u(1000,100,500),u(10,1,5))]);
  const r=await scanWeekly([d],...range);assert.deepEqual(r.totals,{input:0,output:0,cached:0});
 });
 await test('pairing does not search backwards past an intervening different response',async()=>{
  const d=await mkdtemp(join(temp,'nearest-'));const record=(time,id,amount)=>({type:'token_usage_record',timestamp:time,payload:{thread_id:'a',response_id:id,usage:u(amount,1,0),thread_token_usage:u(amount,1,0)}});
  await rows(d,'a.jsonl',[meta('a'),record('2026-11-03T12:00:00Z','r1',10),record('2026-11-03T13:00:00Z','r2',20),token('2026-11-03T14:00:00Z',u(10,1),u(10,1))]);
  const r=await scanWeekly([d],...range);assert.equal(r.totals.input,40);
 });
 await test('abort rejects and invalid dates reject',async()=>{const c=new AbortController();c.abort();await assert.rejects(scanWeekly([temp],...range.slice(0,2),{signal:c.signal}));await assert.rejects(scanWeekly([temp],'2026-02-30','2026-03-01'));});
}finally{await rm(temp,{recursive:true,force:true});}
