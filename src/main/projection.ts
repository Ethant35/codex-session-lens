import type {Session,Usage,Provenance} from '../shared';

// Only allowlisted telemetry is persisted. No source payloads or message text.
export interface Observation {
  key:string; session:string; provenance:Provenance; legacy?:boolean;
  model?:string|null; parent?:string|null; status?:string;
  total?:Usage|null; latest?:Usage|null; context?:Session['context'];
  boundary?:boolean; compaction?:boolean; warning?:string;
}

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

type Candidate={set:boolean;value:unknown;conflict:boolean;source?:Provenance};
const candidate=():Candidate=>({set:false,value:undefined,conflict:false});
function add(target:Candidate,value:unknown,source:Provenance){
  if(!target.set){target.set=true;target.value=value;target.source=source;return;}
  if(!same(target.value,value))target.conflict=true;
}
function valueOf(value:Candidate){return value.conflict?undefined:value.value;}

/** Incremental reducer for observations already ordered by timestamp, then key. */
export class ProjectionBuilder {
  private result:Session;
  private timestamp:string|null=null;
  private group: {
    fields:Map<string,{live:Candidate;legacy:Candidate}>;
    totals:{livePresent:boolean;legacyPresent:boolean;live:Candidate;legacy:Candidate};
    latest:{live:Candidate;legacy:Candidate;liveContext:Candidate;legacyContext:Candidate}|null;
    compact:Provenance|null;
    boundary:boolean;
    warnings:Set<string>;
  }|null=null;
  private retained:Usage|null=null;
  private retainedSource:Provenance|null=null;
  private count=0;

  constructor(id:string){
    this.result={id,model:null,lastActivity:'',status:'Unavailable',total:null,latest:null,context:null,compactions:[],parentId:null,provenance:null,sources:{},warnings:[]};
  }

  push(o:Observation){
    if(o.session!==this.result.id)throw new Error('Projection session mismatch');
    const time=o.provenance.timestamp;
    if(this.timestamp!==null && time<this.timestamp)throw new Error('Projection observations are not time ordered');
    if(this.timestamp!==time){this.flush();this.timestamp=time;this.group={fields:new Map(),totals:{livePresent:false,legacyPresent:false,live:candidate(),legacy:candidate()},latest:null,compact:null,boundary:false,warnings:new Set()};}
    const group=this.group!;this.count++;
    const addField=(name:keyof Observation)=>{
      const value=o[name];if(value===undefined)return;
      let pair=group.fields.get(name as string);
      if(!pair){pair={live:candidate(),legacy:candidate()};group.fields.set(name as string,pair);}
      add(o.legacy?pair.legacy:pair.live,value,o.provenance);
    };
    for(const name of ['model','parent','status'] as const)addField(name);
    if(o.total!==undefined){
      if(o.legacy)group.totals.legacyPresent=true;else group.totals.livePresent=true;
      if(o.total!==null)add(o.legacy?group.totals.legacy:group.totals.live,o.total,o.provenance);
    }
    if(o.latest!==undefined){
      if(!group.latest)group.latest={live:candidate(),legacy:candidate(),liveContext:candidate(),legacyContext:candidate()};
      const usageCandidate=o.legacy?group.latest.legacy:group.latest.live;
      const contextCandidate=o.legacy?group.latest.legacyContext:group.latest.liveContext;
      add(usageCandidate,o.latest,o.provenance);
      // The detailed usage record has no context-window field. It must not
      // veto a matching token_count estimate emitted at the same timestamp.
      // A group with only detailed records still invalidates the old estimate.
      if (o.provenance.event !== 'token_usage_record' || o.context != null) add(contextCandidate,o.context??null,o.provenance);
    }
    if(o.compaction && !group.compact)group.compact=o.provenance;
    if(o.boundary||o.compaction)group.boundary=true;
    if(o.warning)group.warnings.add(o.warning);
    this.result.lastActivity=time;
  }

  private chosen(name:string){
    const pair=this.group?.fields.get(name);if(!pair)return candidate();
    return pair.live.set?pair.live:pair.legacy;
  }

  private flush(){
    const group=this.group;if(!group||this.timestamp===null)return;
    const s=this.result;
    const setSimple=(name:'model'|'parent'|'status',target:'model'|'parentId'|'status')=>{
      const selected=this.chosen(name);if(!selected.set)return;
      if(!selected.conflict){(s as any)[target]=selected.value;s.sources![name]=selected.source;}
      else{
        (s as any)[target]=name==='status'?'Unavailable':null;delete s.sources![name];
        this.warn(`Conflicting ${name} records share a timestamp. The value is unavailable until newer evidence arrives.`);
      }
    };
    setSimple('model','model');setSimple('parent','parentId');setSimple('status','status');

    const totals=group.totals.livePresent?group.totals.live:group.totals.legacy;
    if(totals.set){
      if(totals.conflict){s.total=null;s.provenance=null;this.warn('Conflicting cumulative records share a timestamp. Totals are unavailable until newer evidence arrives.');}
      else{
        const value=totals.value as Usage;
        const source=totals.source!;
        if(this.retained && (value.input<this.retained.input || value.output<this.retained.output || value.cached<this.retained.cached)){
          this.warn('Cumulative counter decreased. Prior totals retained; total coverage is uncertain.');
          s.total=this.retained;s.provenance=this.retainedSource;
        }else{s.total=this.retained=value;s.provenance=this.retainedSource=source;}
      }
    }

    const latestPair=group.latest;
    if(latestPair){
      const selected=latestPair.live.set?latestPair.live:latestPair.legacy;
      const selectedContext=latestPair.live.set?latestPair.liveContext:latestPair.legacyContext;
      if(selected.conflict){s.latest=null;s.context=null;delete s.sources!.latest;this.warn('Conflicting latest usage records share a timestamp. Latest usage is unavailable until newer evidence arrives.');}
      else{
        s.latest=selected.value as Usage|null;
        s.context=s.latest&&selectedContext.set&&!selectedContext.conflict?selectedContext.value as Session['context']:null;
        if(s.latest)s.sources!.latest=s.context?selectedContext.source:selected.source;else delete s.sources!.latest;
      }
    }
    if(group.compact)s.compactions.push({timestamp:this.timestamp,provenance:group.compact});
    // A same-time boundary wins: the source gives no reliable cross-file order.
    if(group.boundary)s.context=null;
    for(const warning of group.warnings)this.warn(warning);
    this.group=null;
  }

  private warn(message:string){if(!this.result.warnings.includes(message))this.result.warnings.push(message);}

  finish(){
    this.flush();
    if(!this.count)throw new Error('Cannot project an empty observation set');
    return this.result;
  }
}

export function projectSorted(id:string,observations:Iterable<Observation>):Session{
  const builder=new ProjectionBuilder(id);for(const observation of observations)builder.push(observation);return builder.finish();
}

export function project(id:string,observations:Observation[]):Session {
  const ordered=[...observations].sort((a,b)=>compare(a.provenance.timestamp,b.provenance.timestamp)||compare(a.key,b.key));
  return projectSorted(id,ordered);
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
