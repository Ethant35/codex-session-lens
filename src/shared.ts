export interface Usage { input: number; output: number; cached: number; }
export interface Provenance { file: string; line: number; event: string; timestamp: string; }
export interface Session {
  id: string; model: string | null; lastActivity: string; status: string;
  total: Usage | null; latest: Usage | null;
  context: { used: number; limit: number; percent: number; kind: 'estimate' } | null;
  compactions: { timestamp: string; provenance: Provenance }[];
  parentId: string | null; provenance: Provenance | null;
  warnings: string[];
}
export interface Preferences {
  theme: 'system' | 'light' | 'dark'; compact: boolean; alwaysOnTop: boolean;
  directories: string[]; selectedId: string | null; recentIds: string[]; paused: boolean;
}
export interface Snapshot {
  sessions: Session[]; preferences: Preferences;
  diagnostics: { errors: number; files: number; lastScan: string | null; messages: string[]; blockedRequests: number };
}
export interface LensAPI {
  snapshot(): Promise<Snapshot>;
  preferences(value: Partial<Preferences>): Promise<Snapshot>;
  select(id: string): Promise<Snapshot>;
  clear(): Promise<Snapshot>;
  rescan(): Promise<Snapshot>;
}
declare global { interface Window { lens: LensAPI; } }
