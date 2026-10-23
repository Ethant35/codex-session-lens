import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Preferences, Session } from '../shared';
import {project,ProjectionBuilder,upgradeObservations,type Observation} from './projection';

const projectionYieldRows=256;
const yieldToEventLoop=()=>new Promise<void>(resolve=>setImmediate(resolve));
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const isCount=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=0;
const isIdentity=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const isTimestamp=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function isUsage(value:unknown){
  if(!isObject(value))return false;
  return isCount(value.input)&&isCount(value.output)&&isCount(value.cached)&&(value.cached as number)<=(value.input as number);
}
function isProvenance(value:unknown){
  return isObject(value)&&typeof value.file==='string'&&value.file.length<=1024&&isCount(value.line)&&
    typeof value.event==='string'&&value.event.length>0&&value.event.length<=128&&isTimestamp(value.timestamp);
}
function isContext(value:unknown){
  if(!isObject(value))return false;
  return isCount(value.used)&&isCount(value.limit)&&value.limit>0&&value.used<=value.limit&&
    typeof value.percent==='number'&&Number.isFinite(value.percent)&&value.percent>=0&&value.percent<=100&&value.kind==='estimate';
}
function isSession(value:unknown):value is Session{
  if(!isObject(value)||!isIdentity(value.id)||!(value.model===null||typeof value.model==='string'&&value.model.length<=120)||
    !isTimestamp(value.lastActivity)||!['Unavailable','Running','Completed','Interrupted'].includes(value.status as string)||
    !(value.total===null||isUsage(value.total))||!(value.latest===null||isUsage(value.latest))||
    !(value.parentId===null||isIdentity(value.parentId))||!(value.provenance===null||isProvenance(value.provenance))||
    !Array.isArray(value.warnings)||!value.warnings.every(w=>typeof w==='string'&&w.length<=1024)||!Array.isArray(value.compactions))return false;
  if(value.context!==null){
    const context=value.context;
    if(!isContext(context))return false;
  }
  if(!value.compactions.every(item=>isObject(item)&&isTimestamp(item.timestamp)&&isProvenance(item.provenance)))return false;
  if(value.sources!==undefined){
    const sources=value.sources;
    if(!isObject(sources)||Object.keys(sources).some(key=>!['model','latest','status','parent'].includes(key))||
      !Object.values(sources).every(isProvenance))return false;
  }
  return true;
}
function parseObservation(text:string):Observation{
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new SyntaxError('Invalid cached observation');}
  if(!isObject(value)||Object.keys(value).some(key=>!['key','session','provenance','legacy','model','parent','status','total','latest','context','boundary','compaction','warning'].includes(key))||
    typeof value.key!=='string'||value.key.length<1||value.key.length>256||!isIdentity(value.session)||!isProvenance(value.provenance)||
    (value.legacy!==undefined&&typeof value.legacy!=='boolean')||
    (value.model!==undefined&&value.model!==null&&(typeof value.model!=='string'||value.model.length>120))||
    (value.parent!==undefined&&value.parent!==null&&!isIdentity(value.parent))||
    (value.status!==undefined&&!['Unavailable','Running','Completed','Interrupted'].includes(value.status as string))||
    (value.total!==undefined&&value.total!==null&&!isUsage(value.total))||
    (value.latest!==undefined&&value.latest!==null&&!isUsage(value.latest))||
    (value.context!==undefined&&value.context!==null&&!isContext(value.context))||
    (value.boundary!==undefined&&typeof value.boundary!=='boolean')||
    (value.compaction!==undefined&&typeof value.compaction!=='boolean')||
    (value.warning!==undefined&&(typeof value.warning!=='string'||value.warning.length>1024)))throw new SyntaxError('Invalid cached observation');
  return value as unknown as Observation;
}

