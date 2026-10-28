// Author: Ethan
import { isAbsolute } from 'node:path';
import type { Preferences, Session, Snapshot } from '../shared';
import { Ingestor } from './ingestion';
import { Store } from './store';

const editable = ['theme', 'compact', 'alwaysOnTop', 'paused', 'directories', 'onboardingCompleted', 'sampleMode', 'showProjectLabels'] as const;
const booleans = ['compact', 'alwaysOnTop', 'paused', 'onboardingCompleted', 'sampleMode', 'showProjectLabels'] as const;
export class InvalidPreferencesError extends Error {}
function patch(value: unknown): Partial<Preferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !(editable as readonly string[]).includes(k))) throw new Error('Unknown preference');
  if (Object.values(v).some(v => v === undefined)) throw new Error('Missing preference value');
  if (v.theme !== undefined && !['system', 'dark', 'light'].includes(v.theme as string)) throw new Error('Invalid theme');
  for (const key of booleans) if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error('Invalid setting');
  if (v.directories !== undefined && (!Array.isArray(v.directories) || v.directories.length > 20 ||
    v.directories.some(d => typeof d !== 'string' || !isAbsolute(d) || d.length > 4096 || d.includes('\0')))) throw new Error('Use absolute directories');
  return structuredClone(value) as Partial<Preferences>;
}

function aliases(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid aliases');
  const entries = Object.entries(value);
  if (entries.length > 1000 || entries.some(([id, label]) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
    typeof label !== 'string' || label.length > 80 || !label.trim() || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(label))) throw new Error('Invalid aliases');
  return Object.fromEntries(entries);
}
function preferences(saved: unknown, directories: string[]): Preferences {
  const defaults: Preferences = { theme: 'system', compact: true, alwaysOnTop: false,
    directories, selectedId: null, recentIds: [], paused: false, onboardingCompleted: false, sampleMode: false, aliases: {}, showProjectLabels: false };
  if (saved === null) return defaults;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved preferences');
  const v = saved as Record<string, unknown>;
  const validated = patch(Object.fromEntries(editable.filter(k => v[k] !== undefined).map(k => [k, v[k]])));
  const id = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
  if (v.selectedId != null && !id(v.selectedId)) throw new Error('Invalid saved selection');
  if (v.recentIds !== undefined && (!Array.isArray(v.recentIds) || v.recentIds.length > 10 || !v.recentIds.every(id))) throw new Error('Invalid saved selections');
  return { ...defaults, ...validated, onboardingCompleted: validated.onboardingCompleted ?? true,
    aliases: aliases(v.aliases), selectedId: (v.selectedId as string | null) ?? null, recentIds: (v.recentIds as string[]) ?? [] };
}

const sample: Session = {
  id: 'sample-session', model: 'Synthetic example', lastActivity: '2026-01-01T12:00:00.000Z',
  status: 'Completed', total: { input: 12000, output: 1800, cached: 8000 },
  latest: { input: 2400, output: 600, cached: 1200 },
  context: { used: 3000, limit: 12000, percent: 25, kind: 'estimate' },
  compactions: [], parentId: null, provenance: null,
  warnings: ['Synthetic sample. These values are not read from session folders.'],
};

