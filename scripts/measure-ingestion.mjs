// Author: Ethan
// Synthetic-only ingestion benchmark. It never reads configured or real Codex directories.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { statfsSync } from 'node:fs';

const MiB = 1024 * 1024;
const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const representative = process.argv.includes('--representative');
const files = Number(arg('--files') ?? (representative ? 138 : 4));
const representativeTotalMiB = Number(arg('--total-mib') ?? 3051.3);
const representativeLargestMiB = Number(arg('--largest-mib') ?? 604.2);
const sizes = (arg('--sizes') ?? (process.argv.includes('--large') ? '1000,5000,10000,50000' : '1000,5000,10000'))
  .split(',').map(Number);
const cancelAfterMs = arg('--cancel-after-ms') === undefined ? null : Number(arg('--cancel-after-ms'));
const soakSeconds = arg('--soak-seconds') === undefined ? null : Number(arg('--soak-seconds'));
if (!Number.isInteger(files) || files < 1 || files > 138) throw new Error('--files must be an integer from 1 to 138');
if (!sizes.length || sizes.length > 10 || sizes.some(n => !Number.isInteger(n) || n < 1 || n > 100_000)) throw new Error('sizes must contain 1–10 integers from 1 to 100000');
if (cancelAfterMs !== null && (!Number.isInteger(cancelAfterMs) || cancelAfterMs < 1 || cancelAfterMs > 3_600_000)) throw new Error('--cancel-after-ms must be from 1 to 3600000');
if (soakSeconds !== null && (!Number.isInteger(soakSeconds) || soakSeconds < 1 || soakSeconds > 900)) throw new Error('--soak-seconds must be from 1 to 900');
if (representative && files !== 138) throw new Error('--representative always creates 138 synthetic files');
if (!representative && sizes.some(size => size < files)) throw new Error('each observation tier must have at least one observation per file');
if (representative && (!Number.isFinite(representativeTotalMiB) || !Number.isFinite(representativeLargestMiB) || representativeLargestMiB <= 0 || representativeTotalMiB <= representativeLargestMiB || representativeLargestMiB > 604.2 || representativeTotalMiB > 3051.3)) throw new Error('representative size overrides must keep 0 < largest-mib <= 604.2 and largest-mib < total-mib <= 3051.3');

