// Author: Ethan
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import { project, type Observation } from '../../src/main/projection';
import type { Session, Provenance } from '../../src/shared';

const time = (second: number) => `2026-10-22T10:00:${String(second).padStart(2, '0')}.000Z`;
const usage = (input: number, output: number, cached: number) => ({ input, output, cached });
const observation = (second: number, key: string, fields: Partial<Observation> = {}): Observation => ({
  key, session: 'property-session',
  provenance: { file: 'synthetic.jsonl', line: second + 1, event: 'token_count', timestamp: time(second) },
  ...fields,
});

// Kept deliberately straightforward and array-based: this is the pre-streaming
// reducer used as an independent oracle for the new SQL iterator path.
function referenceProject(id: string, input: Observation[]): Session {
  const ordered = [...input].sort((a, b) => a.provenance.timestamp.localeCompare(b.provenance.timestamp) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const result: Session = { id, model: null, lastActivity: ordered.at(-1)!.provenance.timestamp, status: 'Unavailable', total: null,
    latest: null, context: null, compactions: [], parentId: null, provenance: null, sources: {}, warnings: [] };
  const warn = (message: string) => { if (!result.warnings.includes(message)) result.warnings.push(message); };
  let retained: Session['total'] = null, retainedSource: Provenance | null = null;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].provenance.timestamp === ordered[start].provenance.timestamp) end++;
    const group = ordered.slice(start, end); start = end;
    const field = (name: keyof Observation) => {
      const candidates = group.filter(row => row[name] !== undefined), live = candidates.filter(row => !row.legacy);
      return live.length ? live : candidates;
    };
    for (const [name, target] of [['model', 'model'], ['parent', 'parentId'], ['status', 'status']] as const) {
      const values = field(name); if (!values.length) continue;
      if (unique(values.map(row => row[name]))) {
        (result as any)[target] = values[0][name]; result.sources![name] = values[0].provenance;
      } else {
        (result as any)[target] = name === 'status' ? 'Unavailable' : null; delete result.sources![name];
        warn(`Conflicting ${name} records share a timestamp. The value is unavailable until newer evidence arrives.`);
      }
    }
    const totals = field('total').filter(row => row.total !== null);
    if (totals.length) {
      if (!unique(totals.map(row => row.total))) {
        result.total = null; result.provenance = null;
        warn('Conflicting cumulative records share a timestamp. Totals are unavailable until newer evidence arrives.');
      } else {
        const value = totals[0].total!;
        if (retained && (value.input < retained.input || value.output < retained.output || value.cached < retained.cached)) {
          warn('Cumulative counter decreased. Prior totals retained; total coverage is uncertain.');
          result.total = retained; result.provenance = retainedSource;
        } else result.total = retained = value, result.provenance = retainedSource = totals[0].provenance;
      }
    }
    const latest = field('latest');
    if (latest.length) {
      result.latest = unique(latest.map(row => row.latest)) ? latest[0].latest! : null;
      result.context = result.latest && unique(latest.map(row => row.context ?? null)) ? latest[0].context ?? null : null;
      if (result.latest) result.sources!.latest = latest[0].provenance; else delete result.sources!.latest;
      if (!unique(latest.map(row => row.latest))) warn('Conflicting latest usage records share a timestamp. Latest usage is unavailable until newer evidence arrives.');
    }
    const compact = group.find(row => row.compaction);
    if (compact) result.compactions.push({ timestamp: compact.provenance.timestamp, provenance: compact.provenance });
    if (group.some(row => row.boundary || row.compaction)) result.context = null;
    for (const row of group) if (row.warning) warn(row.warning);
  }
  return result;
}

function unique(values: unknown[]) { return values.every(value => JSON.stringify(value) === JSON.stringify(values[0])); }

test('live detailed usage without a window cannot revive a same-time legacy context estimate', () => {
  const old=observation(1,'legacy',{legacy:true,latest:usage(20,5,2),context:{used:25,limit:100,percent:25,kind:'estimate'}});
  const live=observation(1,'live',{latest:usage(40,10,3)});
  live.provenance={...live.provenance,event:'token_usage_record'};
  for(const rows of [[old,live],[live,old]]){
    const result=project('property-session',rows);
    assert.deepEqual(result.latest,usage(40,10,3));assert.equal(result.context,null);
  }
});

