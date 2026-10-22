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
await mkdir('.local',{recursive:true});await page.screenshot({path:'.local/hud-default.png'});
await page.getByRole('button',{name:'Compact display'}).click();await page.screenshot({path:'.local/hud-compact.png'});
console.log(await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight})));
}finally {await app.close();await rm(root,{recursive:true,force:true});}