const temp = await mkdtemp(join(tmpdir(), 'lens-ingestion-bench-'));
const bundle = join(temp, 'benchmark.cjs');
const MiBForWorker = MiB;
const targetTotalBytes = Math.round(representativeTotalMiB * MiB);
const targetLargestBytes = Math.round(representativeLargestMiB * MiB);
const ingestionPath = resolve('src/main/ingestion.ts');
const storePath = resolve('src/main/store.ts');
const worker = `
const { Ingestor } = require(${JSON.stringify(ingestionPath)});
const { Store } = require(${JSON.stringify(storePath)});
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const MiB = ${MiBForWorker};
const args = process.argv.slice(2);
const value = name => args.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
const baseTime = Date.parse('2026-10-22T10:00:00.000Z');
const iso = second => new Date(baseTime + second * 1000).toISOString();
const row = (type, payload, second) => JSON.stringify({timestamp: iso(second), type, payload});
const record = (id, index) => row('event_msg', {type:'token_count',thread_id:id,info:{total_token_usage:{input_tokens:index*10,output_tokens:index,cached_input_tokens:Math.floor(index/2)},last_token_usage:{input_tokens:10,output_tokens:1,cached_input_tokens:1,total_tokens:11}}}, index);
const write = (fd, text) => fs.writeSync(fd, text);
const mkdir = fs.mkdirSync;
function writeObservationFiles(dir, count, fileCount) {
  const counts = Array.from({length:fileCount}, (_, f) => Math.floor(count / fileCount) + (f < count % fileCount ? 1 : 0));
  for (let f=0; f<fileCount; f++) {
    const id='bench-'+f, fd=fs.openSync(path.join(dir, 'history-'+f+'.jsonl'), 'w', 0o600);
    try {
      write(fd, row('session_meta',{id},0)+'\\n');
      for (let i=1; i<=counts[f]; i++) write(fd, record(id,i)+'\\n');
    } finally { fs.closeSync(fd); }
  }
  return counts;
}
function writePromptFile(dir, index, targetBytes) {
  const id='prompt-'+index, fd=fs.openSync(path.join(dir,'history-'+index+'.jsonl'),'w',0o600);
  let bytes=0, line=row('session_meta',{id},0)+'\\n';
  write(fd,line); bytes += Buffer.byteLength(line);
  // Response-item message bodies are synthetic padding only. Lines stay below
  // the app's 8 MiB limit so the scanner parses realistic unrecognized events.
  const maxText=6*MiB;
  const prefix='{"timestamp":"'+iso(1)+'","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"';
  const suffix='"}]}}\\n';
  const lineOverhead=Buffer.byteLength(prefix+suffix);
  const finalEvent={timestamp:iso(1),type:'event_msg',payload:{type:'token_count',thread_id:id,info:{total_token_usage:{input_tokens:10,output_tokens:1,cached_input_tokens:0},last_token_usage:{input_tokens:10,output_tokens:1,cached_input_tokens:0,total_tokens:11}},note:''}};
  const minimumFinalBytes=Buffer.byteLength(JSON.stringify(finalEvent)+'\\n');
  while (targetBytes - bytes > minimumFinalBytes + maxText) {
    const remaining=targetBytes-bytes;
    const textSize=Math.min(maxText,remaining-minimumFinalBytes-lineOverhead);
    if (textSize < 1) break;
    const padding=prefix+'x'.repeat(textSize)+suffix;
    write(fd,padding); bytes += Buffer.byteLength(padding);
  }
  const noteBytes=targetBytes-bytes-minimumFinalBytes;
  if (noteBytes < 0 || noteBytes > maxText) { fs.closeSync(fd); throw new Error('Synthetic representative final row exceeds its bounded line size: file='+index+' noteBytes='+noteBytes+' target='+targetBytes+' current='+bytes+' minimum='+minimumFinalBytes); }
  finalEvent.payload.note='z'.repeat(noteBytes);
  line=JSON.stringify(finalEvent)+'\\n';
  write(fd,line); bytes += Buffer.byteLength(line);
  fs.closeSync(fd);
  if (bytes !== targetBytes) throw new Error('Representative source file size mismatch');
}
async function sleep(ms) { await new Promise(resolve=>setTimeout(resolve,ms)); }
async function loopControl() {
  let maxLag=0, expected=performance.now()+5;
  const timer=setInterval(()=>{const now=performance.now();maxLag=Math.max(maxLag,now-expected);expected=now+5;},5);
  await sleep(15);
  const started=performance.now(); while(performance.now()-started<50) {}
  await sleep(30); clearInterval(timer);
  if(maxLag<40) throw new Error('Event-loop lag monitor failed its 50 ms busy-wait positive control: '+maxLag);
  return {positiveControlBusyWaitMs:50,detectedLagMs:Math.round(maxLag*100)/100};
}
async function main() {
  if(args.includes('--control')) { console.log(JSON.stringify(await loopControl())); return; }
  if(args.includes('--soak')) {
    const seconds=Number(value('--soak-seconds')||0);
    if(!Number.isInteger(seconds)||seconds<1||seconds>900)throw new Error('invalid soak duration');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'lens-soak-case-'));
    let store=null,ingestor=null,timer=null,maxLagMs=0,peakRss=0,expected=0;
    const measurements=[];
    try {
      const source=path.join(root,'source');mkdir(source);
      const file=path.join(source,'soak-session.jsonl');
      fs.writeFileSync(file,row('session_meta',{id:'soak-session'},0)+'\\n'+record('soak-session',1)+'\\n',{mode:0o600});
      store=new Store(path.join(root,'telemetry.sqlite'));ingestor=new Ingestor(store);
      await ingestor.scan([source]);
      const baselineRss=process.memoryUsage().rss;peakRss=baselineRss;expected=performance.now()+5;
      timer=setInterval(()=>{const now=performance.now();maxLagMs=Math.max(maxLagMs,now-expected);expected=now+5;peakRss=Math.max(peakRss,process.memoryUsage().rss);},5);
      for(let index=2;index<=seconds+1;index++){
        await sleep(1000);
        const fd=fs.openSync(file,'a');try{write(fd,record('soak-session',index)+'\\n');}finally{fs.closeSync(fd);}
        const started=performance.now();await ingestor.scan([source]);measurements.push(performance.now()-started);
        const sessions=store.sessions(),session=sessions[0];
        if(sessions.length!==1||session?.total?.input!==index*10||session.total.output!==index||session.total.cached!==Math.floor(index/2))throw new Error('Soak cumulative result diverged at append '+index);
      }
      await sleep(20);clearInterval(timer);timer=null;peakRss=Math.max(peakRss,process.memoryUsage().rss);
      const sorted=[...measurements].sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
      console.log(JSON.stringify({soakSeconds:seconds,appendScans:measurements.length,finalObservations:seconds+1,scanMs:{p50:Math.round(percentile(.5)*100)/100,p95:Math.round(percentile(.95)*100)/100,max:Math.round(Math.max(...measurements)*100)/100},rssBaselineMiB:Math.round(baselineRss/MiB*100)/100,peakRssMiB:Math.round(peakRss/MiB*100)/100,peakRssDeltaMiB:Math.round((peakRss-baselineRss)/MiB*100)/100,maxEventLoopLagMs:Math.round(maxLagMs*100)/100,exactTotalsVerified:true},null,2));
    } finally {if(timer)clearInterval(timer);store?.close();fs.rmSync(root,{recursive:true,force:true});}
    return;
  }
  const total=Number(value('--observations')||0), fileCount=Number(value('--files')||4), cancelMs=Number(value('--cancel-after-ms')||0);
  const representative=args.includes('--representative');
  const totalBytes=${targetTotalBytes}, largestBytes=${targetLargestBytes};
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lens-measure-case-'));
  let store=null, ingestor=null, timer=null, cancelTimer=null, cancelled=false;
  const onSignal=()=>{cancelled=true;ingestor?.stop();};
  process.once('SIGINT',onSignal); process.once('SIGTERM',onSignal);
  try {
    const source=path.join(root,'source'); mkdir(source);
    let expectedCounts;
    const generationStart=performance.now();
    if(representative) {
      const otherCount=fileCount-1, per=Math.floor((totalBytes-largestBytes)/otherCount), extra=(totalBytes-largestBytes)%otherCount;
      const targets=Array.from({length:fileCount},(_,i)=>i===0?largestBytes:per+(i-1<extra?1:0));
      for(let i=0;i<fileCount;i++) writePromptFile(source,i,targets[i]);
      expectedCounts=targets.map(()=>1);
    } else expectedCounts=writeObservationFiles(source,total,fileCount);
    const generationWallMs=performance.now()-generationStart;
    const sourceBytes=fs.readdirSync(source).reduce((sum,name)=>sum+fs.statSync(path.join(source,name)).size,0);
    store=new Store(path.join(root,'telemetry.sqlite')); ingestor=new Ingestor(store);
    const baselineRss=process.memoryUsage().rss;
    let peakRss=baselineRss, maxLagMs=0, intervalMs=5, expected=performance.now()+intervalMs;
    timer=setInterval(()=>{const now=performance.now();maxLagMs=Math.max(maxLagMs,now-expected);expected=now+intervalMs;peakRss=Math.max(peakRss,process.memoryUsage().rss);},intervalMs);
    if(cancelMs) cancelTimer=setTimeout(()=>{cancelled=true;ingestor.stop();},cancelMs);
    const started=performance.now();
    await ingestor.scan([source]);
    const scanWallMs=performance.now()-started;
    // Give the interval callback a chance to report any synchronous save stall
    // that ended in the scan's final turn.
    await sleep(intervalMs*4);
    clearInterval(timer);timer=null;
    if(cancelTimer)clearTimeout(cancelTimer);
    peakRss=Math.max(peakRss,process.memoryUsage().rss);
    const sessions=store.sessions();
    if(cancelled) {
      if(sessions.length!==0) throw new Error('Cancellation persisted a partial synthetic scan');
    } else {
      if(sessions.length!==fileCount) throw new Error('Expected '+fileCount+' sessions, received '+sessions.length+': '+sessions.map(value=>value.id).join(','));
      for(let i=0;i<fileCount;i++) {
        const s=sessions.find(value=>value.id=== (representative?'prompt-'+i:'bench-'+i));
        const n=expectedCounts[i];
        if(!s || !s.total || s.total.input!==n*10 || s.total.output!==n || s.total.cached!==Math.floor(n/2)) throw new Error('Incorrect final total for synthetic session '+i);
      }
    }
    console.log(JSON.stringify({records:total,files:fileCount,representative,sourceBytes,generationWallMs:Math.round(generationWallMs*100)/100,scanWallMs:Math.round(scanWallMs*100)/100,rssBaselineMiB:Math.round(baselineRss/MiB*100)/100,peakRssMiB:Math.round(peakRss/MiB*100)/100,peakRssDeltaMiB:Math.round((peakRss-baselineRss)/MiB*100)/100,maxEventLoopLagMs:Math.round(maxLagMs*100)/100,cancelled},null,2));
  } finally {
    if(timer)clearInterval(timer); if(cancelTimer)clearTimeout(cancelTimer);
    store?.close(); fs.rmSync(root,{recursive:true,force:true});
    process.removeListener('SIGINT',onSignal); process.removeListener('SIGTERM',onSignal);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
`;

