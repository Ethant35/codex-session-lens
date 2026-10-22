import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { Session, Usage, Provenance } from '../shared';
import { Store } from './store';

type Cursor = { offset: number; inode: number; modified: number; tail: string; decoder: StringDecoder; line: number; id: string | null; dropping: boolean };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const identity = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const usage = (v: any): Usage | null => v && integer(v.input_tokens) && integer(v.output_tokens) && integer(v.cached_input_tokens) && v.cached_input_tokens <= v.input_tokens ? { input: v.input_tokens, output: v.output_tokens, cached: v.cached_input_tokens } : null;
const timestamp = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const MAX_LINE = 8 * 1024 * 1024;

export class Ingestor {
  sessions = new Map<string, Session>();
  errors = new Map<string, string>();
  files = 0;
  lastScan: string | null = null;
  private cursors = new Map<string, Cursor>();
  private running: Promise<void> | null = null;
  constructor(private store: Store) { for (const s of store.sessions()) this.sessions.set(s.id, s); }
  reset() { this.sessions.clear(); this.cursors.clear(); this.errors.clear(); this.files = 0; this.lastScan = null; }
  private error(key: string, message: string) { if (this.errors.size < 500) this.errors.set(key, message); }
  scan(roots: string[]): Promise<void> {
    if (this.running) return this.running;
    this.running = this.scanAll(roots).finally(() => { this.running = null; });
    return this.running;
  }
  async idle() { await this.running; }
  private async scanAll(roots: string[]) {
    const files = new Set<string>();
    const walk = async (root: string, depth = 0) => {
      if (depth > 20) { this.error(root, 'Directory nesting exceeds supported depth.'); return; }
      try {
        const entries = await readdir(root, { withFileTypes: true });
        this.errors.delete(`root:${root}`);
        for (const e of entries) {
          if (e.isSymbolicLink()) continue;
          if (e.isDirectory()) await walk(join(root, e.name), depth + 1);
          else if (e.isFile() && e.name.endsWith('.jsonl')) files.add(join(root, e.name));
        }
      } catch { this.error(`root:${root}`, 'A configured directory is unavailable or unreadable.'); }
    };
    for (const root of roots) await walk(root);
    this.files = files.size;
    for (const path of files) {
      try { await this.read(path); } catch { this.error(`read:${path}`, 'A telemetry file could not be read; retained prior data.'); }
    }
    for (const path of this.cursors.keys()) if (!files.has(path)) this.cursors.delete(path);
    this.lastScan = new Date().toISOString();
  }
  private async read(path: string) {
    const info = await stat(path);
    let cursor = this.cursors.get(path);
    if (!cursor || cursor.inode !== info.ino || info.size < cursor.offset || (info.size === cursor.offset && info.mtimeMs !== cursor.modified)) {
      cursor = { offset: 0, inode: info.ino, modified: info.mtimeMs, tail: '', decoder: new StringDecoder('utf8'), line: 0, id: null, dropping: false };
      this.cursors.set(path, cursor);
    }
    if (info.size === cursor.offset) return;
    const stream = createReadStream(path, { start: cursor.offset, end: info.size - 1, highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
      cursor.offset += (chunk as Buffer).length;
      cursor.tail += cursor.decoder.write(chunk as Buffer);
      let newline: number;
      while ((newline = cursor.tail.indexOf('\n')) >= 0) {
        const line = cursor.tail.slice(0, newline); cursor.tail = cursor.tail.slice(newline + 1); cursor.line++;
        if (!cursor.dropping && line.length <= MAX_LINE && line.trim()) this.consume(path, cursor, line);
        cursor.dropping = false;
      }
      if (cursor.tail.length > MAX_LINE) { cursor.tail = ''; cursor.dropping = true; this.error(`large:${path}`, 'Oversized record skipped.'); }
    }
    cursor.modified = info.mtimeMs;
    if (cursor.tail || cursor.dropping) this.error(`tail:${path}`, 'Incomplete trailing record; waiting for the next append.');
    else this.errors.delete(`tail:${path}`);
  }
  private consume(path: string, cursor: Cursor, line: string) {
    let row: any;
    try { row = JSON.parse(line); } catch { this.error(`json:${path}:${cursor.line}`, 'Malformed JSON record skipped.'); return; }
    if (!row || typeof row !== 'object') return;
    const p = row.payload;
    if (!p || typeof p !== 'object') return;
    if (row.type === 'session_meta') {
      if (!identity(p.id)) { this.error(`id:${path}`, 'Missing or invalid session identity; no metrics attributed.'); cursor.id = null; return; }
      if (cursor.id && cursor.id !== p.id) { this.error(`mixed:${path}`, 'Conflicting session identities in one file; remaining records ignored.'); cursor.id = null; cursor.dropping = true; return; }
      cursor.id = p.id;
    }
    if (!cursor.id) return;
    if (p.thread_id !== undefined && p.thread_id !== cursor.id) { this.error(`mismatch:${path}:${cursor.line}`, 'Record identity does not match its session; skipped.'); return; }
    const time = timestamp(row.timestamp);
    if (!time) return;
    const kind = row.type === 'event_msg' ? p.type : row.type;
    if (!['session_meta','turn_context','token_count','token_usage_record','context_compacted','compacted','task_started','task_complete','turn_aborted'].includes(kind)) return;
    const key = createHash('sha256').update(cursor.id).update(line).digest('hex');
    if (this.store.has(key)) return;
    const old = this.sessions.get(cursor.id);
    const s: Session = old ? structuredClone(old) : {id: cursor.id,model:null,lastActivity:time,status:'Unavailable',total:null,latest:null,context:null,compactions:[],parentId:null,provenance:null,warnings:[]};
    const fresh = time >= s.lastActivity;
    const prov: Provenance = {file: basename(path),line:cursor.line,event:kind,timestamp:time};
    const warn = (m: string) => { if (!s.warnings.includes(m)) s.warnings.push(m); };
    if (kind === 'session_meta') {
      const parent = p.source?.subagent?.thread_spawn?.parent_thread_id;
      if (identity(parent) && parent !== s.id) s.parentId = parent;
    }
    if (fresh && kind === 'turn_context') {
      const model = p.model;
      if (typeof model === 'string' && /^[a-zA-Z0-9._:/-]{1,120}$/.test(model)) {
        if (s.model !== model) s.context = null;
        s.model = model;
      }
    }
    if (kind === 'context_compacted' || kind === 'compacted') {
      // A compacted rollout item and its event notification describe one operation.
      if (!s.compactions.some(c => c.timestamp === time)) s.compactions.push({timestamp:time,provenance:prov});
      if (fresh) s.context = null;
    }
    if (fresh && kind === 'task_started') { s.status = 'Running'; s.context = null; }
    if (fresh && kind === 'task_complete') s.status = 'Completed';
    if (fresh && kind === 'turn_aborted') s.status = 'Interrupted';
    if (fresh && (kind === 'token_count' || kind === 'token_usage_record')) {
      const info = kind === 'token_count' ? p.info : {total_token_usage:p.thread_token_usage,last_token_usage:p.usage};
      if (info) {
        const total = usage(info.total_token_usage); const latest = usage(info.last_token_usage);
        if (total) {
          if (s.total && (total.input < s.total.input || total.output < s.total.output || total.cached < s.total.cached)) warn('Cumulative counter decreased. Prior totals retained; total coverage is uncertain.');
          else { s.total = total; s.provenance = prov; }
        } else if (info.total_token_usage) warn('Invalid cumulative usage was ignored.');
        s.latest = latest;
        // Only an explicitly reported limit and a complete latest-request total support this estimate.
        const used = info.last_token_usage?.total_tokens;
        const limit = info.model_context_window;
        s.context = latest && integer(used) && used === latest.input + latest.output && integer(limit) && limit > 0 && used <= limit
          ? {used,limit,percent:100 * used / limit,kind:'estimate'} : null;
      }
    }
    if (fresh) s.lastActivity = time;
    this.store.save(key, s); this.sessions.set(s.id, s);
  }
}
