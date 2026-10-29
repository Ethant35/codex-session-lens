import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CheckpointView, Preferences, Provenance, Session, Snapshot } from '../shared';

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

function FolderFields({ text, setText, busy, error, choose, prefix }: {
  text: string; setText(value: string): void; busy: boolean; error: boolean; choose(): void; prefix: string;
}) {
  const folders = text.split('\n').filter(Boolean);
  return <div className="folder-fields">
    <ul className="folder-list" aria-label="Session folders">{folders.map((folder, index) => <li key={index}>{folder}</li>)}</ul>
    <button type="button" className="quiet-button" disabled={busy} onClick={choose}>Choose folders…</button>
    <details className="manual-paths"><summary>Enter paths manually</summary>
      <label className="field">Session directories <span id={`${prefix}-directory-hint`} className="field-hint">One local path per line. Only these folders are watched.</span>
        <textarea aria-label="Session directories" aria-describedby={`${prefix}-directory-hint${error ? ' action-error' : ''}`} aria-invalid={error || undefined} value={text} onChange={event => setText(event.target.value)} rows={3} spellCheck={false} />
      </label>
    </details>
  </div>;
}

function LocalName({ name, save, busy }: { name: string; save(label: string): Promise<boolean>; busy: boolean }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  return <details className="local-name"><summary>{name ? 'Edit local name' : 'Name this session'}</summary>
    <form onSubmit={event => { event.preventDefault(); void save(value).then(ok => setSaved(ok)); }}>
      <label className="field">Local session name<input aria-label="Local session name" aria-describedby="alias-hint" maxLength={80} value={value} onChange={event => {setValue(event.target.value); setSaved(false);}} placeholder="For example, Contract review" /></label>
      <p id="alias-hint" className="field-hint">Your label for this ID, saved only on this Mac. It does not rename the Codex chat. Leave blank to remove it.</p>
      <button className="quiet-button" disabled={busy} type="submit">Save name</button>
      {saved && <span className="saved-name" role="status">Name saved</span>}
    </form>
  </details>;
}

