// Author: Ethan
import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join, basename, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';
import type { Usage } from '../shared';
import type { WeeklyOptions, WeeklyReport, WeeklySession } from '../weekly-types';

type Event = { time: string; total: Usage | null; latest: Usage | null; key: string; response: string | null; kind: string; ordinal: number | null };
type Run = { id: string; parent: string | null; project: string | null; label: string; events: Map<string, Event>; gaps: Set<string> };
const zero = (): Usage => ({input:0,output:0,cached:0});
const add = (a:Usage,b:Usage) => { if(!['input','output','cached'].every(k=>Number.isSafeInteger(a[k as keyof Usage]+b[k as keyof Usage])))throw new Error('Usage totals exceed the safe integer range.');a.input+=b.input;a.output+=b.output;a.cached+=b.cached; };
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
const usage=(v:any):Usage|null=>v&&integer(v.input_tokens)&&integer(v.output_tokens)&&integer(v.cached_input_tokens)&&v.cached_input_tokens<=v.input_tokens?{input:v.input_tokens,output:v.output_tokens,cached:v.cached_input_tokens}:null;
const equal=(a:Usage,b:Usage)=>a.input===b.input&&a.output===b.output&&a.cached===b.cached;
const difference=(a:Usage,b:Usage):Usage|null=>a.input>=b.input&&a.output>=b.output&&a.cached>=b.cached?{input:a.input-b.input,output:a.output-b.output,cached:a.cached-b.cached}:null;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function project(value:unknown):{id:string;label:string}|null {
  if(typeof value!=='string'||value.length>4096||!isAbsolute(value)||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))return null;
  const clean=value.replace(/\/+$/,'');return {id:hash(clean).slice(0,20),label:Array.from(basename(clean)||'Unknown project').slice(0,80).join('')};
}
function dateFormatter(timeZone:string) { return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}); }
function dateKey(formatter:Intl.DateTimeFormat,time:string){const p=formatter.formatToParts(new Date(time));return ['year','month','day'].map(k=>p.find(x=>x.type===k)!.value).join('-');}
function checkDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Use valid ISO calendar dates.');}