export class Store {
  private db: DatabaseSync;
  private closed = false;
  private scanOpen = false;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Cache must be a regular file');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.db = new DatabaseSync(path);
    try {
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA temp_store=FILE; PRAGMA cache_size=-8192; PRAGMA temp.cache_size=-2048;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS observations_projection_v2 ON observations(session, CASE WHEN json_valid(value) THEN json_extract(value,'$.provenance.timestamp') ELSE '' END COLLATE BINARY, id COLLATE BINARY);
      DROP INDEX IF EXISTS observations_session;
      DROP INDEX IF EXISTS observations_projection;
      CREATE TEMP TABLE IF NOT EXISTS scan_sessions(id TEXT PRIMARY KEY);`);
    if(this.get<number>('projectionVersion')!==2){
      this.db.exec('BEGIN');
      try{
        for(const s of this.sessions()){
          const seeds=upgradeObservations(s);for(const o of seeds)this.insert(o);
          this.db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(s.id,JSON.stringify(project(s.id,seeds)));
        }
        // v1 marked suppressed records seen. Re-read the sources once on upgrade.
        this.db.exec('DELETE FROM seen;');this.set('projectionVersion',2);this.db.exec('COMMIT');
      }catch(e){this.db.exec('ROLLBACK');throw e;}
    }
    } catch (error) { this.db.close(); this.closed = true; throw error; }
  }
  sessions(): Session[] {
    const rows=this.db.prepare('SELECT value FROM sessions').all() as {value:string}[];
    return rows.map(row=>{
      let value:unknown;
      try{value=JSON.parse(row.value);}catch{throw new SyntaxError('Invalid cached session');}
      if(!isSession(value))throw new SyntaxError('Invalid cached session');
      return value;
    });
  }
  get<T>(id: string): T | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE id=?').get(id) as {value:string} | undefined;
    return r ? JSON.parse(r.value) : null;
  }
  set(id: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(id, JSON.stringify(value)); }
  has(id: string) { return !!this.db.prepare('SELECT 1 FROM seen WHERE id=?').get(id); }
  private insert(o:Observation){this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?)').run(o.key,o.session,JSON.stringify(o));}

  /** Start one all-or-nothing source scan. All Store writers are serialized above this boundary. */
  beginScan(){
    if(this.closed)throw new Error('Cache is closed');
    if(this.scanOpen)throw new Error('A scan transaction is already open');
    this.db.exec('BEGIN');this.scanOpen=true;
    try{this.db.exec('DELETE FROM temp.scan_sessions');}catch(error){try{this.rollbackScan();}catch{}throw error;}
  }

  /** Persist one bounded batch inside the active scan transaction. */
  stageScan(observations:Observation[]){
    if(!this.scanOpen)throw new Error('No scan transaction is open');
    const insert=this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?)');
    const seen=this.db.prepare('INSERT OR IGNORE INTO seen VALUES(?)');
    const touched=this.db.prepare('INSERT OR IGNORE INTO temp.scan_sessions VALUES(?)');
    for(const o of observations){
      const value=JSON.stringify(o);
      insert.run(o.key,o.session,value);seen.run(o.key);touched.run(o.session);
    }
  }

  /** Stream the ordered rows through a bounded reducer, then atomically publish snapshots. */
  async commitScan(cancelled:()=>boolean=()=>false):Promise<Session[]>{
    if(!this.scanOpen)throw new Error('No scan transaction is open');
    const result:Session[]=[];
    try{
      const sessions=this.db.prepare('SELECT id FROM temp.scan_sessions WHERE (? IS NULL OR id > ?) ORDER BY id COLLATE BINARY LIMIT 1');
      const rows=this.db.prepare(`SELECT value FROM observations WHERE session=?
        ORDER BY CASE WHEN json_valid(value) THEN json_extract(value,'$.provenance.timestamp') ELSE '' END COLLATE BINARY, id COLLATE BINARY`);
      let lastId:string|null=null;
      while(true){
        const next=sessions.get(lastId,lastId) as {id:string}|undefined;
        if(!next)break;
        const {id}=next;lastId=id;
        const builderRows=rows.iterate(id) as Iterable<{value:string}>;
        // Use the builder directly so both each row and each equal-time conflict
        // group stay bounded in memory. Yield while the transaction remains open.
        const projection=new ProjectionBuilder(id);let count=0;
        for(const row of builderRows){
          projection.push(parseObservation(row.value));
          if(++count%projectionYieldRows===0){await yieldToEventLoop();if(cancelled())throw new Error('Scan cancelled');}
        }
        const value=projection.finish();
        this.db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(id,JSON.stringify(value));result.push(value);
        await yieldToEventLoop();if(cancelled())throw new Error('Scan cancelled');
      }
      if(cancelled())throw new Error('Scan cancelled');
      this.db.exec('COMMIT');this.scanOpen=false;
      return result;
    }catch(error){
      try{this.rollbackScan();}catch{}
      throw error;
    }
  }

  rollbackScan(){
    if(!this.scanOpen)return;
    try{this.db.exec('ROLLBACK');}
    catch(error){
      const message=(error as Error).message;
      if(!/no transaction is active/i.test(message))throw error;
    }finally{this.scanOpen=false;}
  }

  save(observations:Observation[]):Session[] {
    const result:Session[]=[];
    this.db.exec('BEGIN');
    try {
      for(const o of observations){this.insert(o);this.db.prepare('INSERT OR IGNORE INTO seen VALUES(?)').run(o.key);}
      for(const id of new Set(observations.map(o=>o.session))){
        const rows=this.db.prepare('SELECT value FROM observations WHERE session=?').all(id) as {value:string}[];
        const value=project(id,rows.map(r=>JSON.parse(r.value)));
        this.db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(id,JSON.stringify(value));result.push(value);
      }
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
    return result;
  }
  clear(preferences: Preferences) {
    if(this.scanOpen)throw new Error('Cannot clear the cache during a scan');
    this.db.exec('BEGIN');
    try { this.db.exec('DELETE FROM sessions; DELETE FROM seen; DELETE FROM observations;'); this.set('preferences', preferences); this.db.exec('COMMIT'); }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
    // secure_delete=ON overwrites deleted pages. Avoid a post-commit VACUUM
    // failure that would report a successful clear as though it had rolled back.
  }
  close() { if (!this.closed) { if(this.scanOpen)this.rollbackScan();this.db.close(); this.closed = true; } }
}