const availableBytes = statfsSync(tmpdir()).bavail * statfsSync(tmpdir()).bsize;
if (representative) {
  const requiredBytes = targetTotalBytes;
  if (availableBytes < requiredBytes + 256 * MiB) throw new Error('Representative mode requires about 3.0 GiB of temporary disk space plus 256 MiB headroom');
}
await build({ stdin: { contents: worker, resolveDir: process.cwd(), sourcefile: 'measure-ingestion-worker.cjs', loader: 'js' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external' });

function runWorker(args) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(process.execPath,[bundle,...args],{stdio:['ignore','pipe','inherit']});
    let stdout=''; child.stdout.setEncoding('utf8'); child.stdout.on('data',chunk=>stdout+=chunk);
    const stop=()=>child.kill('SIGINT');
    process.once('SIGINT',stop);
    child.once('error',reject);
    child.once('close',(code,signal)=>{
      process.removeListener('SIGINT',stop);
      if(code!==0) return reject(new Error(`benchmark child exited code=${code} signal=${signal}: ${stdout}`));
      try { resolvePromise(JSON.parse(stdout)); } catch(e) { reject(new Error(`invalid benchmark JSON: ${stdout}`)); }
    });
  });
}

try {
  const control=await runWorker(['--control']);
  const measurements=[];
  if(soakSeconds!==null){
    measurements.push(await runWorker(['--soak','--soak-seconds='+soakSeconds]));
  } else if(representative) {
    const args=['--representative','--files='+files];
    if(cancelAfterMs!==null)args.push('--cancel-after-ms='+cancelAfterMs);
    measurements.push(await runWorker(args));
  } else for(const size of sizes) {
    const args=['--observations='+size,'--files='+files];
    if(cancelAfterMs!==null)args.push('--cancel-after-ms='+cancelAfterMs);
    measurements.push(await runWorker(args));
  }
  console.log(JSON.stringify({runtime:process.version,platform:process.platform,arch:process.arch,syntheticOnly:true,representative,totalBytes:representative?targetTotalBytes:undefined,largestFileBytes:representative?targetLargestBytes:undefined,eventLoopLagControl:control,measurements},null,2));
} finally { await rm(temp,{recursive:true,force:true}); }
