import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Preferences, Provenance, Session, Snapshot } from '../shared';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function Metric({ label, value, testId }: { label: string; value: number | null | undefined; testId?: string }) {
  return <div className="metric">
    <span className="metric-label">{label}</span>
    <strong data-testid={testId}>{value == null ? 'Unavailable' : number.format(value)}</strong>
  </div>;
}

function Provenance({ file, line, event, timestamp }: Provenance) {
  return <p className="provenance">{file}:{line} · {event} · {formatTime(timestamp)}</p>;
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directoriesText, setDirectoriesText] = useState('');
  const [editingDirectories, setEditingDirectories] = useState(false);
  const [clearPending, setClearPending] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await window.lens.snapshot();
      setSnapshot(next);
      setLoadError(false);
      if (!editingDirectories) setDirectoriesText(next.preferences.directories.join('\n'));
    } catch {
      setLoadError(true);
    }
  }, [editingDirectories]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 700);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const mutate = useCallback(async (operation: () => Promise<Snapshot>) => {
    setBusy(true);
    setActionError(false);
    try {
      const next = await operation();
      setSnapshot(next);
      if (!editingDirectories) setDirectoriesText(next.preferences.directories.join('\n'));
      return true;
    } catch {
      setActionError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, [editingDirectories]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const selector = document.querySelector<HTMLDetailsElement>('.session-picker');
        if (selector) selector.open = true;
        document.querySelector<HTMLInputElement>('[aria-label="Search sessions"]')?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const prefs = snapshot?.preferences;
  const sessions = snapshot?.sessions ?? [];
  const selected = sessions.find(session => session.id === prefs?.selectedId) ?? null;
  const sorted = useMemo(() => [...sessions].sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity)), [sessions]);
  const recent = useMemo(() => {
    const recentIds = prefs?.recentIds ?? [];
    return recentIds.map(id => sessions.find(session => session.id === id)).filter((s): s is Session => !!s);
  }, [prefs?.recentIds, sessions]);
  const filtered = sorted.filter(session => `${session.id} ${session.model ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const children = selected ? sessions.filter(session => session.parentId === selected.id) : [];
  const showChildren = !!selected;

  const setPreference = (value: Partial<Preferences>) => mutate(() => window.lens.preferences(value));

  return <main className="app-shell" data-theme={prefs?.theme ?? 'system'} data-compact={prefs?.compact ? 'true' : 'false'}>
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true"><span /></div>
      <div className="brand-copy">
        <p className="eyebrow">CODEX SESSION LENS</p>
        <span className="connection"><i /> Local session telemetry</span>
      </div>
      <div className="top-actions">
        <button className="quiet-button" type="button" onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen}>
          {settingsOpen ? 'Close settings' : 'Settings'}
        </button>
        <button className="icon-button" type="button" onClick={() => setPreference({ compact: !prefs?.compact })} aria-label={prefs?.compact ? 'Expand display' : 'Compact display'} title={prefs?.compact ? 'Expand' : 'Compact'}>
          {prefs?.compact ? '↗' : '↙'} <span>{prefs?.compact ? 'Expand' : 'Compact'}</span>
        </button>
      </div>
    </header>

    {loadError && <div className="notice error" role="status">Session data could not be read. The HUD will keep trying.</div>}
    {actionError && <div className="notice error" role="alert">That change could not be saved. Try again.</div>}

    <section className="session-bar" aria-label="Session selection">
      <div className="session-heading">
        <div>
          <p className="eyebrow">MANUAL SESSION</p>
          <h1>{selected ? 'Selected conversation' : 'Choose a conversation'}</h1>
        </div>
        <span className="manual-badge">Manual mode</span>
      </div>
      <p className="support-note">Automatic switching to the foreground Codex conversation is unsupported. Choose a local session below.</p>
      <details className="session-picker" key={selected?.id ?? 'empty'} open={!selected}>
      <summary>Switch session</summary>
      <label className="search-box">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input aria-label="Search sessions" type="search" placeholder="Search by session ID or model" value={query} onChange={event => setQuery(event.target.value)} />
        <kbd>⌘ K</kbd>
      </label>
      {recent.length > 0 && !query && <div className="recent-row" aria-label="Recent sessions">
        <span className="section-label">RECENT</span>
        {recent.slice(0, 5).map(session => <button key={session.id} className={`recent-chip ${session.id === selected?.id ? 'selected' : ''}`} onClick={() => void mutate(() => window.lens.select(session.id))} type="button" title={session.id}>
          <span className="recent-dot" />{session.model ?? 'Unknown model'} <small>{session.id.slice(0, 8)}</small>
        </button>)}
      </div>}
      <div className="session-list" aria-label="Available sessions">
        {filtered.map(session => <button key={session.id} type="button" aria-pressed={session.id === selected?.id} data-testid={`session-${session.id}`} className={`session-option ${session.id === selected?.id ? 'selected' : ''}`} onClick={() => void mutate(() => window.lens.select(session.id))}>
          <span className="session-option-main"><span className="session-dot" /> <span className="session-option-model">{session.model ?? 'Unknown model'}</span></span>
          <span className="session-option-meta">{session.id.slice(0, 12)} · {formatTime(session.lastActivity)}</span>
        </button>)}
        {filtered.length === 0 && <p className="list-empty">{sessions.length ? 'No sessions match that search.' : 'No sessions found yet.'}</p>}
      </div>
      </details>
    </section>

    {selected ? <>
      <section className="summary-card" aria-label="Selected session details">
        <div className="summary-head">
          <div className="session-ident">
            <div className="session-glyph" aria-hidden="true">◉</div>
            <div className="identity-text">
              <span className="section-label">SESSION ID</span>
              <h2 data-testid="session-id" title={selected.id}>{selected.id}</h2>
            </div>
          </div>
          <div className="model-block"><span className="section-label">MODEL</span><strong data-testid="model">{selected.model ?? 'Unavailable'}</strong></div>
          <div className="status-block"><span className="section-label">LAST OBSERVED</span><strong>{selected.status || 'Unavailable'}</strong><small>{formatTime(selected.lastActivity)}</small></div>
        </div>
        <div className="metrics-grid">
          <Metric label="Total input" value={selected.total?.input} testId="total-input" />
          <Metric label="Total output" value={selected.total?.output} testId="total-output" />
          <Metric label="Cached input · included in input" value={selected.total?.cached} testId="total-cached" />
        </div>
        {selected.latest && <div className="latest-strip">
          <div><span className="section-label">LATEST REQUEST</span><p>Separate from cumulative session totals</p></div>
          <span>In <b>{number.format(selected.latest.input)}</b></span>
          <span>Out <b>{number.format(selected.latest.output)}</b></span>
          <span>Cached input <b>{number.format(selected.latest.cached)}</b></span>
        </div>}
        <div className="context-area">
          <div className="context-heading"><div><span className="section-label">CONTEXT</span><p>Last request estimate</p></div>
            {selected.context ? <strong className="context-value" data-testid="context-value">{number.format(selected.context.percent)}<small>%</small></strong> : <strong className="context-value unavailable" data-testid="context-value">Unavailable</strong>}
          </div>
          {selected.context ? <>
            <div className="meter" role="img" aria-label={`Estimated context use ${selected.context.percent} percent`}><span style={{ width: `${Math.max(0, Math.min(100, selected.context.percent))}%` }} /></div>
            <p className="context-note">ESTIMATE · {number.format(selected.context.used)} of {number.format(selected.context.limit)} tokens in the last request. Current context occupancy is unavailable.</p>
          </> : <p className="context-note">Current context occupancy is unavailable because the limit or effective occupancy could not be established.</p>}
        </div>
        {selected.provenance && <Provenance {...selected.provenance} />}
        {selected.warnings.length > 0 && <div className="warnings">{selected.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div>}
      </section>

      <div className="details-grid">
        {showChildren && <details className="detail-card" open={children.length > 0}>
          <summary><span className="detail-icon">↳</span><span>Subagents</span><span className="detail-count">{children.length ? children.length : '—'}</span></summary>
          {children.length ? <div className="detail-content">{children.map(child => <div className="child-row" key={child.id}><div><strong>{child.model ?? 'Unknown model'}</strong><small>{child.id}</small></div><span>{child.status}</span></div>)}</div> : <p className="detail-content subdued">Unavailable. No distinguishable child session was observed.</p>}
        </details>}
        <details className="detail-card">
          <summary><span className="detail-icon">↻</span><span>Compaction history</span><span className="detail-count">{selected.compactions.length}</span></summary>
          {selected.compactions.length ? <ol className="timeline">{selected.compactions.map((event, index) => <li key={`${event.timestamp}-${index}`}><span className="timeline-marker" /><div><strong>Context compacted</strong><small>{formatTime(event.timestamp)}</small><Provenance {...event.provenance} /></div></li>)}</ol> : <p className="detail-content subdued">No recorded compaction events for this session.</p>}
        </details>
      </div>
    </> : <section className="empty-card">
      <div className="empty-illustration" aria-hidden="true"><span /><span /><span /></div>
      <h2>{sessions.length ? 'Select a session to inspect' : 'Waiting for local sessions'}</h2>
      <p>{sessions.length ? 'Choose a session above to see its observed token usage and context estimate.' : 'Codex Session Lens reads session telemetry stored on this Mac. New sessions appear automatically.'}</p>
      <button className="quiet-button" type="button" onClick={() => void mutate(() => window.lens.rescan())}>Rescan sessions</button>
    </section>}

    {settingsOpen && <section className="settings-card" aria-label="Settings and diagnostics">
      <div className="settings-title"><div><span className="section-label">PREFERENCES</span><h2>Settings & diagnostics</h2></div><button type="button" className="quiet-button" onClick={() => void mutate(() => window.lens.rescan())}>Rescan</button></div>
      <div className="settings-grid">
        <label className="field">Theme<select aria-label="Theme" value={prefs?.theme ?? 'system'} onChange={event => setPreference({ theme: event.target.value as Preferences['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="toggle-field"><input type="checkbox" checked={prefs?.alwaysOnTop ?? false} onChange={event => setPreference({ alwaysOnTop: event.target.checked })} />Always on top</label>
        <label className="toggle-field"><input type="checkbox" checked={prefs?.paused ?? false} onChange={event => setPreference({ paused: event.target.checked })} />Pause ingestion</label>
      </div>
      <label className="field directory-field">Session directories <span className="field-hint">One local path per line</span>
        <textarea aria-label="Session directories" value={directoriesText} onFocus={() => setEditingDirectories(true)} onChange={event => { setDirectoriesText(event.target.value); setEditingDirectories(true); }} rows={3} spellCheck={false} />
      </label>
      <div className="form-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => { const directories = directoriesText.split('\n').map(item => item.trim()).filter(Boolean); void mutate(() => window.lens.preferences({ directories })).then(saved => { if (saved) setEditingDirectories(false); }); }}>Save directories</button>
        {clearPending ? <><span className="confirm-copy">This clears saved telemetry and pauses ingestion.</span><button className="danger-button" type="button" disabled={busy} onClick={() => { void mutate(() => window.lens.clear()); setClearPending(false); }}>Confirm clear</button><button type="button" className="quiet-button" onClick={() => setClearPending(false)}>Cancel</button></> : <button type="button" className="danger-link" onClick={() => setClearPending(true)}>Clear telemetry</button>}</div>
      <div className="diagnostics">
        <div className="diagnostics-head"><span className="section-label">DIAGNOSTICS</span><span>{snapshot?.diagnostics.files ?? 0} files scanned</span></div>
        <div className="diagnostic-stats"><span><b>{snapshot?.diagnostics.errors ?? 0}</b> ingestion errors</span><span><b>{snapshot?.diagnostics.blockedRequests ?? 0}</b> blocked requests</span><span>Last scan <b>{formatTime(snapshot?.diagnostics.lastScan)}</b></span></div>
        {(snapshot?.diagnostics.messages ?? []).length > 0 ? <ul>{snapshot!.diagnostics.messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul> : <p className="subdued">No diagnostic messages.</p>}
      </div>
    </section>}

    <footer className="footer"><span>Local only · prompts are not displayed</span><span>{busy ? 'Saving…' : prefs?.paused ? 'Ingestion paused' : 'Watching for updates'}</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