export async function scanWeekly(roots:string[],startDate:string,endDate:string,options:WeeklyOptions={}):Promise<WeeklyReport>{
  checkDate(startDate);checkDate(endDate);if(startDate>endDate)throw new Error('Start date follows end date.');
  const timeZone=options.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter=dateFormatter(timeZone);formatter.format(new Date());
  const gaps=new Set<string>();const runs=new Map<string,Run>();let eventCount=0;
  const coverage={files:0,plainFiles:0,compressedFiles:0,duplicateObservations:0,skippedRecords:0,inheritedRecords:0,sessions:0};
  const abort=()=>{if(options.signal?.aborted)throw new Error('Scan cancelled.');};
  const files=new Set<string>();
  async function walk(root:string,depth=0){abort();if(depth>24){gaps.add('Some directories exceeded the scan depth limit.');return;}try{for(const e of await readdir(root,{withFileTypes:true})){abort();if(e.isSymbolicLink())continue;const p=join(root,e.name);if(e.isDirectory())await walk(p,depth+1);else if(e.isFile()&&/\.jsonl(?:\.zst|\.gz)?$/.test(e.name)){if(files.size>=20000)throw new Error('file limit');files.add(p);}}}catch{abort();gaps.add('A source directory is unavailable or exceeds the file limit.');}}
  for(const root of roots)await walk(root);
  for(const path of [...files].sort()){
    abort();coverage.files++;const compressed=/\.(zst|gz)$/.test(path);compressed?coverage.compressedFiles++:coverage.plainFiles++;
    let id:string|null=null;let parent:string|null=null;let startOrdinal:number|null=null;let inheritedParent:string|null=null;let conflict=false;
    let file:any;let child:ReturnType<typeof spawn>|undefined;let stream:any;let childDone:Promise<void>|undefined;
    const stop=()=>{stream?.destroy();child?.kill('SIGTERM');};
    try{
      file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=await file.stat();if(!stat.isFile())throw new Error('not regular');
      const input=file.createReadStream({autoClose:false,highWaterMark:65536});stream=input;
      if(path.endsWith('.gz'))stream=input.pipe(zlib.createGunzip());
      if(path.endsWith('.zst')){
        const native=(zlib as any).createZstdDecompress;
        if(native)stream=input.pipe(native());
        else {
          input.destroy();
          const binary=process.env.LENS_ZSTD_BINARY||'/opt/homebrew/bin/zstd';
          child=spawn(binary,['-dc','--no-progress'],{stdio:[file.fd,'pipe','ignore']});
          childDone=new Promise<void>((resolve,reject)=>{child!.on('error',reject);child!.on('close',code=>code===0?resolve():reject(new Error('compressed source failed')));});
          // Attach a handler immediately; await the same rejection after stdout drains.
          void childDone.catch(()=>{});stream=child.stdout;
        }
      }
      if(stream!==input)input.on('error',(error:Error)=>stream?.destroy(error));
      options.signal?.addEventListener('abort',stop,{once:true});
      const decoder=new StringDecoder('utf8');let parts:string[]=[];let lineBytes=0;let dropping=false;
      function consume(line:string){
        if(!line.trim())return;
        // Parse only metadata and usage records; prompt text is never retained.
        if(!line.includes('"session_meta"')&&!line.includes('"token_count"')&&!line.includes('"token_usage_record"'))return;
        let row:any;try{row=JSON.parse(line);}catch{coverage.skippedRecords++;gaps.add('Malformed telemetry records were skipped.');return;}
        const p=row?.payload;if(!p||typeof p!=='object'||conflict)return;
        const ordinal=integer(row.ordinal)?row.ordinal:null;
        if(row.type==='session_meta'){
          if(!validId(p.id)){coverage.skippedRecords++;gaps.add('A source has no valid session identity.');return;}
          if(!id){id=p.id;const sourceParent=p.source?.subagent?.thread_spawn?.parent_thread_id;parent=validId(sourceParent)?sourceParent:validId(p.parent_thread_id)?p.parent_thread_id:validId(p.forked_from_id)?p.forked_from_id:null;
            if(validId(p.forked_from_id)&&parent===p.forked_from_id&&p.parent_thread_id===p.forked_from_id&&sourceParent===p.forked_from_id&&integer(p.subagent_history_start_ordinal)&&ordinal!==null&&p.subagent_history_start_ordinal>ordinal){startOrdinal=p.subagent_history_start_ordinal;inheritedParent=p.forked_from_id;}
          }else if(startOrdinal!==null&&ordinal!==null&&ordinal<startOrdinal&&p.id===inheritedParent){coverage.inheritedRecords++;return;}
          else if(id!==p.id){conflict=true;gaps.add('A source contains conflicting session identities.');return;}
          let run=runs.get(id!);if(!run){run={id:id!,parent,project:null,label:'Unknown project',events:new Map(),gaps:new Set()};runs.set(id!,run);}
          if(run.parent!==parent)run.gaps.add('Conflicting parent metadata.');
          const proj=project(p.cwd)??project(p.runtime_workspace_roots?.[0]);
          if(proj){if(run.project&&run.project!==proj.id){run.project='ambiguous';run.label='Conflicting project';run.gaps.add('Conflicting project metadata.');}else{run.project=proj.id;run.label=proj.label;}}
          return;
        }
        if(!id||!runs.has(id)){gaps.add('Usage without a valid session header was withheld.');return;}
        if(startOrdinal!==null){if(ordinal===null){coverage.skippedRecords++;runs.get(id)!.gaps.add('Child record lacks the ordinal needed to separate inherited history.');return;}if(ordinal<startOrdinal){coverage.inheritedRecords++;return;}}
        const kind=row.type==='event_msg'?p.type:row.type;if(kind!=='token_count'&&kind!=='token_usage_record')return;
        if(p.thread_id!==undefined&&p.thread_id!==id){coverage.skippedRecords++;runs.get(id)!.gaps.add('Usage record identity mismatch.');return;}
        const ms=Date.parse(row.timestamp);if(!Number.isFinite(ms)){coverage.skippedRecords++;runs.get(id)!.gaps.add('Usage record has no valid time.');gaps.add('Untimed usage records were withheld.');return;}
        const total=usage(kind==='token_count'?p.info?.total_token_usage:p.thread_token_usage),latest=usage(kind==='token_count'?p.info?.last_token_usage:p.usage);
        if(!total&&!latest){if(kind==='token_usage_record'||p.info){coverage.skippedRecords++;runs.get(id)!.gaps.add('Invalid usage fields were skipped.');gaps.add('Invalid usage records were withheld.');}return;}
        const time=new Date(ms).toISOString();const key=JSON.stringify([kind,typeof p.response_id==='string'?p.response_id:null,time,total,latest]);const run=runs.get(id)!;
        if(run.events.has(key)){coverage.duplicateObservations++;return;}
        if(eventCount>=1000000){gaps.add('Observation limit reached; totals are incomplete.');coverage.skippedRecords++;return;}
        eventCount++;run.events.set(key,{time,total,latest,key,response:typeof p.response_id==='string'?p.response_id:null,kind,ordinal});
      }
      function frame(text:string,final=false){let offset=0;for(;;){const newline=text.indexOf('\n',offset);const piece=newline<0?text.slice(offset):text.slice(offset,newline);if(!dropping){lineBytes+=Buffer.byteLength(piece);if(lineBytes>8*1024*1024){parts=[];dropping=true;}else parts.push(piece);}if(newline<0){if(final&&(lineBytes||dropping)){if(!dropping)consume(parts.join(''));else{coverage.skippedRecords++;gaps.add('Oversized telemetry records were skipped.');}}break;}if(!dropping)consume(parts.join(''));else{coverage.skippedRecords++;gaps.add('Oversized telemetry records were skipped.');}parts=[];lineBytes=0;dropping=false;offset=newline+1;}}
      for await(const chunk of stream){abort();frame(decoder.write(chunk));await new Promise<void>(r=>setImmediate(r));}
      frame(decoder.end(),true);
      if(childDone)await childDone;
      if(!id)gaps.add('A source has no valid session header; no usage was attributed.');
    }catch{abort();gaps.add(compressed?'A compressed source could not be decoded completely. Install zstd for Node versions without native support.':'A telemetry source could not be read completely.');}
    finally{options.signal?.removeEventListener('abort',stop);stop();await file?.close().catch(()=>{});}
    options.onProgress?.(coverage.files);
  }
  abort();
  const result:WeeklySession[]=[];
  for(const run of runs.values()){
    const parentRun=run.parent?runs.get(run.parent):undefined;
    // Legacy forks without ordinal boundaries can repeat parent observations.
    const raw=[...run.events.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.key.localeCompare(b.key));
    const responses=new Map<string,Event>();const conflictingResponses=new Set<string>();for(const e of raw)if(e.kind==='token_usage_record'&&e.response){const old=responses.get(e.response);if(old&&JSON.stringify(old.latest)!==JSON.stringify(e.latest))conflictingResponses.add(e.response);else responses.set(e.response,e);}
    if(conflictingResponses.size)run.gaps.add('Conflicting usage for one response was withheld.');
    const seenResponses=new Set<string>();const events=raw.filter(e=>{
      if(e.kind==='token_usage_record'&&e.response){if(conflictingResponses.has(e.response))return false;if(seenResponses.has(e.response)){coverage.duplicateObservations++;return false;}seenResponses.add(e.response);}
      return true;
    });
    const modern=events.filter(e=>e.kind==='token_usage_record');const byOrdinal=modern.filter(e=>e.ordinal!==null).sort((a,b)=>a.ordinal!-b.ordinal!);const pairedModern=new Set<Event>();const pairedSnapshots=new Set<string>();
    function preceding(list:Event[],value:number,field:'ordinal'|'time'){let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;const n=field==='ordinal'?list[mid].ordinal!:Date.parse(list[mid].time);if(n<=value)lo=mid+1;else hi=mid;}return lo-1;}
    for(const e of events){if(e.kind!=='token_count')continue;
      const ordinalPair=e.ordinal!==null&&byOrdinal.length>0;const index=ordinalPair?preceding(byOrdinal,e.ordinal!-1,'ordinal'):preceding(modern,Date.parse(e.time),'time');
      const list=ordinalPair?byOrdinal:modern;const before=index>=0?list[index]:undefined;const after=!ordinalPair?list[index+1]:undefined;
      // Match only the closest preceding detailed response, with a bounded
      // same-time look-ahead for legacy logs without ordinals. Never search
      // backwards past intervening requests merely to find equal token counts.
      const candidates=[before,after&&Date.parse(after.time)-Date.parse(e.time)<=2000?after:undefined].filter((m):m is Event=>!!m&&!pairedModern.has(m)&&!!((e.latest&&m.latest&&equal(e.latest,m.latest))||(!e.latest&&e.total&&m.total&&equal(e.total,m.total))));
      const match=candidates[0];if(match){pairedModern.add(match);pairedSnapshots.add(e.key);coverage.duplicateObservations++;if(!ordinalPair&&Math.abs(Date.parse(e.time)-Date.parse(match.time))>30000)run.gaps.add('A distant legacy snapshot may mirror detailed usage; it was withheld to avoid counting it twice.');}
    }
    let previous:Event|null=null;let lastLegacyOnly:Event|null=null;const legacySinceTotal=zero();const modernSinceLegacy=zero();const totals=zero();let first:string|null=null,last:string|null=null,observations=0;let relevant=false;
    const conflicts=new Set<string>();const atTime=new Map<string,Usage>();for(const e of events){if(e.kind==='token_count'&&e.total){const old=atTime.get(e.time);if(old&&!equal(old,e.total))conflicts.add(e.time);else atTime.set(e.time,e.total);}}
    for(const e of events){
      const day=dateKey(formatter,e.time);if(day>=startDate&&day<=endDate)relevant=true;let delta:Usage|null=null;
      if(e.kind==='token_usage_record'){
        delta=e.latest;
        if(!delta)run.gaps.add('A detailed response has no valid per-request usage; it was withheld.');
        else add(modernSinceLegacy,delta);
      }else{
        if(conflicts.has(e.time)){run.gaps.add('Conflicting cumulative snapshots at the same time were withheld.');previous=null;continue;}
        if(pairedSnapshots.has(e.key)){if(e.total)previous=e;modernSinceLegacy.input=0;modernSinceLegacy.output=0;modernSinceLegacy.cached=0;legacySinceTotal.input=0;legacySinceTotal.output=0;legacySinceTotal.cached=0;continue;}
        if(e.total){
          if(previous?.total){delta=difference(e.total,previous.total);if(!delta){run.gaps.add('Cumulative counters decreased; used the last request where available.');delta=e.latest;}
            else if(modernSinceLegacy.input||modernSinceLegacy.output||modernSinceLegacy.cached){delta=difference(delta,modernSinceLegacy);if(!delta)run.gaps.add('Detailed and legacy observations overlap ambiguously; legacy delta withheld.');}
          }else{delta=e.latest;if(e.latest&&!equal(e.total,e.latest))run.gaps.add('Initial cumulative history has no baseline; only the last request is counted.');else if(!e.latest)run.gaps.add('Initial usage has no last-request evidence; its cumulative total was withheld.');}
          if(previous?.total&&delta&&(legacySinceTotal.input||legacySinceTotal.output||legacySinceTotal.cached)){delta=difference(delta,legacySinceTotal);if(!delta)run.gaps.add('Last-request-only and cumulative observations overlap ambiguously; delta withheld.');}
          else if(!previous?.total&&delta&&lastLegacyOnly?.latest&&equal(delta,lastLegacyOnly.latest)&&Math.abs(Date.parse(e.time)-Date.parse(lastLegacyOnly.time))<2000){delta=zero();}
          legacySinceTotal.input=0;legacySinceTotal.output=0;legacySinceTotal.cached=0;
          if(previous&&day>=startDate&&dateKey(formatter,previous.time)<startDate&&delta&&(delta.input||delta.output||delta.cached)&&(!e.latest||!equal(delta,e.latest))){run.gaps.add('A cumulative delta spans the date boundary; only its last request is counted, or the delta is withheld when that request is unknown.');delta=e.latest;}
        }else{delta=e.latest;if(delta){add(legacySinceTotal,delta);lastLegacyOnly=e;}run.gaps.add('Last-request-only observations may omit intermediate usage.');}
        modernSinceLegacy.input=0;modernSinceLegacy.output=0;modernSinceLegacy.cached=0;
        if(e.total)previous=e;
      }
      if(delta&&delta.cached>delta.input){run.gaps.add('Invalid cached-input delta was withheld.');delta=null;}
      if(day>=startDate&&day<=endDate&&delta){add(totals,delta);first??=e.time;last=e.time;observations++;}
    }
    if(relevant){let projectId=run.project,projectLabel=run.label;const seen=new Set<string>([run.id]);let ancestor=parentRun;while(!projectId&&ancestor&&!seen.has(ancestor.id)){seen.add(ancestor.id);projectId=ancestor.project;projectLabel=ancestor.label;ancestor=ancestor.parent?runs.get(ancestor.parent):undefined;}
      if(!projectId){projectId='unknown';projectLabel='Unknown project';run.gaps.add('Project metadata is missing.');}
      if(run.parent&&!parentRun)run.gaps.add('Parent session is absent from scanned sources.');
      result.push({id:run.id,parentId:run.parent,projectId,projectLabel,totals,descendantTotals:zero(),firstActivity:first,lastActivity:last,observations,gaps:[...run.gaps]});
    }
  }
  const included=new Set(result.map(s=>s.id));for(let i=0;i<result.length;i++){const child=result[i];if(child.parentId&&!included.has(child.parentId)){const parent=runs.get(child.parentId);if(parent){included.add(parent.id);result.push({id:parent.id,parentId:parent.parent,projectId:parent.project??child.projectId,projectLabel:parent.project?parent.label:child.projectLabel,totals:zero(),descendantTotals:zero(),firstActivity:null,lastActivity:null,observations:0,gaps:[]});}}}
  const byId=new Map(result.map(s=>[s.id,s]));for(const s of result){const seen=new Set([s.id]);let p=s.parentId;while(p&&!seen.has(p)){seen.add(p);const ancestor=byId.get(p);if(!ancestor)break;add(ancestor.descendantTotals,s.totals);p=ancestor.parentId;}}
  const projects=new Map<string,WeeklyReport['projects'][number]>();const totals=zero();for(const s of result){add(totals,s.totals);let p=projects.get(s.projectId);if(!p){p={id:s.projectId,label:s.projectLabel,totals:zero(),sessions:[]};projects.set(s.projectId,p);}add(p.totals,s.totals);p.sessions.push(s);}
  coverage.sessions=result.length;if(result.some(s=>s.gaps.length))gaps.add('Some sessions have accounting or attribution gaps; inspect session details.');
  for(const p of projects.values())p.sessions.sort((a,b)=>(b.totals.input+b.totals.output)-(a.totals.input+a.totals.output));
  return {startDate,endDate,timeZone,scannedAt:new Date().toISOString(),totals,projects:[...projects.values()].sort((a,b)=>(b.totals.input+b.totals.output)-(a.totals.input+a.totals.output)),gaps:[...gaps],coverage};
}
