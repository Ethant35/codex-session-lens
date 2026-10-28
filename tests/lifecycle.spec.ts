// Author: Ethan
import { spawn, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { addSession, appendTokenCount, closeLens, launchLens, LIFECYCLE_EXIT_TIMEOUT_MS } from './helpers';

function waitForExit(child: ChildProcess, timeoutMs = LIFECYCLE_EXIT_TIMEOUT_MS) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveClose, reject) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error(`Session Lens process did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolveClose({ code, signal });
    };
    child.once('exit', onExit);
  });
}

async function waitForCachedSession(databasePath: string, id: string, child: ChildProcess, spawnError: () => Error | undefined) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (spawnError()) throw spawnError();
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Session Lens exited before saving the fixture (code=${child.exitCode}, signal=${child.signalCode})`);
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(databasePath, { readOnly: true });
      const row = db.prepare('SELECT value FROM sessions WHERE id=?').get(id) as { value: string } | undefined;
      if (row) return JSON.parse(row.value) as { id: string; total: { input: number; output: number; cached: number } | null };
    } catch {
      // The packaged app may not have created the database or completed its scan yet.
    } finally {
      db?.close();
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Session Lens did not persist the fixture within ten seconds');
}

async function waitForNewRun(diagnosticsPath: string, priorRunIds: Set<string>, child: ChildProcess, spawnError: () => Error | undefined) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (spawnError()) throw spawnError();
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Session Lens exited before startup (code=${child.exitCode}, signal=${child.signalCode})`);
    try {
      const records = JSON.parse(await readFile(diagnosticsPath, 'utf8')) as Array<{ event: string; runId: string }>;
      const started = records.find(record => record.event === 'started' && !priorRunIds.has(record.runId));
      if (started) return started.runId;
    } catch { /* Wait until the packaged app writes its startup record. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('Session Lens did not record a new startup run within ten seconds');
}

test('an uncaught private error exits cleanly and stores only a sanitized fatal diagnostic', async () => {
  const run = await launchLens();
  const child = run.app.process();
  const sentinel = 'PRIVATE_FATAL_TEST_SENTINEL_7e2a';
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => { stderr += chunk; });
  try {
    const exited = waitForExit(child);
    await run.app.evaluate((_electron, privateSentinel: string) => {
      setTimeout(() => { throw new Error(privateSentinel); }, 20);
    }, sentinel);
    const result = await exited;
    expect(result).toEqual({ code: 1, signal: null });
    expect(stderr).toContain('Session Lens stopped after an unexpected local error.');
    expect(stderr).not.toContain(sentinel);

    const diagnostics = JSON.parse(await readFile(join(run.data, 'diagnostics.json'), 'utf8')) as Array<Record<string, unknown>>;
    expect(diagnostics.at(-1)).toMatchObject({ event: 'fatal', category: 'unknown', entryPoint: 'background' });
    expect(JSON.stringify(diagnostics)).not.toContain(sentinel);
  } finally {
    await closeLens(run);
  }
});

test('native background SIGTERM waits for cache close and leaves an intact SQLite file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lens-sigterm-lifecycle-'));
  const source = join(root, 'sessions');
  const data = join(root, 'app-data');
  const databasePath = join(data, 'telemetry.sqlite');
  const sessionId = 'sigterm-session';
  let child: ChildProcess | undefined;
  let spawnFailure: Error | undefined;
  try {
    await Promise.all([mkdir(source), mkdir(data)]);
    const file = await addSession(source, { id: sessionId, timestamp: '2026-10-22T20:00:00.000Z' });
    await appendTokenCount(file, sessionId, {
      total: { input: 1_234, output: 210, cached: 500 },
      latest: { input: 400, output: 50, cached: 100 },
      timestamp: '2026-10-22T20:00:01.000Z',
    });

    // Seed a real returning-user cache so the test exercises a scan after first-run setup.
    const seed = await launchLens(source, data);
    try {
      await expect(seed.page.getByTestId(`session-${sessionId}`)).toBeVisible();
      const preferences = await seed.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences));
      expect(preferences.onboardingCompleted).toBe(true);
    } finally {
      await closeLens(seed);
    }

    const diagnosticPath = join(data, 'diagnostics.json');
    const before = JSON.parse(await readFile(diagnosticPath, 'utf8')) as Array<{ runId: string }>;
    const priorRunIds = new Set(before.map(record => record.runId));

    const executable = process.env.LENS_EXECUTABLE || resolve('release/mac-arm64/Codex Session Lens.app/Contents/MacOS/Codex Session Lens');
    child = spawn(executable, ['--background'], {
      env: { ...process.env, LENS_DATA_DIR: data, LENS_SESSION_DIR: source },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.on('error', error => { spawnFailure = error; });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => { stderr += chunk; });

    await waitForNewRun(diagnosticPath, priorRunIds, child, () => spawnFailure);
    const cached = await waitForCachedSession(databasePath, sessionId, child, () => spawnFailure);
    expect(cached).toMatchObject({
      id: sessionId,
      total: { input: 1_234, output: 210, cached: 500 },
    });

    // Direct spawn avoids Playwright's inspector, so code 0 proves the OS process exited normally.
    const exited = waitForExit(child);
    child.kill('SIGTERM');
    const result = await exited;
    expect(result).toEqual({ code: 0, signal: null });
    expect(stderr).not.toContain('uncaught');

    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      const row = db.prepare('SELECT value FROM sessions WHERE id=?').get(sessionId) as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(JSON.parse(row!.value)).toMatchObject({
        id: sessionId,
        total: { input: 1_234, output: 210, cached: 500 },
      });
    } finally {
      db.close();
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      try { await waitForExit(child, 1_000); }
      catch { child.kill('SIGKILL'); await waitForExit(child, 1_000).catch(() => undefined); }
    }
    await rm(root, { recursive: true, force: true });
  }
});