/** Shared application boundary. Mutations commit before becoming visible and run in order. */
export class LensService {
  private prefs: Preferences;
  private ingestor: Ingestor;
  private queue: Promise<unknown> = Promise.resolve();
  private scanRequest: Promise<Snapshot> | null = null;
  private closing = false;
  private closeRequest: Promise<void> | null = null;
  constructor(private store: Store, directories: string[]) {
    const saved = store.get('preferences');
    try { this.prefs = preferences(saved, directories); }
    catch { throw new InvalidPreferencesError('Saved preferences are invalid'); }
    // A stale opt-in value must never leak labels through an older disabled preference.
    if (!this.prefs.showProjectLabels) store.clearProjectLabels();
    this.ingestor = new Ingestor(store, () => this.prefs.showProjectLabels === true);
  }
  snapshot(): Snapshot {
    return structuredClone({
      sessions: this.prefs.sampleMode ? [sample] : this.store.decorateSessions([...this.ingestor.sessions.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))),
      preferences: this.prefs.sampleMode ? { ...this.prefs, selectedId: sample.id } : this.prefs,
      diagnostics: { errors: this.ingestor.errors.size, files: this.ingestor.files,
        lastScan: this.ingestor.lastScan, messages: [...new Set(this.ingestor.errors.values())], blockedRequests: 0 },
    });
  }
  private enqueue(action: () => Promise<void> | void): Promise<Snapshot> {
    if (this.closing) return Promise.reject(new Error('Application is closing'));
    const result = this.queue.then(async () => {
      if (this.closing) throw new Error('Application is closing');
      await action(); return this.snapshot();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async scan() {
    if (this.prefs.paused || !this.prefs.onboardingCompleted || this.prefs.sampleMode) return;
    try { await this.ingestor.scan(this.prefs.directories); this.ingestor.errors.delete('scan'); }
    catch { this.ingestor.errors.set('scan', 'Scan could not be saved. Check free disk space and cache access, then rescan. Prior saved data is retained.'); }
  }
  rescan(): Promise<Snapshot> {
    if (!this.scanRequest) this.scanRequest = this.enqueue(() => this.scan()).finally(() => { this.scanRequest = null; });
    return this.scanRequest;
  }
  async preferences(value: unknown): Promise<Snapshot> {
    const changes = patch(value); // Copy before enqueue: the caller cannot change an accepted request.
    return this.enqueue(async () => {
      const next = { ...this.prefs, ...changes };
      this.store.savePreferences(next, changes.showProjectLabels === false);
      if(changes.showProjectLabels===false)this.ingestor.clearProjectLabels();
      this.prefs = next;
      if (changes.directories !== undefined) this.ingestor.errors.clear();
      await this.scan();
    });
  }
  select(id: unknown): Promise<Snapshot> {
    return this.enqueue(() => {
      if (this.prefs.sampleMode && id === sample.id) return;
      if (this.prefs.sampleMode || typeof id !== 'string' || !this.ingestor.sessions.has(id)) throw new Error('Unknown session');
      const next = { ...this.prefs, selectedId: id, recentIds: [id, ...this.prefs.recentIds.filter(x => x !== id)].slice(0, 10) };
      this.store.set('preferences', next); this.prefs = next;
    });
  }
  alias(id: unknown, label: unknown): Promise<Snapshot> {
    if (typeof label !== 'string' || label.length > 80 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(label)) return Promise.reject(new Error('Invalid alias'));
    const clean = label.trim();
    return this.enqueue(() => {
      if (this.prefs.sampleMode || typeof id !== 'string' || !this.ingestor.sessions.has(id)) throw new Error('Unknown session');
      const entries = Object.entries(this.prefs.aliases ?? {}).filter(([key]) => key !== id);
      if (clean) entries.push([id, clean]);
      const next = { ...this.prefs, aliases: aliases(Object.fromEntries(entries)) };
      this.store.set('preferences', next); this.prefs = next;
    });
  }
  clear(): Promise<Snapshot> {
    return this.enqueue(() => {
      const next = { ...this.prefs, paused: true, selectedId: null, recentIds: [], sampleMode: false, aliases: {} };
      this.store.clear(next); this.prefs = next; this.ingestor.reset();
    });
  }
  saveBounds(value: { x: number; y: number; width: number; height: number }): Promise<Snapshot> {
    return this.enqueue(() => { this.store.set('bounds', value); });
  }
  close(bounds?: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!this.closeRequest) {
      const finalBounds = bounds ? structuredClone(bounds) : undefined;
      this.closing = true; this.ingestor.stop();
      this.closeRequest = this.queue.then(() => this.ingestor.idle()).then(() => {
        if (finalBounds) this.store.set('bounds', finalBounds);
      }).finally(() => this.store.close());
    }
    return this.closeRequest;
  }
}
