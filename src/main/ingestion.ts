import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { Session, Usage, Provenance } from '../shared';
import { Store } from './store';
import type {Observation} from './projection';

type Cursor = { offset: number; inode: number; modified: number; tail: string; tailPending:boolean; decoder: StringDecoder; line: number; id: string | null; forkedFromId:string|null; subagentHistoryStartOrdinal:number|null; identityConflict:boolean; dropping: boolean; anchor: Buffer };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const identity = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const usage = (v: any): Usage | null => v && integer(v.input_tokens) && integer(v.output_tokens) && integer(v.cached_input_tokens) && v.cached_input_tokens <= v.input_tokens ? { input: v.input_tokens, output: v.output_tokens, cached: v.cached_input_tokens } : null;
const timestamp = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const MAX_LINE = 8 * 1024 * 1024;
const SCAN_BATCH_SIZE=128;
const yieldToEventLoop=()=>new Promise<void>(resolve=>setImmediate(resolve));
class ScanWriteError extends Error { constructor(readonly cause:unknown){super('Scan write failed');} }

export class Ingestor {
  sessions = new Map<string, Session>();
  errors = new Map<string, string>();
  files = 0;
  lastScan: string | null = null;
  private cursors = new Map<string, Cursor>();
  private running: Promise<void> | null = null;
  private stopped = false;
  private batch:Observation[]=[];
  stop() { this.stopped = true; }
  constructor(private store: Store) { for (const s of store.sessions()) this.sessions.set(s.id, s); }
  reset() { this.sessions.clear(); this.batch=[]; this.cursors.clear(); this.errors.clear(); this.files = 0; this.lastScan = null; }
  private error(key: string, message: string) { if (this.errors.size < 500) this.errors.set(key, message); }
  scan(roots: string[]): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.scanAll(roots).finally(() => { this.running = null; });
    return this.running;
  }
  async idle() { await this.running; }
  private async scanAll(roots: string[]) {
    this.store.beginScan();
    let committed=false;
    try{
    const files = new Set<string>();
    const walk = async (root: string, depth = 0) => {
      if(this.stopped)return;
      if (depth > 20) { this.error(root, 'Directory nesting exceeds supported depth.'); return; }
      try {
        const entries = await readdir(root, { withFileTypes: true });
        this.errors.delete(`root:${root}`);
        for (const e of entries) {
          if(this.stopped)break;
          if (e.isSymbolicLink()) continue;
          if (e.isDirectory()) await walk(join(root, e.name), depth + 1);
          else if (e.isFile() && e.name.endsWith('.jsonl')) files.add(join(root, e.name));
        }
      } catch { this.error(`root:${root}`, 'A configured directory is unavailable or unreadable.'); }
    };
    for (const root of roots) await walk(root);
    this.files = files.size;
    for (const path of files) {
      if (this.stopped) break;
      try { await this.read(path); } catch (error) {
        if(error instanceof ScanWriteError)throw error;
        this.cursors.delete(path);
        this.error(`read:${path}`, 'A telemetry file could not be read; retained prior data.');
      }
    }
    for (const path of this.cursors.keys()) if (!files.has(path)) this.cursors.delete(path);
    if(!this.stopped){
      await this.flushBatch();
      if(!this.stopped){
        const saved=await this.store.commitScan(()=>this.stopped);
        for(const s of saved)this.sessions.set(s.id,s);
        committed=true;
      }
    }
    if(committed)this.lastScan = new Date().toISOString();
    }catch(error){
      this.cursors.clear();
      throw error instanceof ScanWriteError?error.cause:error;
    }finally{
      this.batch=[];
      if(!committed){this.store.rollbackScan();this.cursors.clear();}
    }
  }
  private async flushBatch(){
    if(!this.batch.length||this.stopped)return;
    const batch=this.batch;this.batch=[];
    try{this.store.stageScan(batch);}catch(error){throw new ScanWriteError(error);}
    await yieldToEventLoop();
  }
  private async read(path: string) {
    // Open one stable, nonblocking, no-follow handle. The pathname can change
    // after discovery; all identity checks, anchor reads, and stream reads use
    // this same descriptor.
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
    const info=await file.stat();
    if(!info.isFile())throw new Error('Telemetry source is not a regular file');
    let cursor = this.cursors.get(path);
    let rewritten = false;
    if (cursor && cursor.offset > 0 && info.size >= cursor.offset && cursor.anchor.length) {
        const sample = Buffer.alloc(cursor.anchor.length);
        const {bytesRead} = await file.read(sample,0,sample.length,cursor.offset-sample.length);
        rewritten = bytesRead !== sample.length || !sample.equals(cursor.anchor);
    }
    if (rewritten || !cursor || cursor.inode !== info.ino || info.size < cursor.offset || (info.size === cursor.offset && info.mtimeMs !== cursor.modified)) {
      cursor = { offset: 0, inode: info.ino, modified: info.mtimeMs, tail: '', tailPending:false, decoder: new StringDecoder('utf8'), line: 0, id: null, forkedFromId:null, subagentHistoryStartOrdinal:null, identityConflict:false, dropping: false, anchor: Buffer.alloc(0) };
      this.cursors.set(path, cursor);
    }
    if (info.size === cursor.offset) return;
    const stream = file.createReadStream({ start: cursor.offset, end: info.size - 1, highWaterMark: 64 * 1024, autoClose:false });
    for await (const chunk of stream) {
      if (this.stopped) break;
      cursor.offset += (chunk as Buffer).length;
      cursor.anchor = Buffer.concat([cursor.anchor, chunk as Buffer]).subarray(-64);
      cursor.tail += cursor.decoder.write(chunk as Buffer);
      let newline: number;
      while ((newline = cursor.tail.indexOf('\n')) >= 0) {
        const line = cursor.tail.slice(0, newline); cursor.tail = cursor.tail.slice(newline + 1); cursor.line++;
        if (!cursor.dropping) {
          if (Buffer.byteLength(line, 'utf8') > MAX_LINE) this.error(`large:${path}`, 'Oversized record skipped.');
          else if (line.trim()) this.consume(path, cursor, line);
        }
        cursor.dropping = false;
        if(this.batch.length>=SCAN_BATCH_SIZE)await this.flushBatch();
        if(this.stopped)break;
      }
      if (Buffer.byteLength(cursor.tail, 'utf8') > MAX_LINE) { cursor.tail = ''; cursor.dropping = true; this.error(`large:${path}`, 'Oversized record skipped.'); }
    }
    cursor.modified = info.mtimeMs;
    const decoderState=cursor.decoder as unknown as {lastNeed?:number;lastTotal?:number};
    const undecodedBytes=decoderState.lastNeed?Math.max(0,(decoderState.lastTotal??0)-decoderState.lastNeed):0;
    const pendingBytes=Buffer.byteLength(cursor.tail,'utf8')+undecodedBytes;
    cursor.tailPending=pendingBytes>0&&!cursor.dropping;
    if(cursor.tailPending){
      cursor.offset-=pendingBytes;cursor.tail='';cursor.decoder=new StringDecoder('utf8');
      const length=Math.min(64,cursor.offset),sample=Buffer.alloc(length);
      const {bytesRead}=await file.read(sample,0,length,cursor.offset-length);
      cursor.anchor=sample.subarray(0,bytesRead);
    }
    if (cursor.tailPending || cursor.dropping) this.error(`tail:${path}`, 'Incomplete trailing record; waiting for the next append.');
    else this.errors.delete(`tail:${path}`);
    }finally{await file.close();}
  }
  private consume(path: string, cursor: Cursor, line: string) {
    if (this.stopped) return;
    let row: any;
    try { row = JSON.parse(line); } catch { this.error(`json:${path}:${cursor.line}`, 'Malformed JSON record skipped.'); return; }
    if (!row || typeof row !== 'object') return;
    if(cursor.identityConflict)return;
    const p = row.payload;
    if (!p || typeof p !== 'object') return;
    const ordinal=integer(row.ordinal)?row.ordinal:null;
    let initialHeader=false;
    if (row.type === 'session_meta') {
      if (!identity(p.id)) { this.error(`id:${path}`, 'Missing or invalid session identity; no metrics attributed.'); cursor.id = null; return; }
      if(!cursor.id){
        initialHeader=true;
        cursor.id=p.id;
        const fork=identity(p.forked_from_id)?p.forked_from_id:null;
        const parent=identity(p.parent_thread_id)?p.parent_thread_id:null;
        const sourceParent=p.source?.subagent?.thread_spawn?.parent_thread_id;
        const start=p.subagent_history_start_ordinal;
        if(fork&&parent===fork&&sourceParent===fork&&integer(start)&&ordinal!==null&&start>ordinal){
          cursor.forkedFromId=fork;
          cursor.subagentHistoryStartOrdinal=start;
        }
      }
      if(cursor.subagentHistoryStartOrdinal!==null&&ordinal!==null&&ordinal<cursor.subagentHistoryStartOrdinal&&p.id===cursor.forkedFromId)return;
      if (cursor.id && cursor.id !== p.id) { this.error(`mixed:${path}`, 'Conflicting session identities in one file; remaining records ignored.'); cursor.id = null; cursor.identityConflict = true; cursor.dropping = true; return; }
      cursor.id = p.id;
    }
    if (!cursor.id) return;
    if(!initialHeader&&cursor.subagentHistoryStartOrdinal!==null){
      if(ordinal===null){this.error(`fork-ordinal:${path}`,'Forked subagent record has a missing or invalid ordinal; skipped.');return;}
      if(ordinal<cursor.subagentHistoryStartOrdinal)return;
    }
    if (p.thread_id !== undefined && p.thread_id !== cursor.id) { this.error(`mismatch:${path}:${cursor.line}`, 'Record identity does not match its session; skipped.'); return; }
    const time = timestamp(row.timestamp);
    if (!time) return;
    const kind = row.type === 'event_msg' ? p.type : row.type;
    if (!['session_meta','turn_context','token_count','token_usage_record','context_compacted','compacted','task_started','task_complete','turn_aborted'].includes(kind)) return;
    const key = createHash('sha256').update(cursor.id).update(line).digest('hex');
    const prov:Provenance={file:basename(path),line:cursor.line,event:kind,timestamp:time};
    const o:Observation={key,session:cursor.id,provenance:prov};
    if(kind==='session_meta'){
      const parent=p.source?.subagent?.thread_spawn?.parent_thread_id;
      if(identity(parent) && parent!==cursor.id)o.parent=parent;
    }
    if(kind==='turn_context' && typeof p.model==='string' && /^[a-zA-Z0-9._:/-]{1,120}$/.test(p.model)){
      o.model=p.model;o.boundary=true;
    }
    if(kind==='context_compacted' || kind==='compacted')o.compaction=true;
    if(kind==='task_started'){o.status='Running';o.boundary=true;}
    if(kind==='task_complete')o.status='Completed';
    if(kind==='turn_aborted')o.status='Interrupted';
    if(kind==='token_count' || kind==='token_usage_record'){
      const info=kind==='token_count'?p.info:{total_token_usage:p.thread_token_usage,last_token_usage:p.usage};
      if(info){
        o.total=usage(info.total_token_usage);o.latest=usage(info.last_token_usage);
        if(!o.total && info.total_token_usage)o.warning='Invalid cumulative usage was ignored.';
        const used=info.last_token_usage?.total_tokens,limit=info.model_context_window;
        o.context=o.latest && integer(used) && used===o.latest.input+o.latest.output && integer(limit) && limit>0 && used<=limit
          ?{used,limit,percent:100*used/limit,kind:'estimate'}:null;
      }
    }
    this.batch.push(o);
  }
}
