// Author: Ethan
import { randomUUID } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';

const events = ['started', 'fatal', 'cache_unavailable', 'cache_recovered', 'operation_failed', 'bounds_failed', 'shutdown_failed'] as const;
type Event = typeof events[number];
const categories = ['none', 'unknown', 'busy', 'disk_full', 'permission', 'corrupt', 'io'] as const;
type Category = typeof categories[number];
interface RecordEntry { time: string; event: Event; category: Category; runId: string; entryPoint: 'desktop' | 'background'; version: string; count: number; }

function category(error: unknown): Category {
  if (error === undefined) return 'none';
  try {
    const e = error as { errcode?: number; code?: string };
    if (e?.errcode === 5 || e?.errcode === 6) return 'busy';
    if (e?.errcode === 13 || e?.code === 'ENOSPC') return 'disk_full';
    if (e?.errcode === 3 || e?.errcode === 8 || e?.code === 'EACCES' || e?.code === 'EPERM') return 'permission';
    if (e?.errcode === 11 || e?.errcode === 26 || error instanceof SyntaxError) return 'corrupt';
    if (e?.errcode === 10 || e?.code === 'EIO') return 'io';
  } catch { /* An error may itself have hostile getters. */ }
  return 'unknown';
}

/** Local support history: at most 100 allowlisted records, no raw error messages or source values. */
export class LocalDiagnostics {
  private records: RecordEntry[] = [];
  private readonly runId = randomUUID();
  constructor(private path: string, private entryPoint: RecordEntry['entryPoint'], private version: string) {
    if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) this.version = 'unknown';
    let fd: number | undefined;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || info.size > 65536) return;
      const saved: unknown = JSON.parse(readFileSync(fd, 'utf8'));
      if (!Array.isArray(saved)) return;
      for (const r of saved.slice(-100)) {
        if (!r || !events.includes(r.event) || !categories.includes(r.category) ||
          !/^[a-f0-9-]{36}$/.test(r.runId) || !['desktop', 'background'].includes(r.entryPoint) ||
          typeof r.time !== 'string' || r.time.length !== 24 || !Number.isFinite(Date.parse(r.time)) ||
          typeof r.version !== 'string' || !/^(?:unknown|\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?)$/.test(r.version) || r.version.length > 80 ||
          !Number.isSafeInteger(r.count) || r.count < 1 || r.count > 1_000_000_000) continue;
        this.records.push({ time: r.time, event: r.event, category: r.category, runId: r.runId,
          entryPoint: r.entryPoint, version: r.version, count: r.count });
      }
    } catch { /* Diagnostics must not prevent startup or recovery. */ }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  record(event: Event, error?: unknown): void {
    const code = category(error), now = new Date();
    const last = this.records.at(-1);
    if (last?.runId === this.runId && last.event === event && last.category === code && now.getTime() - Date.parse(last.time) < 60000) {
      last.count = Math.min(1_000_000_000, last.count + 1);
      // Repeated failures are counted in memory; avoid retry-loop disk writes.
      return;
    }
    this.records.push({ time: now.toISOString(), event, category: code, runId: this.runId,
      entryPoint: this.entryPoint, version: this.version, count: 1 });
    this.records = this.records.slice(-100);
    let fd: number | undefined;
    try {
      fd = openSync(this.path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1) return;
      fchmodSync(fd, 0o600);
      const bytes = Buffer.from(JSON.stringify(this.records) + '\n');
      if (bytes.length > 65536) return;
      ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < bytes.length) { const n = writeSync(fd, bytes, offset); if (!n) break; offset += n; }
    } catch { /* Never replace the original failure with a logging failure. */ }
    finally { if (fd !== undefined) { try { closeSync(fd); } catch {} } }
  }
}
