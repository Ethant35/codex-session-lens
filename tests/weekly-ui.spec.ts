// Author: Ethan
import axe from 'axe-core';
import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchLens } from './helpers';
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cached_input_tokens: 0 });
const row = (timestamp: string, type: string, payload: unknown) => JSON.stringify({ timestamp, type, payload });
test('weekly scan reads compressed copies once, exposes session contributions and stays hidden', async () => {
  const root = await mkdtemp(join(tmpdir(),'lens-weekly-ui-'));
  const source = join(root,'sources'); await mkdir(source);
  const parent = [row('2026-11-01T20:00:00Z','session_meta',{id:'weekly-parent',cwd:'/synthetic/weekly-project'}),
    row('2026-11-01T20:00:00Z','event_msg',{type:'token_count',thread_id:'weekly-parent',info:{total_token_usage:usage(900,90),last_token_usage:usage(900,90)}}),
    row('2026-11-03T20:00:00Z','event_msg',{type:'token_count',thread_id:'weekly-parent',info:{total_token_usage:usage(1000,100),last_token_usage:usage(100,10)}})].join('\n')+'\n';
  const path = join(source,'parent.jsonl'); await writeFile(path,parent);
  execFileSync('/opt/homebrew/bin/zstd',['-q','-f',path,'-o',path+'.zst']);
  await writeFile(join(source,'child.jsonl'),[
    row('2026-11-03T21:00:00Z','session_meta',{id:'weekly-child',cwd:'/synthetic/weekly-project',source:{subagent:{thread_spawn:{parent_thread_id:'weekly-parent'}}}}),
    row('2026-11-03T21:00:00Z','event_msg',{type:'token_count',thread_id:'weekly-child',info:{total_token_usage:usage(200,20),last_token_usage:usage(200,20)}}),
  ].join('\n')+'\n');
  const run = await launchLens(source);
  try {
    expect(await run.app.evaluate(()=>typeof (process as any).getBuiltinModule('node:zlib').createZstdDecompress)).toBe('function');
    await run.page.getByRole('button',{name:'Weekly usage',exact:true}).click();
    await run.page.getByLabel('Usage from date').fill('2026-11-02');
    await run.page.getByLabel('Usage through date').fill('2026-11-08');
    await run.page.getByRole('button',{name:'Scan date range',exact:true}).click();
    await expect(run.page.getByTestId('weekly-input')).toHaveText('300');
    await expect(run.page.getByTestId('weekly-output')).toHaveText('30');
    await run.page.locator('.weekly-projects > li > details > summary').click();
    await expect(run.page.locator('.weekly-sessions')).toContainText('weekly-parent');
    await expect(run.page.locator('.weekly-sessions')).toContainText('weekly-child');
    await run.page.locator('.weekly-sessions details').evaluateAll(elements=>elements.forEach(e=>(e as HTMLDetailsElement).open=true));
    await expect(run.page.locator('.weekly-sessions')).toContainText('Descendants: 200 input');
    await expect(run.page.locator('.weekly-sessions')).toContainText('Parent: weekly-parent');
    const result = await run.page.evaluate(()=>window.lens.weeklyStatus());
    expect(result.report!.coverage.compressedFiles).toBe(1);
    expect(result.report!.coverage.duplicateObservations).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('/synthetic/');
    const cdp=await run.page.context().newCDPSession(run.page);
    await cdp.send('Page.enable'); await cdp.send('Page.setBypassCSP',{enabled:true});
    const injected=await cdp.send('Runtime.evaluate',{expression:axe.source,allowUnsafeEvalBlockedByCSP:true,awaitPromise:true});
    expect(injected.exceptionDetails).toBeUndefined();
    const control=await run.page.evaluate(async()=>{
      const probe=document.createElement('img');document.body.append(probe);
      try { return (await (window as any).axe.run(probe,{runOnly:{type:'rule',values:['image-alt']}})).violations.some((v:any)=>v.id==='image-alt'); }
      finally { probe.remove(); }
    });
    expect(control).toBe(true);
    const violations = await run.page.evaluate(async()=>{
      const r=await (window as any).axe.run(document.querySelector('.weekly-card'));
      return r.violations.filter((v:any)=>['serious','critical'].includes(v.impact));
    });
    expect(violations).toEqual([]); await cdp.detach();
    expect(await readFile(path,'utf8')).toBe(parent);
    await run.page.screenshot({path:'.local/weekly-2026-11-11/weekly-ui.png',fullPage:true});
    await run.page.evaluate(()=>window.lens.preferences({theme:'dark'}));
    await expect(run.page.locator('main')).toHaveAttribute('data-theme','dark');
    await run.page.setViewportSize({width:360,height:650});
    expect(await run.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    const darkViolations=await run.page.evaluate(async()=> (await (window as any).axe.run(document.querySelector('.weekly-card'))).violations.filter((v:any)=>['serious','critical'].includes(v.impact)));
    expect(darkViolations).toEqual([]);
    await run.page.screenshot({path:'.local/weekly-2026-11-11/weekly-ui-dark-narrow.png',fullPage:true});
    await run.page.evaluate(()=>window.lens.clear());
    expect((await run.page.evaluate(()=>window.lens.weeklyStatus())).report).toBeUndefined();
    await expect(run.page.getByTestId('weekly-input')).toHaveCount(0);
  } finally { await run.close();await rm(root,{recursive:true,force:true}); }
});
test('weekly scan preserves a paused HUD, rejects samples and cancels without retaining a report',async()=>{
  const run=await launchLens();
  try{
    await run.page.getByRole('button',{name:'Weekly usage',exact:true}).click();
    await run.page.evaluate(()=>window.lens.preferences({paused:true}));
    await writeFile(join(run.source,'paused.jsonl'),[
      row('2026-11-03T20:00:00Z','session_meta',{id:'paused-scan',cwd:'/synthetic/paused'}),
      row('2026-11-03T20:00:00Z','event_msg',{type:'token_count',thread_id:'paused-scan',info:{total_token_usage:usage(50,5),last_token_usage:usage(50,5)}}),
    ].join('\n')+'\n');
    await expect(run.page.getByRole('button',{name:'Scan once while HUD is paused',exact:true})).toBeEnabled();
    await run.page.getByRole('button',{name:'Scan once while HUD is paused',exact:true}).click();
    await expect(run.page.getByTestId('weekly-input')).toHaveText('50');
    const paused=await run.page.evaluate(()=>window.lens.snapshot());
    expect(paused.preferences.paused).toBe(true); expect(paused.sessions).toEqual([]);
    await run.page.evaluate(()=>window.lens.preferences({sampleMode:true}));
    await expect(run.page.evaluate(()=>window.lens.weeklyScan('2026-11-02','2026-11-08'))).rejects.toThrow();
    await run.page.evaluate(()=>window.lens.preferences({sampleMode:false}));
    await expect(run.page.getByRole('button',{name:'Scan once while HUD is paused',exact:true})).toBeEnabled();
    const cancelled=await run.page.evaluate(async()=>{
      await window.lens.weeklyScan('2026-11-02','2026-11-08');
      return window.lens.weeklyCancel();
    });
    expect(cancelled.status).toBe('cancelled');expect(cancelled.report).toBeUndefined();
    await expect.poll(()=>run.page.evaluate(()=>window.lens.snapshot())).toBeTruthy();
  }finally{await run.close();}
});

test('missing history folders surface a coverage gap rather than an unexplained zero', async()=>{
  const run=await launchLens();
  try {
    await run.page.evaluate((directory)=>window.lens.preferences({directories:[directory]}),join(run.root,'missing-history'));
    await run.page.getByRole('button',{name:'Weekly usage',exact:true}).click();
    await run.page.getByLabel('Usage from date').fill('2026-11-02');
    await run.page.getByLabel('Usage through date').fill('2026-11-08');
    await run.page.getByRole('button',{name:'Scan date range',exact:true}).click();
    await expect(run.page.getByTestId('weekly-input')).toHaveText('0');
    await expect(run.page.locator('.weekly-gaps')).toContainText('source directory is unavailable');
  } finally { await run.close(); }
});
