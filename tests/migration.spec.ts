import {test,expect} from '@playwright/test';
import {resolve,join} from 'node:path';
import {writeFile,rm} from 'node:fs/promises';
import {launchLens,closeLens,record} from './helpers';

const t=(s:number)=>`2026-10-22T10:00:${String(s).padStart(2,'0')}.000Z`;
const id='upgrade-session';
const meta=record('session_meta',{id},t(0));
const lines=(rows:object[])=>[meta,...rows].map(r=>JSON.stringify(r)).join('\n')+'\n';
const usage={input_tokens:1200,output_tokens:300,cached_input_tokens:500,total_tokens:1500,reasoning_output_tokens:0};
const telemetry=[record('turn_context',{model:'gpt-6-luna'},t(1)),record('event_msg',{type:'token_count',info:{total_token_usage:usage,last_token_usage:usage,model_context_window:6000}},t(2))];

for(const missing of [false,true]) test(`UPGRADE: v1 cache ${missing?'retains removed source history':'replays previously suppressed records'}`,async()=>{
 // v1 predates --background. Never launch that visible baseline implicitly.
 expect(process.env.LENS_ALLOW_VISIBLE_BASELINE,'v1 migration needs explicit LENS_ALLOW_VISIBLE_BASELINE=1; ordinary tests stay hidden').toBe('1');
 const current=process.env.LENS_EXECUTABLE;
 const visible=process.env.LENS_VISIBLE_TESTS;
 process.env.LENS_VISIBLE_TESTS='1';
 process.env.LENS_EXECUTABLE=process.env.LENS_BASELINE_EXECUTABLE || resolve('.local/v1.0.0/Codex Session Lens.app/Contents/MacOS/Codex Session Lens');
 let run;
 try{run=await launchLens();}finally{
  if(current===undefined)delete process.env.LENS_EXECUTABLE;else process.env.LENS_EXECUTABLE=current;
  if(visible===undefined)delete process.env.LENS_VISIBLE_TESTS;else process.env.LENS_VISIBLE_TESTS=visible;
 }
 const root=run.root,source=run.source,data=run.data;
 try{
  await writeFile(join(source,'a.jsonl'),lines(missing?telemetry:[record('event_msg',{type:'task_complete',turn_id:'turn-1'},t(5))]));
  if(!missing)await writeFile(join(source,'z.jsonl'),lines(telemetry));
  await run.page.getByRole('button',{name:'Rescan sessions'}).click();
  await run.page.getByTestId(`session-${id}`).click();
  await expect(run.page.getByTestId('total-input')).toHaveText(missing?'1,200':'Unavailable');
  await run.page.getByRole('button',{name:'Settings',exact:true}).click();
  await run.page.getByLabel('Theme').selectOption('dark');
  await closeLens(run,false);
  if(missing)await rm(source,{recursive:true});
  run=await launchLens(source,data);
  await expect(run.page.getByTestId('total-input')).toHaveText('1,200');
  await expect(run.page.getByTestId('total-output')).toHaveText('300');
  await expect(run.page.getByTestId('total-cached')).toHaveText('500');
  await expect(run.page.getByTestId('model')).toHaveText('gpt-6-luna');
  await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme','dark');
  await expect(run.page.getByText(/Upgraded from a v1 cache/)).toBeVisible();
  await closeLens(run,false);run=await launchLens(source,data);
  await expect(run.page.getByTestId('total-input')).toHaveText('1,200');
 }finally{await run.close();await rm(root,{recursive:true,force:true});}
});
