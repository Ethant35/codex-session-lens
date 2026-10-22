import type {Session,Usage,Provenance} from '../shared';

// Only allowlisted telemetry is persisted. No source payloads or message text.
export interface Observation {
  key:string; session:string; provenance:Provenance; legacy?:boolean;
  model?:string|null; parent?:string|null; status?:string;
  total?:Usage|null; latest?:Usage|null; context?:Session['context'];
  boundary?:boolean; compaction?:boolean; warning?:string;
}

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const unique=(values:unknown[])=>values.every(v=>same(v,values[0]));

export function project(id:string,observations:Observation[]):Session {
  const ordered=[...observations].sort((a,b)=>a.provenance.timestamp.localeCompare(b.provenance.timestamp) || a.key.localeCompare(b.key));
  const s:Session={id,model:null,lastActivity:ordered.at(-1)!.provenance.timestamp,status:'Unavailable',total:null,latest:null,context:null,compactions:[],parentId:null,provenance:null,sources:{},warnings:[]};
  const warn=(message:string)=>{if(!s.warnings.includes(message))s.warnings.push(message);};
  let retained:Usage|null=null;
  let retainedSource:Provenance|null=null;
  for(let start=0;start<ordered.length;){
    let end=start+1;
    while(end<ordered.length && ordered[end].provenance.timestamp===ordered[start].provenance.timestamp)end++;
    const group=ordered.slice(start,end);start=end;
    // A real observation replaces an upgrade seed for the same metric and time.
    const field=(name:keyof Observation)=>{
      const candidates=group.filter(o=>o[name]!==undefined);
      const live=candidates.filter(o=>!o.legacy);
      return live.length ? live : candidates;
    };
    for(const [name,target] of [['model','model'],['parent','parentId'],['status','status']] as const){
      const values=field(name);if(!values.length)continue;
      if(unique(values.map(o=>o[name]))){
        (s as any)[target]=values[0][name];s.sources![name]=values[0].provenance;
      }else{
        (s as any)[target]=name==='status'?'Unavailable':null;delete s.sources![name];
        warn(`Conflicting ${name} records share a timestamp. The value is unavailable until newer evidence arrives.`);
      }
    }
    const totals=field('total').filter(o=>o.total!==null);
    if(totals.length){
      if(!unique(totals.map(o=>o.total))){
        s.total=null;s.provenance=null;
        warn('Conflicting cumulative records share a timestamp. Totals are unavailable until newer evidence arrives.');
      }else{
        const value=totals[0].total!;
        if(retained && (value.input<retained.input || value.output<retained.output || value.cached<retained.cached)){
          warn('Cumulative counter decreased. Prior totals retained; total coverage is uncertain.');
          s.total=retained;s.provenance=retainedSource;
        }else{
          s.total=retained=value;s.provenance=retainedSource=totals[0].provenance;
        }
      }
    }
    const latest=field('latest');
    if(latest.length){
      s.latest=unique(latest.map(o=>o.latest))?latest[0].latest!:null;
      s.context=s.latest && unique(latest.map(o=>o.context??null)) ? latest[0].context??null : null;
      if(s.latest)s.sources!.latest=latest[0].provenance;else delete s.sources!.latest;
      if(!unique(latest.map(o=>o.latest)))warn('Conflicting latest usage records share a timestamp. Latest usage is unavailable until newer evidence arrives.');
    }
    const compact=group.find(o=>o.compaction);
    if(compact)s.compactions.push({timestamp:compact.provenance.timestamp,provenance:compact.provenance});
    // A same-time boundary wins: the source gives no reliable cross-file order.
    if(group.some(o=>o.boundary || o.compaction))s.context=null;
    for(const o of group)if(o.warning)warn(o.warning);
  }
  return s;
}

export function upgradeObservations(s:Session):Observation[]{
  const fallback:Provenance={file:'local cache',line:0,event:'legacy_cache',timestamp:s.lastActivity};
  const seed=(name:string,provenance:Provenance,value:Partial<Observation>):Observation=>({key:`legacy:${s.id}:${name}`,session:s.id,provenance,legacy:true,...value});
  const out=[seed('activity',fallback,{})];
  if(s.model)out.push(seed('model',s.sources?.model??fallback,{model:s.model,boundary:true}));
  if(s.parentId)out.push(seed('parent',s.sources?.parent??fallback,{parent:s.parentId}));
  if(s.status!=='Unavailable')out.push(seed('status',s.sources?.status??fallback,{status:s.status,boundary:s.status==='Running'}));
  if(s.total)out.push(seed('total',s.provenance??fallback,{total:s.total}));
  if(s.latest)out.push(seed('latest',s.sources?.latest??fallback,{latest:s.latest,context:s.context}));
  for(const [i,c]of s.compactions.entries())out.push(seed(`compaction:${i}`,c.provenance,{compaction:true}));
  for(const [i,w]of s.warnings.entries())out.push(seed(`warning:${i}`,fallback,{warning:w}));
  // v1 did not persist all invalidation events. Preserve its unknown context
  // until a later sample, rather than revive an estimate after source removal.
  if(s.latest && !s.context)out.push(seed('boundary',fallback,{boundary:true}));
  out.push(seed('coverage',fallback,{warning:'Upgraded from a v1 cache. Missing source history cannot be reconstructed; retained values may have incomplete coverage.'}));
  return out;
}
