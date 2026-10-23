// Author: Ethan
import { existsSync, lstatSync, mkdtempSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Store } from './store';
import { InvalidPreferencesError, LensService } from './service';
import type { Snapshot } from '../shared';

function failure(error: unknown): NonNullable<Snapshot['recovery']> {
  const code = (error as { errcode?: number })?.errcode;
  const canRebuild = code === 11 || code === 26 || error instanceof SyntaxError || error instanceof InvalidPreferencesError;
  return { canRebuild, message: canRebuild
    ? 'The local cache is damaged or contains invalid settings. Retry, or retain a backup and rebuild from your source files. History whose source files are missing will remain only in the backup.'
    : 'The local cache is unavailable. Close other copies of Session Lens and check free disk space and folder access, then retry. The existing cache has not been replaced.' };
}

/** Owns startup/recovery; never automatically discards a failed cache. */
export class CacheHost {
  private store?: Store;
  private service?: LensService;
  private recovery?: Snapshot['recovery'];
  private recovering: Promise<Snapshot> | null = null;
  private closeRequest: Promise<void> | null = null;
  private closed = false;
  constructor(private path: string, private directories: string[]) { this.open(); }
  private open() {
    let store: Store | undefined;
    try {
      store = new Store(this.path);
      const service = new LensService(store, this.directories);
      this.store = store; this.service = service; this.recovery = undefined;
    } catch (error) { store?.close(); this.recovery = failure(error); }
  }
  snapshot(): Snapshot {
    if (this.service) return this.service.snapshot();
    return { sessions: [], recovery: this.recovery, preferences: {
      theme: 'system', compact: false, alwaysOnTop: false, directories: [...this.directories],
      selectedId: null, recentIds: [], paused: true, onboardingCompleted: true, sampleMode: false,
    }, diagnostics: { files: 0, errors: 1, lastScan: null,
      messages: [this.recovery?.message ?? 'Cache unavailable.'], blockedRequests: 0 } };
  }
  private ready(): LensService {
    if (!this.service || this.closed) throw new Error('Cache unavailable');
    return this.service;
  }
  async preferences(value: unknown) { return this.ready().preferences(value); }
  async select(id: unknown) { return this.ready().select(id); }
  async clear() { return this.ready().clear(); }
  async rescan() { return this.service && !this.closed ? this.service.rescan() : this.snapshot(); }
  bounds(): unknown {
    try { return this.store?.get('bounds') ?? null; }
    catch { return null; } // Window geometry is optional and never affects telemetry recovery.
  }
  async saveBounds(value: { x: number; y: number; width: number; height: number }) {
    if (this.service && !this.closed) await this.service.saveBounds(value);
  }
  async recover(action: unknown): Promise<Snapshot> {
    if (action !== 'retry' && action !== 'rebuild') throw new Error('Invalid recovery action');
    if (this.closed) throw new Error('Application is closing');
    if (this.recovering) return this.recovering;
    if (this.service) return this.snapshot();
    if (action === 'rebuild' && !this.recovery?.canRebuild) throw new Error('Rebuild is unavailable');
    this.recovering = Promise.resolve().then(() => {
      if (this.closed) throw new Error('Application is closing');
      // Recheck first: a successful repair/unlock must never be replaced by stale UI state.
      this.open();
      if (!this.service && action === 'rebuild') {
        if (!this.recovery?.canRebuild) throw new Error('Rebuild is unavailable');
        this.backupFailedCache(); this.open();
      }
      return this.snapshot();
    }).finally(() => { this.recovering = null; });
    return this.recovering;
  }
  private backupFailedCache() {
    const files = [this.path, ...['-journal', '-wal', '-shm'].map(s => this.path + s)].filter(p => existsSync(p));
    if (!files.includes(this.path)) throw new Error('Cache changed during recovery');
    for (const file of files) {
      const info = lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Cache must be a regular file');
    }
    const backup = mkdtempSync(join(dirname(this.path), 'cache-backup-'));
    const moved: string[] = [];
    try {
      for (const file of files) { renameSync(file, join(backup, basename(file))); moved.push(file); }
    } catch (error) {
      // Best-effort restoration never overwrites a concurrently-created file.
      for (const file of moved.reverse()) if (!existsSync(file)) renameSync(join(backup, basename(file)), file);
      throw error;
    }
  }
  close(bounds?: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!this.closeRequest) {
      this.closed = true;
      this.closeRequest = Promise.resolve(this.recovering).catch(() => undefined)
        .then(() => this.service?.close(bounds));
    }
    return this.closeRequest;
  }
}
