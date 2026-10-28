export interface Usage { input: number; output: number; cached: number; }
export interface Provenance { file: string; line: number; event: string; timestamp: string; }
export interface Session {
  id: string; model: string | null; lastActivity: string; status: string; projectLabel?: string;
  total: Usage | null; latest: Usage | null;
  context: { used: number; limit: number; percent: number; kind: 'estimate' } | null;
  compactions: { timestamp: string; provenance: Provenance }[];
  parentId: string | null; provenance: Provenance | null;
  sources?: { model?: Provenance; latest?: Provenance; status?: Provenance; parent?: Provenance };
  warnings: string[];
}
export interface Preferences {
  theme: 'system' | 'light' | 'dark'; compact: boolean; alwaysOnTop: boolean;
  directories: string[]; selectedId: string | null; recentIds: string[]; paused: boolean;
  onboardingCompleted?: boolean; sampleMode?: boolean; aliases?: Record<string, string>; showProjectLabels?: boolean;
}
export interface Snapshot {
  recovery?: { message: string; canRebuild: boolean };
  sessions: Session[]; preferences: Preferences;
  diagnostics: { errors: number; files: number; lastScan: string | null; messages: string[]; blockedRequests: number };
}
export interface LensAPI {
  chooseDirectories(): Promise<string[] | null>;
  alias(id: string, label: string): Promise<Snapshot>;
  recover(action: 'retry' | 'rebuild'): Promise<Snapshot>;
  snapshot(): Promise<Snapshot>;
  preferences(value: Partial<Preferences>): Promise<Snapshot>;
  select(id: string): Promise<Snapshot>;
  clear(): Promise<Snapshot>;
  rescan(): Promise<Snapshot>;
}
declare global { interface Window { lens: LensAPI; } }
