import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Preferences, Session } from '../shared';

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  sessions(): Session[] { return (this.db.prepare('SELECT value FROM sessions').all() as {value:string}[]).map(r => JSON.parse(r.value)); }
  get<T>(id: string): T | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE id=?').get(id) as {value:string} | undefined;
    return r ? JSON.parse(r.value) : null;
  }
  set(id: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(id, JSON.stringify(value)); }
  has(id: string) { return !!this.db.prepare('SELECT 1 FROM seen WHERE id=?').get(id); }
  save(id: string, value: Session) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?)').run(value.id, JSON.stringify(value));
      this.db.prepare('INSERT OR IGNORE INTO seen VALUES(?)').run(id);
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  clear(preferences: Preferences) {
    this.db.exec('BEGIN');
    try { this.db.exec('DELETE FROM sessions; DELETE FROM seen;'); this.set('preferences', preferences); this.db.exec('COMMIT'); }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
    this.db.exec('VACUUM');
  }
  close() { this.db.close(); }
}