function Checkpoints({ points, busy, act }: { points: CheckpointView[]; busy: boolean;
  act(action: 'create' | 'select' | 'delete', value: string): Promise<boolean> }) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const selected = points.find(point => point.selected);
  return <details className="checkpoints"><summary>Checkpoints{selected ? ` · ${selected.name}` : ''}</summary>
    {points.length > 0 && <label className="field">Compare from<select aria-label="Compare from checkpoint" disabled={busy} value={selected?.id ?? ''} onChange={event => { setSaved(false); void act('select', event.target.value); }}>
      <option value="" disabled>Select a checkpoint</option>
      {points.map(point => <option key={point.id} value={point.id}>{point.name} · {formatTime(point.createdAt)}</option>)}
    </select></label>}
    {selected && <div className="checkpoint-result" aria-label="Changes since checkpoint">
      <div className="checkpoint-grid">
        <Metric label="Observed input change" value={selected.delta?.input} testId="checkpoint-input" />
        <Metric label="Observed output change" value={selected.delta?.output} testId="checkpoint-output" />
        <Metric label="Cached input change · included in input" value={selected.delta?.cached} testId="checkpoint-cached" />
        <Metric label="Newly observed compactions" value={selected.observedCompactions} testId="checkpoint-compactions" />
      </div>
      <p className="field-hint">Baseline usage sample: {formatTime(selected.totalTimestamp)}</p>
      {selected.notes.map(note => <p className="field-hint" key={note}>{note}</p>)}
      <button type="button" className="danger-link" disabled={busy} onClick={() => { setSaved(false); void act('delete', selected.id); }}>Delete checkpoint</button>
    </div>}
    {saved && <span role="status">Checkpoint saved</span>}
    <p className="field-hint" id="checkpoint-help">Changes use observed records, including late arrivals. Missing records are not counted.</p>
    <details className="new-checkpoint" open={points.length === 0}><summary>New checkpoint</summary>
    <form onSubmit={event => { event.preventDefault(); void act('create', name.trim() || `Checkpoint ${points.length + 1}`).then(ok => { if (ok) { setName(''); setSaved(true); } }); }}>
      <label className="field">Checkpoint name<input aria-label="Checkpoint name" aria-describedby="checkpoint-help" value={name} maxLength={80} placeholder={`Checkpoint ${points.length + 1}`} onChange={event => { setName(event.target.value); setSaved(false); }} /></label>
      <button type="submit" className="quiet-button" disabled={busy || points.length >= 20}>Save checkpoint</button>
      {points.length >= 20 && <p className="field-hint">20 checkpoints saved. Delete one to save another.</p>}
    </form>
    </details>
  </details>;
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

  useEffect(() => {
    if (settingsOpen) document.querySelector<HTMLElement>('#settings-title')?.focus();
  }, [settingsOpen]);
  const prefs = snapshot?.preferences;
  const localName = (session: Session) => prefs?.aliases && Object.hasOwn(prefs.aliases, session.id) ? prefs.aliases[session.id] : undefined;
  const sessions = snapshot?.sessions ?? [];
  const selected = sessions.find(session => session.id === prefs?.selectedId) ?? (prefs?.sampleMode ? sessions[0] ?? null : null);
  const sorted = useMemo(() => [...sessions].sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity)), [sessions]);
  const recent = useMemo(() => {
    const recentIds = prefs?.recentIds ?? [];
    return recentIds.map(id => sessions.find(session => session.id === id)).filter((s): s is Session => !!s);
  }, [prefs?.recentIds, sessions]);
  const filtered = sorted.filter(session => `${localName(session) ?? ''} ${session.id} ${session.model ?? ''} ${prefs?.showProjectLabels ? session.projectLabel ?? '' : ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const children = selected ? sessions.filter(session => session.parentId === selected.id) : [];
  const showChildren = !!selected;

  const setPreference = (value: Partial<Preferences>) => mutate(() => window.lens.preferences(value));

  const chooseFolders = async () => {
    setBusy(true); setActionError(false);
    try {
      const folders = await window.lens.chooseDirectories();
      if (folders !== null) { setEditingDirectories(true); setDirectoriesText(folders.join('\n')); }
    } catch { setActionError(true); }
    finally { setBusy(false); }
  };
  const editFolders = (value: string) => { setEditingDirectories(true); setDirectoriesText(value); };
  const finishSetup = async (sampleMode: boolean) => {
    const saved = await setPreference({ onboardingCompleted: true, sampleMode });
    if (saved) setEditingDirectories(false);
  };
  const useSessionFolders = async () => {
    const directories = directoriesText.split('\n').map(item => item.trim()).filter(Boolean);
    const saved = await mutate(() => window.lens.preferences({ directories, onboardingCompleted: true, sampleMode: false }));
    if (saved) {
      setEditingDirectories(false);
      await mutate(() => window.lens.rescan());
    }
  };

  return <main className="app-shell" data-theme={prefs?.theme ?? 'system'} data-compact={prefs?.compact ? 'true' : 'false'}>
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true"><span /></div>
      <div className="brand-copy">
        <p className="brand-name">CODEX SESSION LENS</p>
      </div>
      <div className="top-actions">
        <button className="quiet-button" type="button" onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen} aria-controls={snapshot ? 'settings-panel' : undefined}>
          {settingsOpen ? 'Close settings' : 'Settings'}
        </button>
        <button className="icon-button" type="button" onClick={() => setPreference({ compact: !prefs?.compact })} aria-label={prefs?.compact ? 'Expand display' : 'Compact display'} title={prefs?.compact ? 'Expand' : 'Compact'}>
          <span>{prefs?.compact ? 'Expand' : 'Compact'}</span>
        </button>
      </div>
    </header>

    <a className="skip-link" href={loadError ? '#load-error' : snapshot?.recovery ? '#recovery-state' : '#session-selection'}>Skip to current content</a>

    {snapshot === null && !loadError && <section id="session-selection" className="loading-state" role="status" aria-live="polite" tabIndex={-1}>Loading local session data…</section>}

    {loadError && <div id="load-error" className="notice error" role="alert" tabIndex={-1}>Session data could not be read. Check the folder permissions or try again. <button type="button" className="text-button" onClick={() => void refresh()}>Try again</button></div>}
    {actionError && <div id="action-error" className="notice error" role="alert">Could not save this change. Check the folder path or setting and try again.</div>}

    {snapshot?.recovery && <section id="recovery-state" className="recovery-state" role="alert" aria-labelledby="recovery-title" tabIndex={-1}>
      <h1 id="recovery-title">Cache unavailable</h1>
      <p>{snapshot.recovery.message}</p>
      <p>Session source files are read-only. Cache recovery does not change or delete those files.</p>
      <div className="recovery-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void mutate(() => window.lens.recover('retry'))}>{busy ? 'Retrying…' : 'Retry cache'}</button>
        {snapshot.recovery.canRebuild && <details className="recovery-confirm">
          <summary>Back up and rebuild cache</summary>
          <p>This creates a retained backup, then clears local telemetry and resets preferences. Your session source files are not changed.</p>
          <button type="button" className="danger-button" disabled={busy} onClick={() => void mutate(() => window.lens.recover('rebuild'))}>{busy ? 'Rebuilding…' : 'Confirm backup and rebuild'}</button>
        </details>}
      </div>
    </section>}

    {snapshot && !snapshot.recovery && prefs?.onboardingCompleted === false && <section id="session-selection" className="onboarding" aria-label="Getting started" tabIndex={-1}>
      <div className="onboarding-copy">
        <h1>Choose your session folders</h1>
        <p>Read local Codex session files to see their token use. Prompts are not displayed or saved. Source files stay read-only.</p>
      </div>
      <FolderFields text={directoriesText} setText={editFolders} busy={busy} error={actionError} choose={() => void chooseFolders()} prefix="setup" />
      <div className="onboarding-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void useSessionFolders()}>{busy ? 'Scanning…' : 'Save folder and scan'}</button>
        <button type="button" className="quiet-button" disabled={busy} onClick={() => void finishSetup(true)}>Use synthetic sample</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => void finishSetup(false)}>Skip setup</button>
      </div>
      <p className="onboarding-note">Choose one session after scanning. Setup and the optional sample are available again in Settings.</p>
    </section>}

    {snapshot && !snapshot.recovery && prefs?.sampleMode && prefs.onboardingCompleted !== false && <div className="sample-notice">
      <div role="status" aria-live="polite"><strong>Synthetic sample data</strong></div>
      <button className="quiet-button" type="button" disabled={busy} onClick={() => void finishSetup(false)}>Use my sessions</button>
    </div>}

    {snapshot && !snapshot.recovery && prefs?.onboardingCompleted !== false && <section id="session-selection" className="session-bar" aria-label="Session selection" tabIndex={-1}>
      <div className="session-heading">
        <div>
          <h1 data-testid="selected-session-name">{selected ? localName(selected) ?? (prefs?.showProjectLabels ? selected.projectLabel : undefined) ?? selected.model ?? 'Selected session' : 'Select session'}</h1>
          {selected && <p className="selected-session-meta">{selected.model ?? 'Model unavailable'} · {formatTime(selected.lastActivity)}{prefs?.showProjectLabels && localName(selected) && selected.projectLabel ? ` · ${selected.projectLabel}` : ''}</p>}
        </div>
      </div>
      <details className="session-picker" key={selected?.id ?? 'empty'} open={!selected}>
      <summary>Switch session</summary>
      <label className="search-box">

        <input aria-label="Search sessions" type="search" placeholder={prefs?.showProjectLabels ? 'Search name, folder, ID, or model' : 'Search name, session ID, or model'} value={query} onChange={event => setQuery(event.target.value)} />
        <kbd>⌘ K</kbd>
      </label>
      {recent.length > 0 && !query && <div className="recent-row" aria-label="Recent sessions">
        <span className="section-label">RECENT</span>
        {recent.slice(0, 5).map(session => <button key={session.id} className={`recent-chip ${session.id === selected?.id ? 'selected' : ''}`} onClick={() => void mutate(() => window.lens.select(session.id))} type="button" title={session.id}>
          <span className="recent-dot" />{localName(session) ?? session.model ?? 'Unknown model'} <small>{session.id.slice(0, 8)}</small>
        </button>)}
      </div>}
      <div className="session-list" aria-label="Available sessions">
        {filtered.map(session => <button key={session.id} type="button" aria-pressed={session.id === selected?.id} data-testid={`session-${session.id}`} className={`session-option ${session.id === selected?.id ? 'selected' : ''}`} onClick={() => void mutate(() => window.lens.select(session.id))}>
          <span className="session-option-main"><span className="session-dot" /> <span className="session-option-model">{localName(session) ?? (prefs?.showProjectLabels ? session.projectLabel : undefined) ?? session.model ?? 'Unknown model'}</span></span>
          <span className="session-option-meta">{localName(session) ? `${session.model ?? 'Unknown model'} · ` : ''}{session.id.slice(0, 12)} · {formatTime(session.lastActivity)}</span>
        </button>)}
        {filtered.length === 0 && <p className="list-empty">{sessions.length ? 'No sessions match that search.' : 'No sessions found yet.'}</p>}
      </div>
      </details>
    </section>}

    {snapshot && !snapshot.recovery && prefs?.onboardingCompleted !== false && selected ? <>
      <section className="summary-card" aria-label="Selected session metrics">
        <div className="metrics-grid">
          <Metric label="Input · session total" value={selected.total?.input} testId="total-input" />
          <Metric label="Output · session total" value={selected.total?.output} testId="total-output" />
          <div className="context-area">
            <div className="context-heading"><span className="context-label">Context · last request</span>
              {selected.context ? <strong className="context-value" data-testid="context-value">{number.format(selected.context.percent)}<small>%</small></strong> : <strong className="context-value unavailable" data-testid="context-value">Unavailable</strong>}
            </div>
            {selected.context ? <>
              <div className="meter" role="img" aria-label={`Estimated context use ${selected.context.percent} percent`}><span style={{ width: `${Math.max(0, Math.min(100, selected.context.percent))}%` }} /></div>
              <p className="context-note" data-testid="context-note">Estimate · {number.format(selected.context.used)} of {number.format(selected.context.limit)} · current occupancy unknown</p>
            </> : <p className="context-note" data-testid="context-note">Estimate unavailable · occupancy unknown</p>}
          </div>
        </div>
        {selected.warnings.length > 0 && <div className="warnings" role="status">{selected.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div>}
        {!prefs?.sampleMode && <Checkpoints key={selected.id} points={snapshot.checkpoints ?? []} busy={busy}
          act={(action, value) => mutate(() => window.lens.checkpoint(action, selected.id, value))} />}
        <details className="summary-details" open={!prefs?.compact}><summary>Details</summary>
          {!prefs?.sampleMode && <LocalName key={selected.id} name={localName(selected) ?? ''} save={label => mutate(() => window.lens.alias(selected.id, label))} busy={busy} />}
          <div className="details-fields">
            <div className="identity-text"><span className="section-label">SESSION ID</span><h2 data-testid="session-id" title={selected.id}>{selected.id}</h2></div>
            <div className="model-block"><span className="section-label">MODEL</span><strong data-testid="model">{selected.model ?? 'Unavailable'}</strong></div>
            <div className="status-block"><span className="section-label">STATUS</span><strong>{selected.status || 'Unavailable'}</strong><small>Last observed {formatTime(selected.lastActivity)}</small></div>
          </div>
          {prefs?.showProjectLabels && selected.projectLabel && <p className="project-label-note">Project folder · {selected.projectLabel}</p>}
          <Metric label="Cached input · included in input" value={selected.total?.cached} testId="total-cached" />
          {selected.latest && <div className="latest-strip">
            <div><span className="section-label">LATEST REQUEST</span><p>Separate from cumulative session totals</p></div>
            <span>In <b>{number.format(selected.latest.input)}</b></span>
            <span>Out <b>{number.format(selected.latest.output)}</b></span>
            <span>Cached input <b>{number.format(selected.latest.cached)}</b></span>
          </div>}
          <details className="metric-sources"><summary>Metric sources</summary>
            {selected.provenance && <div><span className="section-label">Cumulative usage</span><Provenance {...selected.provenance} /></div>}
            {Object.entries(selected.sources ?? {}).map(([metric,source]) => source && <div key={metric}><span className="section-label">{metric === 'latest' ? 'Latest request / context sample' : metric}</span><Provenance {...source} /></div>)}
          </details>
          <div className="details-grid">
            {showChildren && <details className="detail-card" open={children.length > 0}>
              <summary><span>Subagents</span><span className="detail-count">{children.length ? children.length : '—'}</span></summary>
              {children.length ? <div className="detail-content">{children.map(child => <div className="child-row" key={child.id}><div><strong>{localName(child) ?? child.model ?? 'Unknown model'}</strong><small>{child.id}</small></div><span>{child.status}</span></div>)}</div> : <p className="detail-content subdued">Unavailable. No distinguishable child session was observed.</p>}
            </details>}
            <details className="detail-card">
              <summary><span>Compaction history</span><span className="detail-count">{selected.compactions.length ? selected.compactions.length : '—'}</span></summary>
              {selected.compactions.length ? <ol className="timeline">{selected.compactions.map((event, index) => <li key={`${event.timestamp}-${index}`}><span className="timeline-marker" /><div><strong>Context compacted</strong><small>{formatTime(event.timestamp)}</small><Provenance {...event.provenance} /></div></li>)}</ol> : <p className="detail-content subdued">No recorded compaction events for this session.</p>}
            </details>
          </div>
        </details>
      </section>
    </> : snapshot && !snapshot.recovery && prefs?.onboardingCompleted !== false ? <section className="empty-card">
      <h2>{sessions.length ? 'Select a session' : 'No local sessions'}</h2>
      <p>{sessions.length ? 'Use the session selector above.' : 'Review your session folders in Settings, or start a Codex session and rescan.'}</p>
      <button className="quiet-button" type="button" onClick={() => void mutate(() => window.lens.rescan())}>Rescan sessions</button>
    </section> : null}

    {snapshot && <section id="settings-panel" className="settings-card" aria-label="Settings and diagnostics" hidden={!settingsOpen}>
      <div className="settings-title"><h2 id="settings-title" tabIndex={-1}>Settings & diagnostics</h2><button type="button" className="quiet-button" onClick={() => void mutate(() => window.lens.rescan())}>Rescan</button></div>
      <div className="settings-grid">
        <label className="field">Theme<select aria-label="Theme" value={prefs?.theme ?? 'system'} onChange={event => setPreference({ theme: event.target.value as Preferences['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="toggle-field"><input type="checkbox" checked={prefs?.alwaysOnTop ?? false} onChange={event => setPreference({ alwaysOnTop: event.target.checked })} />Always on top</label>
        <label className="toggle-field"><input type="checkbox" checked={prefs?.paused ?? false} onChange={event => setPreference({ paused: event.target.checked })} />Pause ingestion</label>
        <label className="toggle-field"><input type="checkbox" aria-describedby="project-label-help" checked={prefs?.showProjectLabels ?? false} onChange={event => setPreference({ showProjectLabels: event.target.checked })} />Show project folder labels</label>
      </div>
      <p id="project-label-help" className="setting-note">Stores local folder names from session metadata. Names may repeat.</p>
      <h3 className="folders-title">Session folders</h3>
      <FolderFields text={directoriesText} setText={editFolders} busy={busy} error={actionError} choose={() => void chooseFolders()} prefix="settings" />
      <div className="form-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => { const directories = directoriesText.split('\n').map(item => item.trim()).filter(Boolean); void mutate(() => window.lens.preferences({ directories })).then(saved => { if (saved) setEditingDirectories(false); }); }}>Save directories</button>
        {clearPending ? <><span className="confirm-copy">This clears telemetry, local names and checkpoints, then pauses ingestion.</span><button className="danger-button" type="button" disabled={busy} onClick={() => { void mutate(() => window.lens.clear()); setClearPending(false); }}>Confirm clear</button><button type="button" className="quiet-button" onClick={() => setClearPending(false)}>Cancel</button></> : <button type="button" className="danger-link" onClick={() => setClearPending(true)}>Clear telemetry</button>}</div>
      <div className="diagnostics">
        <div className="diagnostics-head"><span className="section-label">DIAGNOSTICS</span><span>{snapshot?.diagnostics.files ?? 0} files scanned</span></div>
        <div className="diagnostic-stats"><span><b>{snapshot?.diagnostics.errors ?? 0}</b> ingestion errors</span><span><b>{snapshot?.diagnostics.blockedRequests ?? 0}</b> blocked requests</span><span>Last scan <b>{formatTime(snapshot?.diagnostics.lastScan)}</b></span></div>
        {(snapshot?.diagnostics.messages ?? []).length > 0 ? <ul>{snapshot!.diagnostics.messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul> : <p className="subdued">No diagnostic messages.</p>}
      </div>
      <details className="help-details"><summary>About selection and updates</summary><p>Selection is manual. Session Lens cannot identify your foreground Codex chat. Local names are labels you assign, not verified chat titles. Prompts and messages are not collected.</p><p>To update, download the next release from github.com/Ethant35/codex-session-lens/releases, quit Session Lens, and replace the app in Applications. Your cache and settings stay on this Mac.</p></details>
      <div className="setup-replay"><button type="button" className="text-button" disabled={busy} onClick={() => { setSettingsOpen(false); void setPreference({ onboardingCompleted: false, sampleMode: false }); }}>Show setup</button></div>
    </section>}

    <footer className="footer"><span>{busy ? 'Saving…' : snapshot?.recovery ? 'Cache unavailable' : prefs?.sampleMode ? 'Sample · no live scan' : prefs?.onboardingCompleted === false ? 'Choose folders to begin' : prefs?.paused ? 'Ingestion paused' : 'Watching session folders'}</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
