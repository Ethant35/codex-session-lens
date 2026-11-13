# Author: Ethan
import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('oracle',Path(__file__).with_name('oracle.py'));oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def u(i,o,c):return dict(zip(oracle.FIELDS,(i,o,c)))
def meta(sid,**extra):return {'type':'session_meta','ordinal':0,'timestamp':'2026-11-01T01:00:00Z','payload':{'id':sid,'cwd':'/fixture/project',**extra}}
def rec(sid,r,ts,i,o,c,ordinal=10,total=None):return {'type':'token_usage_record','timestamp':ts,'ordinal':ordinal,'payload':{'thread_id':sid,'response_id':r,'usage':u(i,o,c),'thread_token_usage':u(*(total or (i,o,c)))}}
def snap(ts,i,o,c,ordinal=10):return {'type':'event_msg','timestamp':ts,'ordinal':ordinal,'payload':{'type':'token_count','info':{'total_token_usage':u(i,o,c)}}}
snap_fn=snap
class OracleChecks(unittest.TestCase):
 def run_logs(self,logs,compressed_copy=False):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)
   for name,rows in logs.items():(root/(name+'.jsonl')).write_text(''.join(json.dumps(r)+'\n' for r in rows))
   if compressed_copy:subprocess.run(['zstd','-q',str(root/'parent.jsonl'),'-o',str(root/'parent.jsonl.zst')],check=True)
   return oracle.scan([root],'2026-11-02','2026-11-08','America/Los_Angeles')
 def test_inclusive_week_crosses_boundary_and_prior_legacy_baseline(self):
  # Pacific range begins 08:00Z Nov2 and ends08:00Z Nov9 (DST is already over).
  r=self.run_logs({'old':[meta('old'),snap('2026-11-02T07:59:59Z',100,10,50),snap('2026-11-02T08:00:00Z',130,13,60),snap('2026-11-09T08:00:00Z',190,19,90)]})
  self.assertEqual(r['total'],[30,3,10])
 def test_child_inherited_rows_and_plain_compressed_copies(self):
  p=rec('parent','p1','2026-11-03T10:00:00Z',100,10,50)
  c=rec('child','c1','2026-11-03T11:00:00Z',15,2,8,ordinal=7,total=(115,12,58))
  r=self.run_logs({'parent':[meta('parent'),p,snap('2026-11-03T10:00:00.001Z',100,10,50)],'child':[meta('child',session_id='parent',forked_from_id='parent',source={'subagent':{'thread_spawn':{'parent_thread_id':'parent'}}},parent_thread_id='parent',subagent_history_start_ordinal=5),meta('parent'),{**p,'ordinal':3},c,snap('2026-11-03T11:00:00.001Z',115,12,58,8)]},True)
  self.assertEqual(r['total'],[115,12,58]);self.assertEqual(r['coverage']['inheritedRecordCopiesExcluded'],1)
  self.assertEqual({s['id']:s['own'] for s in r['projects'][0]['sessions']},{'child':(15,2,8),'parent':(100,10,50)})
 def test_delayed_snapshot_and_inconsistent_cumulative_channel(self):
  snap=snap_fn('2026-11-03T10:00:06Z',90,9,40,11);snap['payload']['info']['last_token_usage']=u(100,10,50)
  r=self.run_logs({'parent':[meta('parent'),rec('parent','p','2026-11-03T10:00:00Z',100,10,50,10),snap]})
  self.assertEqual(r['total'],[100,10,50])
 def test_resumed_stale_snapshot_does_not_recharge_last_request(self):
  old=snap('2026-10-14T23:29:32Z',100,10,50,20);old['payload']['info']['last_token_usage']=u(30,3,20)
  repeated={**old,'timestamp':'2026-11-05T23:59:11Z','ordinal':21}
  r=self.run_logs({'parent':[meta('parent'),old,repeated,rec('parent','new','2026-11-05T23:59:24Z',40,4,30,22,(140,14,80))]})
  self.assertEqual(r['total'],[40,4,30])
 def test_modern_boundary_and_dual_telemetry(self):
  r=self.run_logs({'parent':[meta('parent'),rec('parent','before','2026-11-02T07:59:59Z',100,10,50),snap('2026-11-02T07:59:59.001Z',100,10,50),rec('parent','inside','2026-11-02T08:00:00Z',30,3,10,total=(130,13,60)),snap('2026-11-02T08:00:00.001Z',130,13,60),rec('parent','after','2026-11-09T08:00:00Z',60,6,30,total=(190,19,90))]},True)
  self.assertEqual(r['total'],[30,3,10])
if __name__=='__main__':unittest.main()
