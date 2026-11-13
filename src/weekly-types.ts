// Author: Ethan
import type { Usage } from './shared';
export interface WeeklySession {
  id: string; parentId: string | null; projectId: string; projectLabel: string;
  totals: Usage; descendantTotals: Usage; firstActivity: string | null; lastActivity: string | null;
  observations: number; gaps: string[];
}
export interface WeeklyProject { id: string; label: string; totals: Usage; sessions: WeeklySession[]; }
export interface WeeklyReport {
  startDate: string; endDate: string; timeZone: string; scannedAt: string; totals: Usage;
  projects: WeeklyProject[]; gaps: string[];
  coverage: { files: number; plainFiles: number; compressedFiles: number; duplicateObservations: number; skippedRecords: number; inheritedRecords: number; sessions: number; };
}
export interface WeeklyOptions { timeZone?: string; signal?: AbortSignal; onProgress?: (files: number) => void; }
