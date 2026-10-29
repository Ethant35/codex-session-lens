// Author: Ethan
import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { addSession, appendTokenCount, appendEvent, launchLens, closeLens } from './helpers';
const require=createRequire(import.meta.url);
const time=(second:number)=>`2026-10-28T12:00:${String(second).padStart(2,'0')}.000Z`;

test('hidden checkpoints show exact observed changes, persist selection, and stay isolated across sessions',async()=>{
  const run=await launchLens();
  try{
    const file=await addSession(run.source,{id:'checkpoint-a',timestamp:time(0)});
    await addSession(run.source,{id:'checkpoint-b',timestamp:time(0)});
    await appendTokenCount(file,'checkpoint-a',{total:{input:1000,output:200,cached:500},latest:{input:100,output:20,cached:50},contextWindow:1000,timestamp:time(1)});
    await run.page.getByRole('button',{name:'Rescan sessions'}).click();
    await run.page.getByTestId('session-checkpoint-a').click();
    await run.page.locator('.checkpoints > summary').click();
    await run.page.getByRole('textbox',{name:'Checkpoint name'}).fill('Before task');
    await run.page.getByRole('button',{name:'Save checkpoint'}).click();
    await expect(run.page.getByText('Checkpoint saved',{exact:true})).toBeVisible();
    await expect(run.page.getByTestId('checkpoint-input')).toHaveText('0');
    const id=await run.page.getByRole('combobox',{name:'Compare from checkpoint'}).inputValue();
    await appendEvent(file,'compacted','checkpoint-a',time(2),{message:'PRIVATE_CHECKPOINT_MESSAGE'});
    await appendTokenCount(file,'checkpoint-a',{total:{input:1800,output:400,cached:700},latest:{input:100,output:20,cached:50},contextWindow:1000,timestamp:time(3)});
    await expect(run.page.getByTestId('checkpoint-input')).toHaveText('800');
    await expect(run.page.getByTestId('checkpoint-output')).toHaveText('200');
    await expect(run.page.getByTestId('checkpoint-cached')).toHaveText('200');
    await expect(run.page.getByTestId('checkpoint-compactions')).toHaveText('1');
    await run.page.locator('.new-checkpoint > summary').click();
    await run.page.getByRole('textbox',{name:'Checkpoint name'}).fill('After task');
    await run.page.getByRole('button',{name:'Save checkpoint'}).click();
    await expect(run.page.getByTestId('checkpoint-input')).toHaveText('0');
    await run.page.getByRole('combobox',{name:'Compare from checkpoint'}).selectOption(id);
    await expect(run.page.getByTestId('checkpoint-input')).toHaveText('800');
    const devtools=await run.page.context().newCDPSession(run.page);
    try {
      await devtools.send('Page.enable');await devtools.send('Page.setBypassCSP',{enabled:true});
      const injected=await devtools.send('Runtime.evaluate',{expression:await readFile(require.resolve('axe-core/axe.min.js'),'utf8'),allowUnsafeEvalBlockedByCSP:true,awaitPromise:true});
      expect(injected.exceptionDetails).toBeUndefined();
      const control=await run.page.evaluate(async()=>{
        const img=document.createElement('img');img.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';document.body.append(img);
        try{return (await (window as any).axe.run(img,{runOnly:{type:'rule',values:['image-alt']}})).violations.some((v:any)=>v.id==='image-alt');}finally{img.remove();}
      });expect(control).toBe(true);
      for(const theme of ['dark','light'] as const){
        await run.page.evaluate(theme=>window.lens.preferences({theme}),theme);
        await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme',theme);
        const violations=await run.page.evaluate(async()=>{const result=await (window as any).axe.run();return result.violations.filter((v:any)=>['critical','serious'].includes(v.impact)).map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>n.target)}));});
        expect(violations).toEqual([]);
      }
    } finally { await devtools.send('Page.setBypassCSP',{enabled:false});await devtools.detach(); }
    await run.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:460,height:650}));
    await mkdir('.local/verification-2026-10-28/screens',{recursive:true});
    await run.page.screenshot({path:'.local/verification-2026-10-28/screens/checkpoints.png',fullPage:true});
    await run.page.locator('.session-picker > summary').click();await run.page.getByTestId('session-checkpoint-b').click();
    await run.page.locator('.checkpoints > summary').click();
    await expect(run.page.getByRole('combobox',{name:'Compare from checkpoint'})).toHaveCount(0);
    await run.page.locator('.session-picker > summary').click();await run.page.getByTestId('session-checkpoint-a').click();
    await closeLens(run,false);
    const reopened=await launchLens(run.source,run.data);
    try{
      await reopened.page.locator('.checkpoints > summary').click();
      await expect(reopened.page.getByRole('combobox',{name:'Compare from checkpoint'})).toHaveValue(id);
      await expect(reopened.page.getByTestId('checkpoint-input')).toHaveText('800');
      await expect(reopened.page.getByTestId('checkpoint-compactions')).toHaveText('1');
      await reopened.page.getByRole('button',{name:'Delete checkpoint'}).click();
      await expect(reopened.page.getByRole('combobox',{name:'Compare from checkpoint'}).locator('option')).toHaveCount(2);
      const bytes=await readFile(`${run.data}/telemetry.sqlite`);expect(bytes.includes(Buffer.from('PRIVATE_CHECKPOINT_MESSAGE'))).toBe(false);
    }finally{await closeLens(reopened);}
  }finally{await closeLens(run);}
});

test('missing checkpoint baseline is explicit and checkpoint controls work with keyboard and zoom',async()=>{
  const run=await launchLens();
  try{
    await addSession(run.source,{id:'unknown-checkpoint',timestamp:time(0)});
    await run.page.getByRole('button',{name:'Rescan sessions'}).click();await run.page.getByTestId('session-unknown-checkpoint').click();
    const summary=run.page.locator('.checkpoints > summary');await summary.focus();await run.page.keyboard.press('Enter');
    await run.page.getByRole('textbox',{name:'Checkpoint name'}).fill('Unknown sample');
    await run.page.getByRole('textbox',{name:'Checkpoint name'}).press('Enter');
    await expect(run.page.getByTestId('checkpoint-input')).toHaveText('Unavailable');
    await expect(run.page.getByText('A cumulative usage sample is missing. Token change is unavailable.')).toBeVisible();
    await run.app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getType()==='window')?.setZoomFactor(2));
    expect(await run.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await run.page.locator('.new-checkpoint > summary').click();
    await run.page.getByRole('button',{name:'Save checkpoint'}).focus();await expect(run.page.getByRole('button',{name:'Save checkpoint'})).toBeFocused();
  }finally{await closeLens(run);}
});