test('project is invariant under input order and matches an independent latest-evidence oracle', () => {
  const deltas = fc.array(fc.record({
    input: fc.integer({ min: 0, max: 5000 }),
    output: fc.integer({ min: 0, max: 500 }),
    cached: fc.integer({ min: 0, max: 500 }),
    latestInput: fc.integer({ min: 1, max: 5000 }),
    latestOutput: fc.integer({ min: 0, max: 500 }),
  }), { minLength: 1, maxLength: 24 });

  fc.assert(fc.property(deltas, fc.integer(), (steps, seed) => {
    const rows: Observation[] = [];
    let cumulative = { input: 0, output: 0, cached: 0 };
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      cumulative = {
        input: cumulative.input + step.input,
        output: cumulative.output + step.output,
        cached: cumulative.cached + Math.min(step.cached, step.input),
      };
      rows.push(observation(i, `row-${i}`, {
        total: usage(cumulative.input, cumulative.output, cumulative.cached),
        latest: usage(step.latestInput, step.latestOutput, Math.min(step.latestInput, step.cached)),
      }));
    }
    // A deterministic shuffle exercises ordering without recomputing the result.
    const shuffled = [...rows].sort((a, b) => {
      const mix = (value: string) => [...value].reduce((n, ch) => Math.imul(n ^ ch.charCodeAt(0), 16777619), seed | 0);
      return mix(a.key) - mix(b.key);
    });
    const ordered = project('property-session', rows);
    const permuted = project('property-session', shuffled);
    assert.deepEqual(permuted, ordered);
    assert.deepEqual(ordered.total, cumulative);
    assert.deepEqual(ordered.latest, rows.at(-1)!.latest);
    assert.equal(ordered.lastActivity, time(rows.length - 1));
  }), { numRuns: 160, seed: 20261022, endOnFailure: true });
});

test('same-time conflicting telemetry becomes unavailable, while later evidence resolves it', () => {
  const rows = [
    observation(1, 'a', { total: usage(100, 10, 40), latest: usage(50, 5, 20) }),
    observation(1, 'b', { total: usage(120, 10, 40), latest: usage(60, 5, 20) }),
  ];
  const conflicted = project('property-session', rows);
  assert.equal(conflicted.total, null);
  assert.equal(conflicted.latest, null);
  assert.ok(conflicted.warnings.some(message => message.includes('Conflicting cumulative')));
  assert.ok(conflicted.warnings.some(message => message.includes('Conflicting latest')));

  const resolved = project('property-session', [...rows, observation(2, 'c', {
    total: usage(140, 12, 50), latest: usage(20, 2, 5),
  })]);
  assert.deepEqual(resolved.total, usage(140, 12, 50));
  assert.deepEqual(resolved.latest, usage(20, 2, 5));
});

test('positive control: swapping source evidence changes the expected latest value', () => {
  const rows = [
    observation(1, 'old', { total: usage(100, 10, 40) }),
    observation(2, 'new', { total: usage(140, 12, 50) }),
  ];
  const before = project('property-session', rows);
  const changed = project('property-session', [rows[0], observation(2, 'new', { total: usage(141, 12, 50) })]);
  assert.deepEqual(before.total, usage(140, 12, 50));
  assert.notDeepEqual(changed.total, before.total);
});

test('streamed projection matches the independent array reducer across generated conflicts and boundaries', () => {
  const arbitrary = fc.array(fc.record({
    second: fc.integer({ min: 0, max: 8 }),
    hasModel: fc.boolean(), model: fc.constantFrom('gpt-5', 'gpt-4.1', null),
    hasStatus: fc.boolean(), status: fc.constantFrom('Running', 'Completed', 'Interrupted'),
    totalKind: fc.constantFrom('absent', 'null', 'value'), input: fc.integer({ min: 0, max: 500 }), output: fc.integer({ min: 0, max: 60 }), cached: fc.integer({ min: 0, max: 500 }),
    hasLatest: fc.boolean(), latestInput: fc.integer({ min: 0, max: 500 }), latestOutput: fc.integer({ min: 0, max: 60 }), latestCached: fc.integer({ min: 0, max: 500 }),
    boundary: fc.boolean(), compaction: fc.boolean(), legacy: fc.boolean(),
  }), { minLength: 1, maxLength: 90 });
  fc.assert(fc.property(arbitrary, rows => {
    const observations = rows.map((row, index) => observation(row.second, `key-${String(index).padStart(3, '0')}`, {
      ...(row.hasModel ? { model: row.model } : {}),
      ...(row.hasStatus ? { status: row.status } : {}),
      ...(row.totalKind === 'null' ? { total: null } : row.totalKind === 'value' ? { total: usage(row.input, row.output, Math.min(row.cached, row.input)) } : {}),
      ...(row.hasLatest ? { latest: usage(row.latestInput, row.latestOutput, Math.min(row.latestCached, row.latestInput)),
        context: { used: 25, limit: 100, percent: 25, kind: 'estimate' as const } } : {}),
      boundary: row.boundary, compaction: row.compaction, legacy: row.legacy,
      provenance: { file: `file-${index % 3}.jsonl`, line: index + 1, event: 'token_count', timestamp: time(row.second) },
    }));
    assert.deepEqual(project('property-session', observations), referenceProject('property-session', observations));
  }), { numRuns: 120, seed: 20261022, endOnFailure: true });
});

test('same-time null totals do not conflict with valid totals and live null suppresses legacy seed', () => {
  const valid = observation(1, 'z-valid', { total: usage(20, 3, 2) });
  const liveNull = observation(1, 'a-null', { total: null });
  assert.deepEqual(project('property-session', [valid, liveNull]).total, usage(20, 3, 2));
  assert.deepEqual(project('property-session', [liveNull, valid]).total, usage(20, 3, 2));

  const legacy = observation(1, 'legacy-seed', { total: usage(20, 3, 2), legacy: true });
  assert.equal(project('property-session', [legacy, liveNull]).total, null);
  assert.deepEqual(project('property-session', [legacy, liveNull]), referenceProject('property-session', [legacy, liveNull]));
});
