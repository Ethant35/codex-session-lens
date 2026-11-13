// Author: Ethan
import React, { useEffect, useState } from 'react';
import type { Preferences, WeeklyState } from '../shared';
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const dateText = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function priorWeek() {
  const end = new Date(); end.setHours(12,0,0,0);
  end.setDate(end.getDate() - ((end.getDay()+6)%7) - 1);
  const start = new Date(end); start.setDate(start.getDate()-6);
  return { start: dateText(start), end: dateText(end) };
}
export function WeeklyView({ prefs, recovery }: { prefs: Preferences; recovery: boolean }) {
  const initial = priorWeek();
  const [start, setStart] = useState(initial.start), [end, setEnd] = useState(initial.end);
  const [state, setState] = useState<WeeklyState>({ status: 'idle' });
  const [error, setError] = useState(false);
  useEffect(() => {
    if (state.status !== 'running') return;
    let alive = true;
    const timer = window.setInterval(() => {
      void window.lens.weeklyStatus().then(next => { if (alive) setState(next); }).catch(() => { if (alive) setError(true); });
    }, 700);
    return () => { alive = false; window.clearInterval(timer); };
  }, [state.status]);
  useEffect(() => {
    let alive = true;
    void window.lens.weeklyStatus().then(next => { if (alive) setState(next); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [prefs.directories.join('\n'), prefs.paused, prefs.sampleMode, prefs.onboardingCompleted, recovery]);
  const blocked = recovery || prefs.sampleMode || prefs.onboardingCompleted === false || prefs.directories.length === 0;
  const running = state.status === 'running';
  const report = state.report;
  const act = async (cancel = false) => {
    setError(false);
    try { setState(await (cancel ? window.lens.weeklyCancel() : window.lens.weeklyScan(start, end))); }
    catch { setError(true); }
  };
  return <section className="weekly-card" aria-labelledby="weekly-title">
    <h2 id="weekly-title">Weekly usage</h2>
    <p className="field-hint">Read configured history folders. Report stays in memory.</p>
    <form onSubmit={event => { event.preventDefault(); void act(); }}>
      <div className="weekly-dates">
        <label className="field">From<input type="date" aria-label="Usage from date" required value={start} max={end || undefined} disabled={running} onChange={e => setStart(e.target.value)} /></label>
        <label className="field">Through<input type="date" aria-label="Usage through date" required value={end} min={start || undefined} disabled={running} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={blocked || running || !start || !end || start > end}>{running ? 'Scanning history…' : prefs.paused ? 'Scan once while HUD is paused' : 'Scan date range'}</button>
      {running && <button type="button" className="quiet-button" onClick={() => void act(true)}>Cancel history scan</button>}</div>
    </form>
    {blocked && <p className="field-hint">Use your session folders to scan history.</p>}
    <p className="field-hint">Both dates included · Mac time zone · cached input included in input</p>
    {error && <p role="alert">History scan could not start. Check the date range and session folders.</p>}
    {state.message && <p role="status">{state.message}</p>}
    <details className="weekly-help"><summary>Coverage and counting</summary>
      <p>Include both sessions and archived_sessions in Settings for full local history. Project names are read for this report. Missing logs can reduce totals.</p>
      <p>Each session contributes its own usage once. Descendant totals are informational and already included under those sessions.</p>
    </details>
    {report && <div aria-label="Weekly usage report">
      <p className="weekly-range">{report.startDate} through {report.endDate} · {report.timeZone}</p>
      <div className="weekly-totals">
        <div><span>Input</span><strong data-testid="weekly-input">{number.format(report.totals.input)}</strong></div>
        <div><span>Output</span><strong data-testid="weekly-output">{number.format(report.totals.output)}</strong></div>
        <div><span>Cached input</span><strong>{number.format(report.totals.cached)}</strong></div>
      </div>
      <p className="field-hint">{number.format(report.coverage.files)} files · {number.format(report.coverage.compressedFiles)} compressed · {number.format(report.coverage.sessions)} sessions · scanned {new Date(report.scannedAt).toLocaleString()}</p>
      {report.gaps.length > 0 && <details className="weekly-gaps" open><summary>Coverage gaps ({report.gaps.length})</summary><ul>{report.gaps.map((gap,i) => <li key={i}>{gap}</li>)}</ul></details>}
      <p className="field-hint">Ranked by input + output. Expand for session contributions.</p>
      <ol className="weekly-projects">{report.projects.map(project => <li key={project.id}>
        <details><summary><span>{project.label}{report.projects.filter(p => p.label === project.label).length > 1 ? ` · ${project.id.slice(0, 8)}` : ''}</span><strong>{number.format(project.totals.input + project.totals.output)} tokens</strong></summary>
          <p className="field-hint">Input {number.format(project.totals.input)} · output {number.format(project.totals.output)} · cached input {number.format(project.totals.cached)}</p>
          <ul className="weekly-sessions">{project.sessions.map(session => <li key={session.id}><details><summary><code>{session.id}</code><span>{number.format(session.totals.input + session.totals.output)} own tokens</span></summary>
            <p>Input {number.format(session.totals.input)} · output {number.format(session.totals.output)} · cached input {number.format(session.totals.cached)}</p>
            <p>Parent: <code>{session.parentId ?? 'Root run'}</code></p>
            <p>Descendants: {number.format(session.descendantTotals.input)} input · {number.format(session.descendantTotals.output)} output · {number.format(session.descendantTotals.cached)} cached input</p>
            {session.gaps.length > 0 && <ul>{session.gaps.map((gap,i) => <li key={i}>{gap}</li>)}</ul>}
          </details></li>)}</ul>
        </details>
      </li>)}</ol>
      {report.projects.length === 0 && <p>No recorded usage in this date range.</p>}
    </div>}
  </section>;
}
