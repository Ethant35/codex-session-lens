#!/usr/bin/env python3
"""Author: Ethan. Independent raw-log oracle; never imports the Lens implementation."""
import argparse, collections, datetime as dt, gzip, hashlib, json, os, subprocess, sys
from pathlib import Path
from zoneinfo import ZoneInfo
FIELDS=('input_tokens','output_tokens','cached_input_tokens')
def usage(v):
 if not isinstance(v,dict) or any(not isinstance(v.get(k),int) or isinstance(v.get(k),bool) or v[k]<0 for k in FIELDS):return None
 return tuple(v[k] for k in FIELDS)
def plus(a,b):return tuple(x+y for x,y in zip(a,b))
def stamp(s):
 try:return dt.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
 except:return None
def scan(roots,start,end,tz):
 zone=ZoneInfo(tz); lo=dt.datetime.combine(dt.date.fromisoformat(start),dt.time(),zone).timestamp();hi=dt.datetime.combine(dt.date.fromisoformat(end)+dt.timedelta(days=1),dt.time(),zone).timestamp()
 files=sorted({p for root in roots for p in Path(root).rglob('*') if p.is_file() and p.name.endswith(('.jsonl','.jsonl.zst','.jsonl.gz'))})
 sessions={}; rows={}; snapshots=collections.defaultdict(dict); manifests=[]; issues=collections.Counter();copies=collections.Counter(); inherited=0
 for fi,p in enumerate(files):
  before=p.stat(); digest=hashlib.sha256();proc=None
  if p.suffix=='.zst':proc=subprocess.Popen(['zstd','-dc',str(p)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL);stream=proc.stdout
  elif p.suffix=='.gz':stream=gzip.open(p,'rb')
  else:stream=p.open('rb')
  meta=None; sid=None; boundary=None;project='Unknown project';project_key='unknown';parent=None;line_no=0
  try:
   for line in stream:
    line_no+=1;digest.update(line)
    if not any(b in line for b in (b'"session_meta"',b'"token_usage_record"',b'"token_count"')):continue
    try:o=json.loads(line)
    except:issues['malformed_candidate_rows']+=1;continue
    t=o.get('type');v=o.get('payload',{})
    if not isinstance(v,dict):continue
    if t=='session_meta' and meta is None:
     meta=v;sid=v.get('id') or v.get('session_id');boundary=v.get('subagent_history_start_ordinal');parent=v.get('parent_thread_id') or v.get('forked_from_id')
     cwd=v.get('cwd');project=Path(cwd).name if isinstance(cwd,str) else 'Unknown project';project_key=hashlib.sha256(cwd.encode()).hexdigest()[:16] if isinstance(cwd,str) else 'unknown'
     if sid:
      existing=sessions.get(sid)
      if existing and existing['projectKey']!=project_key:issues['conflicting_project_metadata']+=1
      sessions.setdefault(sid,{'id':sid,'project':project,'projectKey':project_key,'parentId':parent,'own':(0,0,0),'modern':0,'legacy':0,'gaps':[]})
      copies[sid]+=1
     continue
    if not sid:continue
    ts=stamp(o.get('timestamp',''))
    if ts is None:issues['usage_rows_missing_timestamp']+=int(t=='token_usage_record' or v.get('type')=='token_count');continue
    if t=='token_usage_record':
     owner=v.get('thread_id') or sid
     if owner!=sid or isinstance(boundary,int) and isinstance(o.get('ordinal'),int) and o['ordinal']<boundary:inherited+=1;continue
     u=usage(v.get('usage'));total=usage(v.get('thread_token_usage'));response=v.get('response_id')
     if u is None:issues['invalid_record_usage']+=1;continue
     key=(sid,response or ('fallback',ts,u))
     if key in rows and rows[key][1]!=u:issues['conflicting_response_usage']+=1;continue
     rows[key]=(ts,u,total,o.get('ordinal'))
    elif t=='event_msg' and v.get('type')=='token_count':
     info=v.get('info');u=usage(info.get('total_token_usage')) if isinstance(info,dict) else None
     if u is None:continue
     own=not(isinstance(boundary,int) and isinstance(o.get('ordinal'),int) and o['ordinal']<boundary) and not (parent and stamp(meta.get('timestamp','')) is not None and ts<stamp(meta['timestamp']))
     snapshots[sid][(ts,u)]=(own,usage(info.get('last_token_usage')),o.get('ordinal'))
  except (OSError,EOFError):issues['unreadable_or_invalid_stream']+=1
  finally:
   stream.close()
   if proc and proc.wait()!=0:issues['zstd_decode_failures']+=1
  after=p.stat();stable=(before.st_size,before.st_mtime_ns)==(after.st_size,after.st_mtime_ns)
  if not stable:issues['source_changed_during_read']+=1
  manifests.append({'source':hashlib.sha256(str(p).encode()).hexdigest(),'bytes':before.st_size,'mtimeNs':before.st_mtime_ns,'decodedSha256':digest.hexdigest(),'stable':stable,'sessionId':sid})
  if (fi+1)%100==0:print(f'oracle scanned {fi+1}/{len(files)}',file=sys.stderr,flush=True)
 modern=collections.defaultdict(list)
 for (sid,_),(ts,u,total,ordinal) in rows.items():modern[sid].append((ts,u,total,ordinal))
 for sid,s in sessions.items():
  recs=modern[sid]
  for ts,u,total,ordinal in recs:
   if lo<=ts<hi:s['own']=plus(s['own'],u);s['modern']+=1
  prev=(0,0,0);last_ts=None
  for (ts,u),(own,last_usage,snap_ordinal) in sorted(snapshots[sid].items()):
   delta=tuple(x-y for x,y in zip(u,prev))
   predecessors=[r for r in recs if isinstance(snap_ordinal,int) and isinstance(r[3],int) and r[3]<snap_ordinal]
   prior=max(predecessors,key=lambda r:r[3]) if predecessors else None
   paired=any(total==u for rt,usage_,total,ordinal in recs) or bool(prior and prior[1]==last_usage)
   if own and lo<=ts<hi and not paired and u!=prev:
    if min(delta)<0:issues['legacy_counter_reset_or_conflict']+=1;s['gaps'].append('counter reset')
    elif last_ts is None:issues['initial_cumulative_baseline_unknown']+=1;s['gaps'].append('initial cumulative baseline unknown; only last request included');s['own']=plus(s['own'],last_usage or (0,0,0));s['legacy']+=int(last_usage is not None)
    elif recs:issues['unpaired_snapshot_with_modern_records']+=1;s['gaps'].append('snapshot without matching response; delta included');s['own']=plus(s['own'],delta);s['legacy']+=1
    else:s['own']=plus(s['own'],delta);s['legacy']+=1
   prev=u;last_ts=ts
  if s['parentId'] and not recs and s['legacy']:s['gaps'].append('legacy child history ownership relies on ordinal marker')
 active=[s for s in sessions.values() if any(s['own'])];projects={}
 for s in active:
  p=projects.setdefault(s['projectKey'],{'key':s['projectKey'],'name':s['project'],'usage':(0,0,0),'sessions':[]});p['usage']=plus(p['usage'],s['own']);p['sessions'].append(s)
 return {'author':'Ethan','range':{'start':start,'end':end,'timezone':tz,'startEpoch':lo,'endExclusiveEpoch':hi},'fields':FIELDS,'total':list(map(sum,zip(*(s['own'] for s in active)))) if active else [0,0,0],'projects':sorted(projects.values(),key=lambda p:sum(p['usage'][:2]),reverse=True),'issues':dict(issues),'coverage':{'files':len(files),'sessions':len(sessions),'activeSessions':len(active),'modernResponseRecords':len(rows),'inheritedRecordCopiesExcluded':inherited,'sessionsWithMultipleCopies':sum(n>1 for n in copies.values())},'manifest':manifests,'limits':['Recorded usage, not billing or allowance.','Full original cwd distinguishes project keys; display labels use basename.','Legacy cumulative increases are attributed at observation timestamp; exact work time between observations is unknown.','Unknown missing files/events cannot be quantified.']}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--source',action='append',required=True);a.add_argument('--start',required=True);a.add_argument('--end',required=True);a.add_argument('--timezone',default='America/Los_Angeles');a.add_argument('--output',required=True);v=a.parse_args();result=scan(v.source,v.start,v.end,v.timezone);out=Path(v.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2)+'\n');out.chmod(0o600);print(json.dumps({k:result[k] for k in ['total','issues','coverage']}));print(json.dumps([{'project':p['name'],'key':p['key'],'usage':p['usage'],'sessions':len(p['sessions'])} for p in result['projects'][:15]]))
