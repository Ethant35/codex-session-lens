import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {launchLens,addSession,appendTokenCount,record} from './helpers';

test('SL-08 additional: an in-place rewrite that grows the file replays safely',async()=>{
  const run=await launchLens();
  try {
    const file=await addSession(run.source,{id:'rewrite-session',timestamp:'2026-10-22T10:00:00Z'});
    await appendTokenCount(file,'rewrite-session',{total:{input:1000,output:100,cached:500},latest:{input:1000,output:100,cached:500},timestamp:'2026-10-22T10:00:01Z'});
    await run.page.getByTestId('session-rewrite-session').click();
    await expect(run.page.getByTestId('total-input')).toHaveText('1,000');
    const rows=[record('session_meta',{id:'rewrite-session'},'2026-10-22T10:00:00Z'),record('event_msg',{type:'token_count',info:{total_token_usage:{input_tokens:2000,output_tokens:200,cached_input_tokens:800},last_token_usage:{input_tokens:1000,output_tokens:100,cached_input_tokens:300,total_tokens:1100}}},'2026-10-22T10:00:02Z'),record('response_item',{type:'message',content:'synthetic ignored padding '.repeat(200)},'2026-10-22T10:00:03Z')];
    await writeFile(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
    await expect(run.page.getByTestId('total-input')).toHaveText('2,000');
    await expect(run.page.getByTestId('total-cached')).toHaveText('800');
  }finally {await run.close();}
});

test('SL-04 additional: mismatched identities and invalid counts cannot contaminate a session',async()=>{
 const run=await launchLens();
 try {
  const file=await addSession(run.source,{id:'identity-session',timestamp:'2026-10-22T10:00:00Z'});
  await appendTokenCount(file,'identity-session',{total:{input:1000,output:100,cached:500},latest:{input:1000,output:100,cached:500},timestamp:'2026-10-22T10:00:01Z'});
  await appendTokenCount(file,'other-session',{total:{input:9000,output:900,cached:900},latest:{input:9000,output:900,cached:900},timestamp:'2026-10-22T10:00:02Z'});
  await run.page.getByTestId('session-identity-session').click();
  await expect(run.page.getByTestId('total-input')).toHaveText('1,000');
  await run.page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(run.page.getByText('Record identity does not match its session; skipped.')).toBeVisible();
  await appendTokenCount(file,'identity-session',{total:{input:-1,output:200,cached:500},latest:{input:100,output:10,cached:200},contextWindow:1000,timestamp:'2026-10-22T10:00:03Z'});
  await expect(run.page.getByText('Invalid cumulative usage was ignored.')).toBeVisible();
  await expect(run.page.getByTestId('total-input')).toHaveText('1,000');
  await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
 }finally {await run.close();}
});

test('SL-15: background main-process failures exit nonzero and keep raw errors private',async()=>{
 const run=await launchLens();
 try{
  const child=run.app.process();let stderr='';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
  const exited=new Promise<number|null>(resolve=>child.once('exit',code=>resolve(code)));
  await run.app.evaluate(()=>{setTimeout(()=>{throw new Error('LENS_SYNTHETIC_BACKGROUND_FAILURE');},20);});
  let timer:ReturnType<typeof setTimeout>;
  try{
   const code=await Promise.race([exited,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Background failure did not exit')),5000);})]);
   expect(code).toBe(1);
   expect(stderr).toContain('Session Lens stopped after an unexpected local error.');
   expect(stderr).not.toContain('LENS_SYNTHETIC_BACKGROUND_FAILURE');
  }finally{clearTimeout(timer!);}
 }finally{await run.close();}
});
