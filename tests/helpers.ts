import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface LensRun {
  app: ElectronApplication;
  page: Page;
  root: string;
  source: string;
  data: string;
  close(): Promise<void>;
}

export interface SessionFixture {
  id: string;
  model?: string;
  timestamp?: string;
  parentId?: string;
  contextWindow?: number;
}

export interface UsageFixture {
  input: number;
  output: number;
  cached?: number;
}

const iso = (timestamp?: string) => timestamp ?? new Date(Date.now() + 1_000).toISOString();
const usage = (value: UsageFixture) => ({
  input_tokens: value.input,
  output_tokens: value.output,
  cached_input_tokens: value.cached ?? 0,
});

export async function launchLens(source?: string, data?: string): Promise<LensRun> {
  const root = await mkdtemp(join(tmpdir(), 'codex-session-lens-e2e-'));
  const sessionDir = source ? resolve(source) : join(root, 'sessions');
  const dataDir = data ? resolve(data) : join(root, 'app-data');
  await Promise.all([mkdir(sessionDir, { recursive: true }), mkdir(dataDir, { recursive: true })]);

  const executablePath = process.env.LENS_EXECUTABLE || resolve('release/mac-arm64/Codex Session Lens.app/Contents/MacOS/Codex Session Lens');
  const app = await electron.launch({
    executablePath,
    args: [],
    env: { ...process.env, LENS_DATA_DIR: dataDir, LENS_SESSION_DIR: sessionDir },
  });
  let page: Page;
  try {
    page = await app.firstWindow();
    await page.getByText('CODEX SESSION LENS', { exact: true }).waitFor();
  } catch (error) {
    await stopApp(app);
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    app, page, root, source: sessionDir, data: dataDir,
    close: async () => {
      await stopApp(app);
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function closeLens(run: LensRun, removeFiles = true): Promise<void> {
  await stopApp(run.app);
  if (removeFiles) await rm(run.root, { recursive: true, force: true });
}

async function stopApp(app: ElectronApplication): Promise<void> {
  const child = app.process();
  if (!child || child.exitCode !== null) return;
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      app.close(),
      new Promise<never>((_,reject) => { timeout=setTimeout(() => {child.kill('SIGKILL');reject(new Error('App did not close cleanly in five seconds'));},5000); }),
    ]);
  } finally { clearTimeout(timeout!); if (child.exitCode === null) child.kill('SIGKILL'); }
}

export async function addSession(source: string, fixture: SessionFixture): Promise<string> {
  const path = join(source, `${fixture.id}.jsonl`);
  const meta: Record<string, unknown> = { id: fixture.id, cwd: '/tmp/codex-session-lens-fixture' };
  if (fixture.parentId) meta.source = { subagent: { thread_spawn: { parent_thread_id: fixture.parentId, depth: 1 } } };
  const rows = [
    { timestamp: iso(fixture.timestamp), type: 'session_meta', payload: meta },
    { timestamp: iso(fixture.timestamp), type: 'turn_context', payload: { id: fixture.id, model: fixture.model ?? 'gpt-5-codex' } },
  ];
  await writeFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
  return path;
}

export async function appendTokenCount(path: string, id: string, opts: {
  total: UsageFixture;
  latest: UsageFixture;
  contextWindow?: number;
  timestamp?: string;
  event?: 'token_count' | 'token_usage_record';
}): Promise<void> {
  const info = {
    total_token_usage: usage(opts.total),
    last_token_usage: { ...usage(opts.latest), total_tokens: opts.latest.input + opts.latest.output },
    ...(opts.contextWindow === undefined ? {} : { model_context_window: opts.contextWindow }),
  };
  const event = opts.event ?? 'token_count';
  const payload = event === 'token_count'
    ? { type: 'token_count', thread_id: id, info }
    : { type: 'token_usage_record', thread_id: id, response_id: `response-${opts.timestamp ?? Date.now()}`, thread_token_usage: usage(opts.total), usage: { ...usage(opts.latest), total_tokens: opts.latest.input + opts.latest.output }, ...(opts.contextWindow === undefined ? {} : { model_context_window: opts.contextWindow }) };
  await appendFile(path, `${JSON.stringify({ timestamp: iso(opts.timestamp), type: 'event_msg', payload })}\n`, { mode: '0600' });
}

export async function appendEvent(path: string, event: string, id: string, timestamp?: string, extra: Record<string, unknown> = {}): Promise<void> {
  await appendFile(path, `${JSON.stringify({ timestamp: iso(timestamp), type: event, payload: { thread_id: id, ...extra } })}\n`, { mode: 0o600 });
}

export async function appendRaw(path: string, text: string): Promise<void> {
  await appendFile(path, text, { mode: 0o600 });
}

export async function rewriteSession(path: string, rows: Record<string, unknown>[]): Promise<void> {
  await writeFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
}

export async function rotateSession(path: string, rows: Record<string, unknown>[]): Promise<void> {
  const rotated = `${path}.rotated`;
  await rm(rotated, { force: true });
  await rename(path, rotated);
  await writeFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
}

export function record(type: string, payload: Record<string, unknown>, timestamp = new Date(Date.now() + 2_000).toISOString()) {
  return { timestamp, type, payload };
}
