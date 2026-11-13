#!/usr/bin/env python3
# Author: Ethan. Compare a frozen independent answer with a completed product report.
import argparse,collections,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--oracle',required=True);p.add_argument('--product',required=True);p.add_argument('--output',required=True);a=p.parse_args();o=json.loads(Path(a.oracle).read_text());r=json.loads(Path(a.product).read_text());product=r.get('report',r)
def uv(v):return [v[k] for k in ['input','output','cached']]
os={s['id']:s for p in o['projects']for s in p['sessions']};ps={s['id']:s for p in product['projects'] for s in p['sessions']};diffs=[]
for sid in sorted(os.keys()|ps.keys()):
 x=os.get(sid);y=ps.get(sid)
 if x is None or y is None:
  # Some products retain zero-usage sessions for explainable gaps.
  if x is None and uv(y['totals'])==[0,0,0]:continue
  diffs.append({'sessionId':sid,'kind':'presence','oracle':x and x['own'],'product':y and uv(y['totals'])});continue
 if x['own']!=uv(y['totals']):diffs.append({'sessionId':sid,'kind':'usage','oracle':x['own'],'product':uv(y['totals'])})
 if x['parentId']!=y['parentId']:diffs.append({'sessionId':sid,'kind':'parent','oracle':x['parentId'],'product':y['parentId']})
children=collections.defaultdict(list)
for sid,s in os.items():children[s['parentId']].append(sid)
def descendants(sid,seen):
 if sid in seen:raise ValueError('Oracle parent cycle')
 result=[0,0,0]
 for child in children[sid]:
  other=descendants(child,seen|{sid})
  result=[a+b+c for a,b,c in zip(result,os[child]['own'],other)]
 return result
desc_diffs=[]
for sid in os.keys()&ps.keys():
 expected=descendants(sid,set())
 if expected!=uv(ps[sid]['descendantTotals']):desc_diffs.append({'sessionId':sid,'oracle':expected,'product':uv(ps[sid]['descendantTotals'])})
# Compare project membership rather than assuming both algorithms use the same hash length.
op={tuple(sorted(s['id'] for s in p['sessions'])):p for p in o['projects']}
pp={tuple(sorted(s['id'] for s in p['sessions']if any(uv(s['totals'])))):p for p in product['projects']if any(uv(p['totals']))};pd=[]
for ids in op.keys()|pp.keys():
 x=op.get(ids);y=pp.get(ids)
 if x is None or y is None or x['usage']!=uv(y['totals']):pd.append({'sessionIds':ids,'oracle':x and x['usage'],'product':y and uv(y['totals'])})
result={'author':'Ethan','oracleSha256':hashlib.sha256(Path(a.oracle).read_bytes()).hexdigest(),'productSha256':hashlib.sha256(Path(a.product).read_bytes()).hexdigest(),'oracleTotals':o['total'],'productTotals':uv(product['totals']),'totalMatch':o['total']==uv(product['totals']),'oracleActiveSessions':len(os),'productSessions':len(ps),'sessionDifferences':diffs,'descendantDifferences':desc_diffs,'projectDifferences':pd,'oracleIssues':o['issues'],'productGaps':product['gaps'],'productCoverage':product['coverage']};out=Path(a.output);out.write_text(json.dumps(result,indent=2)+'\n');out.chmod(0o600);print(json.dumps({k:result[k]for k in ['totalMatch','oracleTotals','productTotals','oracleActiveSessions','productSessions']}));print('sessionDifferences',len(diffs),'projectDifferences',len(pd),'descendantDifferences',len(desc_diffs));raise SystemExit(0 if result['totalMatch'] and not diffs and not pd and not desc_diffs else 1)
