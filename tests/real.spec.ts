import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchLens } from './helpers';
const exec = promisify(execFile);
const execClosed = (file: string, args: string[], options: any): Promise<{stdout:string;stderr:string}> => new Promise((resolve,reject) => {
  const child = execFile(file,args,{...options,encoding:'utf8'},(error,stdout,stderr)=> error ? reject(error) : resolve({stdout:String(stdout),stderr:String(stderr)}));
  child.stdin?.end();
});

test('SL-11 actual Codex CLI session has the same rendered usage as its real rollout', async () => {
  test.setTimeout(120_000);
  const run = await launchLens();
  try {
    const {stdout} = await execClosed('codex',['exec','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-s','read-only','-m','gpt-6-luna','-c','model_provider="openai"','-c','model_reasoning_effort="low"','--json','Reply with exactly SESSION_LENS_REAL_ACCEPTANCE. Do not call tools or edit files.'],{timeout:90_000,maxBuffer:2*1024*1024,env:process.env});
    const events=stdout.trim().split('\n').map(line=>JSON.parse(line));
    const id=events.find(e=>e.type==='thread.started')?.thread_id;
    const complete=events.find(e=>e.type==='turn.completed');
    expect(typeof id).toBe('string'); expect(complete).toBeTruthy();
    const base=join(process.env.CODEX_HOME || join(homedir(),'.codex'),'sessions');
    const files=await readdir(base,{recursive:true});
    const relative=files.find(f=>f.endsWith(`${id}.jsonl`));
    expect(relative).toBeTruthy();
    const source=join(base,relative!);
    const rows=(await readFile(source,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const sample=rows.filter(r=>r.type==='event_msg' && r.payload?.type==='token_count' && r.payload.info).at(-1)?.payload.info;
    expect(sample).toBeTruthy();
    await copyFile(source,join(run.source,'real-rollout.jsonl'));
    await run.page.getByTestId(`session-${id}`).click();
    const f=(v:number)=>new Intl.NumberFormat('en-US').format(v);
    await expect(run.page.getByTestId('total-input')).toHaveText(f(sample.total_token_usage.input_tokens));
    await expect(run.page.getByTestId('total-output')).toHaveText(f(sample.total_token_usage.output_tokens));
    await expect(run.page.getByTestId('total-cached')).toHaveText(f(sample.total_token_usage.cached_input_tokens));
    await expect(run.page.getByTestId('model')).toHaveText('gpt-6-luna');
    expect(sample.total_token_usage.input_tokens).toBe(complete.usage.input_tokens);
    await mkdir('.local',{recursive:true});
    await writeFile('.local/real-evidence.json',JSON.stringify({author:'Ethan',timestamp:new Date().toISOString(),cli:(await exec('codex',['--version'])).stdout.trim(),model:'gpt-6-luna',totals:sample.total_token_usage,source:'actual local Codex JSONL rollout; private path and contents omitted',passed:true},null,2));
  } finally {await run.close();}
});

test('SL-12 installed Codex desktop is present; manual selection is explicitly unsupported for automatic switching', async () => {
  const {stdout} = await exec('osascript',['-e','tell application "System Events" to get bundle identifier of every process']);
  expect(stdout).toContain('com.openai.codex');
  const run = await launchLens();
  try {
    const {addSession,appendTokenCount}=await import('./helpers');
    const a=await addSession(run.source,{id:'manual-one',model:'gpt-6-luna'});
    const b=await addSession(run.source,{id:'manual-two',model:'gpt-6-astra'});
    await appendTokenCount(a,'manual-one',{total:{input:10,output:2},latest:{input:10,output:2}});
    await appendTokenCount(b,'manual-two',{total:{input:90,output:9},latest:{input:90,output:9}});
    await run.page.getByTestId('session-manual-one').click();
    await expect(run.page.getByTestId('total-input')).toHaveText('10');
    await expect(run.page.getByText(/Automatic switching to the foreground Codex conversation is unsupported/)).toBeVisible();
    await run.page.locator('.session-picker > summary').click();
    await run.page.getByTestId('session-manual-two').click();
    await expect(run.page.getByTestId('total-input')).toHaveText('90');
  } finally {await run.close();}
});
