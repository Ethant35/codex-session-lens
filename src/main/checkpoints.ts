// Author: Ethan
import type { Checkpoint, CheckpointView, Session, Usage } from '../shared';

export const validName = (value: unknown): value is string => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const identity = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const usage = (value: any): value is Usage => !!value && count(value.input) && count(value.output) && count(value.cached) && value.cached <= value.input;

export function parseCheckpoint(text: string): Checkpoint {
  const value = JSON.parse(text);
  if (!value || Object.keys(value).some(key => !['id','sessionId','name','createdAt','total','totalTimestamp','compactions','incomplete','selected'].includes(key)) ||
    !identity(value.id) || !identity(value.sessionId) || !validName(value.name) || !time(value.createdAt) ||
    !(value.total === null || usage(value.total)) || !(value.totalTimestamp === null || time(value.totalTimestamp)) ||
    !count(value.compactions) || typeof value.incomplete !== 'boolean' || typeof value.selected !== 'boolean') {
    throw new SyntaxError('Invalid saved checkpoint');
  }
  return value;
}

/** Differences of saved observations, never a cost estimate or a sum of repeated snapshots. */
export function checkpointView(point: Checkpoint, session: Session | undefined, incomplete: boolean): CheckpointView {
  let delta: Usage | null = null;
  let observedCompactions: number | null = null;
  const notes: string[] = [];
  if (!session) notes.push('Session data is unavailable.');
  else {
    if (point.total && session.total) {
      const difference = { input: session.total.input - point.total.input, output: session.total.output - point.total.output, cached: session.total.cached - point.total.cached };
      if (Object.values(difference).every(count) && difference.cached <= difference.input) delta = difference;
      else notes.push('Counters changed inconsistently. Token change is unavailable; save a new checkpoint after checking the source.');
    } else notes.push('A cumulative usage sample is missing. Token change is unavailable.');
    if (session.compactions.length >= point.compactions) observedCompactions = session.compactions.length - point.compactions;
    else notes.push('Compaction history changed. The count since this checkpoint is unavailable.');
  }
  if (point.incomplete || session?.warnings.some(warning => /cumulative|counter|coverage/i.test(warning))) {
    delta = null;
    notes.push('The baseline or cumulative history is uncertain. Token change is unavailable.');
  }
  if (point.incomplete || incomplete || !!session?.warnings.length) notes.push('Coverage is incomplete or uncertain. Changes use only retained observations.');
  return { ...point, delta, observedCompactions, notes };
}
