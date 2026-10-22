import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=await mkdtemp(join(tmpdir(),'session-lens-preview-'));
await mkdir(join(root,'sessions'));
const rows=[
{timestamp:'2026-10-22T18:00:00Z',type:'session_meta',payload:{id:'demo-session-2026'}},
{timestamp:'2026-10-22T18:00:01Z',type:'turn_context',payload:{model:'gpt-6-astra'}},
{timestamp:'2026-10-22T18:00:02Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:128400,output_tokens:8200,cached_input_tokens:96000},last_token_usage:{input_tokens:60000,output_tokens:2000,cached_input_tokens:45000,total_tokens:62000},model_context_window:258400}}}
];
await writeFile(join(root,'sessions','demo.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
const app=await electron.launch({executablePath:resolve('release/mac-arm64/Codex Session Lens.app/Contents/MacOS/Codex Session Lens'),env:{...process.env,LENS_DATA_DIR:join(root,'data'),LENS_SESSION_DIR:join(root,'sessions')}});
try {
const page=await app.firstWindow();await page.getByTestId('session-demo-session-2026').click();
await mkdir('.local',{recursive:true});await page.screenshot({animations:'disabled',path:'.local/hud-default.png'});
await page.getByRole('button',{name:'Compact display'}).click();await page.screenshot({animations:'disabled',path:'.local/hud-compact.png'});
console.log(await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight})));
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Theme').selectOption('dark');await page.getByRole('button',{name:'Close settings'}).click();await page.screenshot({animations:'disabled',path:'.local/hud-dark.png'});
}finally {
const child=app.process();
const exited=new Promise(resolve=>child.once('exit',resolve));
const quit=new Promise(resolve=>app.on('console',m=>{if(m.text()==='LENS_PREVIEW_QUIT')resolve()}));
await app.evaluate(({app})=>{app.once('will-quit',()=>console.log('LENS_PREVIEW_QUIT'));setTimeout(()=>app.quit(),20)});
await Promise.race([quit,exited,new Promise(resolve=>setTimeout(resolve,3000))]);
if(child.exitCode===null)child.kill('SIGTERM');
await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1000))]);
if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
await rm(root,{recursive:true,force:true});
}
