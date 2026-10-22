import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Preferences, Session } from '../shared';
import {project,upgradeObservations,type Observation} from './projection';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, session TEXT NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS observations_session ON observations(session);`);
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
  }
  sessions(): Session[] { return (this.db.prepare('SELECT value FROM sessions').all() as {value:string}[]).map(r => JSON.parse(r.value)); }
  get<T>(id: string): T | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE id=?').get(id) as {value:string} | undefined;
    return r ? JSON.parse(r.value) : null;
  }
  set(id: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(id, JSON.stringify(value)); }
  has(id: string) { return !!this.db.prepare('SELECT 1 FROM seen WHERE id=?').get(id); }
  private insert(o:Observation){this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?)').run(o.key,o.session,JSON.stringify(o));}
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
    this.db.exec('BEGIN');
    try { this.db.exec('DELETE FROM sessions; DELETE FROM seen; DELETE FROM observations;'); this.set('preferences', preferences); this.db.exec('COMMIT'); }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
    this.db.exec('VACUUM');
  }
  close() { this.db.close(); }
}
