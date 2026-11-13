#!/usr/bin/env python3
# Author: Ethan. Direct per-response audit for fixed known raw runs, no Lens imports.
import argparse,datetime as dt,hashlib,json,subprocess
from pathlib import Path
from zoneinfo import ZoneInfo
args=argparse.ArgumentParser();args.add_argument('--session',action='append',required=True);ids=args.parse_args().session;lo=dt.datetime(2026,11,2,tzinfo=ZoneInfo('America/Los_Angeles')).timestamp();hi=dt.datetime(2026,11,9,tzinfo=ZoneInfo('America/Los_Angeles')).timestamp();result=[]
for sid in ids:
 p=next(p for n in ['sessions','archived_sessions'] for p in (Path.home()/'.codex'/n).rglob('*'+sid+'.jsonl*'))
 proc=subprocess.Popen(['zstd','-dc',str(p)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) if p.suffix=='.zst' else None;f=proc.stdout if proc else p.open('rb');head=None;own={};before=0;inherited=0;h=hashlib.sha256()
 for line in f:
  h.update(line)
  if not any(x in line for x in [b'"session_meta"',b'"token_usage_record"',b'"token_count"']):continue
  try:o=json.loads(line)
  except:continue
  v=o.get('payload',{})
  if o.get('type')=='session_meta' and head is None:head={k:v.get(k) for k in ['id','parent_thread_id','forked_from_id','subagent_history_start_ordinal']}
  if o.get('type')=='event_msg' and v.get('type')=='token_count' and head and isinstance(head.get('subagent_history_start_ordinal'),int) and o.get('ordinal',float('inf'))<head['subagent_history_start_ordinal']:inherited+=1
  if o.get('type')!='token_usage_record' or v.get('thread_id')!=sid:continue
  ts=dt.datetime.fromisoformat(o['timestamp'].replace('Z','+00:00')).timestamp()
  if ts<lo:before+=1
  if not lo<=ts<hi:continue
  u=v['usage'];vals=[u[k] for k in ['input_tokens','output_tokens','cached_input_tokens']];own[v.get('response_id')or str((ts,vals))]=vals
 f.close()
 if proc:assert proc.wait()==0
 result.append({'sessionId':sid,'firstHeader':head,'rawDecodedSha256':h.hexdigest(),'beforeWeekModernRecords':before,'selectedWeekUniqueResponses':len(own),'inheritedTokenCountRows':inherited,'selectedWeekUsage':[sum(u[k] for u in own.values())for k in range(3)]})
out=Path('.local/weekly-verification/selected-raw-proofs.json');out.write_text(json.dumps({'author':'Ethan','proofs':result},indent=2)+'\n');out.chmod(0o600);print(json.dumps(result))
