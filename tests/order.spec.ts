import {test,expect} from '@playwright/test';
import {writeFile,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {launchLens,closeLens,record,type LensRun} from './helpers';

const time=(n:number)=>new Date(Date.UTC(2026,9,22,10,0,n)).toISOString();
const id='order-session';
const meta=record('session_meta',{id},time(0));
const model=record('turn_context',{model:'gpt-6-luna'},time(1));
const event=(type:string,n:number)=>record('event_msg',{type,turn_id:'turn-1'},time(n));
const counts=(input:number,output:number,cached:number)=>({input_tokens:input,output_tokens:output,cached_input_tokens:cached,reasoning_output_tokens:0,total_tokens:input+output});
const sample=(n:number,input=2000)=>record('event_msg',{type:'token_count',info:{total_token_usage:counts(input,200,800),last_token_usage:counts(800,200,400),model_context_window:4000},rate_limits:null},time(n));
async function segment(root:string,name:string,rows:object[]) {await writeFile(join(root,name),[meta,...rows].map(r=>JSON.stringify(r)).join('\n')+'\n');}
async function rescan(run:LensRun){
 const button=run.page.getByRole('button',{name:'Rescan sessions'});
 if(await button.isVisible()){await button.click();return;}
 await run.page.getByRole('button',{name:'Settings',exact:true}).click();
 await run.page.getByRole('button',{name:'Rescan',exact:true}).click();
 await run.page.getByRole('button',{name:'Close settings'}).click();
}
async function select(run:LensRun){await run.page.getByTestId(`session-${id}`).click();}
async function metrics(run:LensRun,context='25%'){
 await expect(run.page.getByTestId('model')).toHaveText('gpt-6-luna');
 await expect(run.page.getByTestId('total-input')).toHaveText('2,000');
 await expect(run.page.getByTestId('total-output')).toHaveText('200');
 await expect(run.page.getByTestId('total-cached')).toHaveText('800');
 await expect(run.page.getByTestId('context-value')).toHaveText(context);
 await expect(run.page.locator('.latest-strip')).toContainText('In 800');
 await expect(run.page.locator('.status-block strong')).toHaveText('Completed');
}

for(const reverse of [false,true]) test(`ORDER-01: file order ${reverse?'reverse':'forward'} preserves model, usage and status`,async()=>{
 const run=await launchLens();try{
  await segment(run.source,reverse?'z.jsonl':'a.jsonl',[model,event('task_started',2),sample(3)]);
  await segment(run.source,reverse?'a.jsonl':'z.jsonl',[event('task_complete',5)]);
  await rescan(run);await select(run);await metrics(run);
 }finally{await run.close();}
});

for(const reverse of [false,true]) test(`ORDER-04: regression retention is chronological (${reverse?'reverse':'forward'})`,async()=>{
 const run=await launchLens();try{
  await segment(run.source,reverse?'z.jsonl':'a.jsonl',[model,sample(3,3000)]);
  await segment(run.source,reverse?'a.jsonl':'z.jsonl',[sample(4,2000),event('task_complete',5)]);
  await rescan(run);await select(run);
  await expect(run.page.getByTestId('total-input')).toHaveText('3,000');
  await expect(run.page.getByText('Cumulative counter decreased. Prior totals retained; total coverage is uncertain.')).toBeVisible();
 }finally{await run.close();}
});

for(const reverse of [false,true]) test(`ORDER-05: ambiguous equal-time records stay unavailable (${reverse?'reverse':'forward'})`,async()=>{
 const run=await launchLens();try{
  await segment(run.source,reverse?'z.jsonl':'a.jsonl',[model,sample(3,2000),event('task_complete',5)]);
  await segment(run.source,reverse?'a.jsonl':'z.jsonl',[record('turn_context',{model:'gpt-6-astra'},time(1)),sample(3,3000),event('turn_aborted',5)]);
  await rescan(run);await select(run);
  await expect(run.page.getByTestId('total-input')).toHaveText('Unavailable');
  await expect(run.page.getByTestId('model')).toHaveText('Unavailable');
  await expect(run.page.locator('.status-block strong')).toHaveText('Unavailable');
  await copyFile(join(run.source,'a.jsonl'),join(run.source,'duplicate.jsonl'));await rescan(run);
  await expect(run.page.getByTestId('total-input')).toHaveText('Unavailable');
  await segment(run.source,'resolved.jsonl',[record('turn_context',{model:'gpt-6-luna'},time(6)),sample(7),event('task_complete',8)]);
  await rescan(run);await metrics(run);
 }finally{await run.close();}
});

test('ORDER-02: late metrics survive restart and overlapping replay after newer status',async()=>{
 let run=await launchLens();const root=run.root,source=run.source,data=run.data;
 try{
  await segment(source,'newer.jsonl',[event('task_complete',5)]);
  await rescan(run);await select(run);
  await expect(run.page.locator('.status-block strong')).toHaveText('Completed');
  await closeLens(run,false);run=await launchLens(source,data);
  await segment(source,'late.jsonl',[model,event('task_started',2),sample(3)]);
  await rescan(run);await metrics(run);
  await copyFile(join(source,'late.jsonl'),join(source,'overlap.jsonl'));
  await rescan(run);await metrics(run);
  await closeLens(run,false);run=await launchLens(source,data);await metrics(run);
 }finally{await run.close();await rm(root,{recursive:true,force:true});}
});

test('ORDER-03: late compaction invalidates an earlier sample without dropping metrics',async()=>{
 const run=await launchLens();try{
  await segment(run.source,'initial.jsonl',[model,sample(3),event('task_complete',8)]);
  await rescan(run);await select(run);await metrics(run);
  await segment(run.source,'late.jsonl',[event('context_compacted',4)]);
  await rescan(run);await metrics(run,'Unavailable');
  await segment(run.source,'fresh.jsonl',[sample(6)]);await rescan(run);await metrics(run);
 }finally{await run.close();}
});
