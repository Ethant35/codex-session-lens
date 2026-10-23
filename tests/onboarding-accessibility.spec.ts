import { test, expect } from '@playwright/test';
import axe from 'axe-core';
import { addSession, appendTokenCount, closeLens, launchLens } from './helpers';
import type { Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}
interface AxeApi {
  run(context?: Element | Document, options?: { runOnly?: { type: 'rule'; values: string[] } }): Promise<{ violations: AxeViolation[] }>;
}

const axePositiveControlPassed = new WeakSet<Page>();
const screenshotDirectory = join(process.cwd(), '.local/readiness-screens');

async function captureState(page: Page, name: string) {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), animations: 'disabled' });
}

async function expectNoSeriousAxeViolations(page: Page, state: string) {
  const devtools = await page.context().newCDPSession(page);
  try {
    await devtools.send('Page.enable');
    await devtools.send('Page.setBypassCSP', { enabled: true });
    const axeLoaded = await page.evaluate(() => Boolean((window as Window & { axe?: AxeApi }).axe));
    if (!axeLoaded) {
      const injected = await devtools.send('Runtime.evaluate', {
        expression: axe.source,
        allowUnsafeEvalBlockedByCSP: true,
        awaitPromise: true,
      });
      if (injected.exceptionDetails) throw new Error(`axe injection failed: ${injected.exceptionDetails.text}`);
    }
    if (!axePositiveControlPassed.has(page)) {
      const detectedKnownFailure = await page.evaluate(async () => {
        const axeApi = (window as Window & { axe?: AxeApi }).axe;
        if (!axeApi) throw new Error('axe-core did not load in the hidden test page');
        const probe = document.createElement('img');
        probe.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        probe.dataset.axePositiveControl = 'missing-alt';
        document.body.append(probe);
        try {
          const result = await axeApi.run(probe, { runOnly: { type: 'rule', values: ['image-alt'] } });
          return result.violations.some(violation => violation.id === 'image-alt');
        } finally {
          probe.remove();
        }
      });
      expect(detectedKnownFailure, 'axe must detect a deliberate missing-alt positive control').toBe(true);
      axePositiveControlPassed.add(page);
    }
    const violations = await page.evaluate(async () => {
      const axeApi = (window as Window & { axe?: AxeApi }).axe;
      if (!axeApi) throw new Error('axe-core did not load in the hidden test page');
      const result = await axeApi.run();
      return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious').map(item => ({
        id: item.id, impact: item.impact, help: item.help,
        nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
      }));
    });
    expect(violations, `${state} view has serious axe violations`).toEqual([]);
  } finally {
    await devtools.detach();
  }
}

test('fresh install offers a useful first result and can skip without changing source folders', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    const intro = run.page.getByRole('region', { name: 'Getting started' });
    await expect(intro).toBeVisible();
    await expect(intro).toContainText('local Codex session files');
    await expect(intro).toContainText('Prompts are not displayed');
    await expect(intro.getByRole('button', { name: 'Use synthetic sample' })).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'fresh setup');
    await captureState(run.page, 'setup');
    const before = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences.directories));
    await intro.getByRole('button', { name: 'Skip setup' }).click();
    await expect(intro).toBeHidden();
    await expect(run.page.getByText('No local sessions')).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'empty session');
    await captureState(run.page, 'real-empty');
    const prefs = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences));
    expect(prefs.sampleMode).toBe(false);
    expect(prefs.directories).toEqual(before);
  } finally { await closeLens(run); }
});

test('synthetic sample is clearly identified, can be left, and onboarding can be replayed', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    const intro = run.page.getByRole('region', { name: 'Getting started' });
    await intro.getByRole('button', { name: 'Use synthetic sample' }).click();
    await expect(run.page.getByText('Synthetic sample data', { exact: true })).toBeVisible();
    await expect(run.page.getByTestId('session-id')).toHaveText('sample-session');
    await expect(run.page.getByText(/synthetic.*not read from your session folders/i)).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'synthetic sample');
    await captureState(run.page, 'sample');

    await run.page.getByRole('button', { name: 'Use my sessions' }).click();
    await expect(run.page.getByText('No local sessions')).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'real-session empty state');
    const prefs = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences));
    expect(prefs.sampleMode).toBe(false);
    expect(prefs.onboardingCompleted).toBe(true);

    await run.page.getByRole('button', { name: 'Settings' }).click();
    await run.page.getByRole('button', { name: 'Show setup' }).click();
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'replayed setup');
  } finally { await closeLens(run); }
});

test('onboarding folder setup accepts a local path without opening a native chooser', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    const intro = run.page.getByRole('region', { name: 'Getting started' });
    await intro.getByText('Enter paths manually', { exact: true }).click();
    await intro.getByLabel('Session directories').fill('relative/path');
    await intro.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(run.page.getByRole('alert')).toContainText('Could not save this change');
    await expect(intro).toBeVisible();
    await expect(intro.getByLabel('Session directories')).toHaveValue('relative/path');
    await intro.getByLabel('Session directories').fill(run.source);
    await intro.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(intro).toBeHidden();
    const prefs = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences));
    expect(prefs.directories).toContain(run.source);
    expect(prefs.sampleMode).toBe(false);
    expect(prefs.onboardingCompleted).toBe(true);
  } finally { await closeLens(run); }
});

test('a missing absolute source folder reports a diagnosis and can be corrected', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    const missingPath = join(run.root, 'missing-absolute-session-folder');
    const intro = run.page.getByRole('region', { name: 'Getting started' });
    await intro.getByText('Enter paths manually', { exact: true }).click();
    await intro.getByLabel('Session directories').fill(missingPath);
    await intro.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(intro).toBeHidden();
    await expect(run.page.getByText('No local sessions')).toBeVisible();

    await run.page.getByRole('button', { name: 'Settings' }).click();
    const settings = run.page.getByRole('region', { name: 'Settings and diagnostics' });
    await expect(settings).toContainText('A configured directory is unavailable or unreadable.');
    await expect(settings).toContainText('1 ingestion errors');

    await run.page.getByRole('button', { name: 'Show setup' }).click();
    const replayedSetup = run.page.getByRole('region', { name: 'Getting started' });
    await replayedSetup.getByText('Enter paths manually', { exact: true }).click();
    await replayedSetup.getByLabel('Session directories').fill(run.source);
    await replayedSetup.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(replayedSetup).toBeHidden();
    await expect(run.page.getByText('No local sessions')).toBeVisible();
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(run.page.getByRole('region', { name: 'Settings and diagnostics' })).toContainText('0 ingestion errors');
  } finally { await closeLens(run); }
});

test('a transient snapshot IPC failure is announced and then recovers without duplicate targets', async () => {
  const run = await launchLens();
  try {
    const installed = await run.app.evaluate(({ ipcMain }) => {
      type Handler = ((event: unknown, ...args: unknown[]) => unknown) | { listener: (event: unknown, ...args: unknown[]) => unknown };
      const handlers = (ipcMain as typeof ipcMain & { _invokeHandlers?: Map<string, Handler> })._invokeHandlers;
      const original = handlers?.get('lens:snapshot');
      if (!handlers || !original) return false;
      (globalThis as typeof globalThis & { __lensOriginalSnapshotHandler?: Handler }).__lensOriginalSnapshotHandler = original;
      ipcMain.removeHandler('lens:snapshot');
      ipcMain.handle('lens:snapshot', (event, ...args) => {
        if ((globalThis as typeof globalThis & { __lensFailSnapshot?: boolean }).__lensFailSnapshot !== false) {
          throw new Error('test-only snapshot IPC failure');
        }
        return typeof original === 'function' ? original(event, ...args) : original.listener(event, ...args);
      });
      return true;
    });
    expect(installed, 'the test must install a one-shot renderer bridge failure').toBe(true);
    const error = run.page.locator('#load-error');
    await expect(error).toBeVisible();
    expect(await run.page.locator('#session-selection').count()).toBe(1);
    await expect(run.page.locator('.skip-link')).toHaveAttribute('href', '#load-error');
    await expectNoSeriousAxeViolations(run.page, 'transient snapshot IPC error');

    const restored = await run.app.evaluate(({ ipcMain }) => {
      type Handler = ((event: unknown, ...args: unknown[]) => unknown) | { listener: (event: unknown, ...args: unknown[]) => unknown };
      const saved = (globalThis as typeof globalThis & { __lensOriginalSnapshotHandler?: Handler }).__lensOriginalSnapshotHandler;
      if (saved) {
        ipcMain.removeHandler('lens:snapshot');
        ipcMain.handle('lens:snapshot', (event, ...args) => typeof saved === 'function' ? saved(event, ...args) : saved.listener(event, ...args));
      }
      (globalThis as typeof globalThis & { __lensFailSnapshot?: boolean }).__lensFailSnapshot = false;
      delete (globalThis as typeof globalThis & { __lensOriginalSnapshotHandler?: unknown }).__lensOriginalSnapshotHandler;
      return Boolean(saved);
    });
    expect(restored, 'the original main-process snapshot handler must be restored').toBe(true);
    await expect(run.page.evaluate(() => window.lens.snapshot())).resolves.toBeTruthy();
    await error.getByRole('button', { name: 'Try again' }).click();
    await expect(error).toBeHidden();
    expect(await run.page.locator('#session-selection').count()).toBe(1);
    await expect(run.page.locator('.skip-link')).toHaveAttribute('href', '#session-selection');
  } finally {
    await run.app.evaluate(({ ipcMain }) => {
      type Handler = ((event: unknown, ...args: unknown[]) => unknown) | { listener: (event: unknown, ...args: unknown[]) => unknown };
      const saved = (globalThis as typeof globalThis & { __lensOriginalSnapshotHandler?: Handler }).__lensOriginalSnapshotHandler;
      if (saved) {
        ipcMain.removeHandler('lens:snapshot');
        ipcMain.handle('lens:snapshot', (event, ...args) => typeof saved === 'function' ? saved(event, ...args) : saved.listener(event, ...args));
      }
      (globalThis as typeof globalThis & { __lensFailSnapshot?: boolean }).__lensFailSnapshot = false;
      delete (globalThis as typeof globalThis & { __lensOriginalSnapshotHandler?: unknown }).__lensOriginalSnapshotHandler;
    }).catch(() => {});
    await closeLens(run);
  }
});

test('session controls remain named and keyboard accessible at a narrow window width', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    await run.page.setViewportSize({ width: 360, height: 680 });
    await run.page.keyboard.press('Tab');
    await expect(run.page.locator(':focus')).toBeVisible();
    await expect(run.page.getByRole('button', { name: 'Settings' })).toHaveAccessibleName('Settings');
    const overflow = await run.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(run.page.getByRole('combobox', { name: 'Theme' })).toBeVisible();
    await expect(run.page.getByRole('checkbox', { name: 'Always on top' })).toBeVisible();
    await run.page.getByRole('combobox', { name: 'Theme' }).selectOption('system');
    const shell = run.page.locator('.app-shell');
    await run.page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => shell.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(244, 247, 246)');
    await expect.poll(() => shell.evaluate(element => getComputedStyle(element).color)).toBe('rgb(29, 48, 47)');
    await expectNoSeriousAxeViolations(run.page, 'system theme with light OS appearance');
    await run.page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => shell.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 26, 25)');
    await expect.poll(() => shell.evaluate(element => getComputedStyle(element).color)).toBe('rgb(228, 239, 235)');
    await expectNoSeriousAxeViolations(run.page, 'system theme with dark OS appearance');
    await run.page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await expectNoSeriousAxeViolations(run.page, 'settings in dark theme');
    await captureState(run.page, 'dark');
    await run.page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
    await captureState(run.page, 'light-debug');
    await expectNoSeriousAxeViolations(run.page, 'settings in light theme');
    await captureState(run.page, 'light');
    await run.page.emulateMedia({ colorScheme: 'light' });
    await run.page.setViewportSize({ width: 360, height: 680 });
    await captureState(run.page, 'narrow');
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2));
    await captureState(run.page, 'zoom-200');
    const dimensions = await run.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('*')]
        .map(element => ({ selector: element.tagName.toLowerCase() + (element.className && typeof element.className === 'string' ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''), text: element.textContent?.trim().slice(0, 80), left: Math.floor(element.getBoundingClientRect().left), right: Math.ceil(element.getBoundingClientRect().right) }))
        .filter(element => element.right > window.innerWidth)
        .slice(0, 8),
    }));
    expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.innerWidth);
  } finally { await closeLens(run); }
});

test('long session identifiers and model names remain readable without horizontal overflow', async () => {
  const run = await launchLens();
  try {
    const id = `session-${'a'.repeat(112)}`;
    const model = `codex-${'long-model-name-'.repeat(5)}`;
    const file = await addSession(run.source, { id, model });
    await appendTokenCount(file, id, { total: { input: 12_345, output: 678, cached: 432 }, latest: { input: 900, output: 80, cached: 30 } });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    const option = run.page.getByTestId(`session-${id}`);
    await expect(option).toBeVisible();
    await option.click();
    await expect(run.page.getByTestId('session-id')).toHaveText(id);
    await expect(run.page.getByTestId('model')).toHaveText(model);
    await expect(run.page.getByTestId('total-input')).toHaveText('12,345');
    const overflow = await run.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await captureState(run.page, 'real-populated');
    await expectNoSeriousAxeViolations(run.page, 'long populated session');
  } finally { await closeLens(run); }
});

test('corrupt cache can be retried unchanged or explicitly backed up and rebuilt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lens-corrupt-cache-e2e-'));
  const source = join(root, 'sessions');
  const data = join(root, 'app-data');
  const sourceFixture = join(source, 'source-must-remain.jsonl');
  const cache = join(data, 'telemetry.sqlite');
  const corrupt = 'CORRUPT_CACHE_MUST_REMAIN_UNTIL_REBUILD';
  await Promise.all([mkdir(source), mkdir(data)]);
  await Promise.all([writeFile(sourceFixture, '{"source":"keep"}\n'), writeFile(cache, corrupt)]);
  const run = await launchLens(source, data, { fresh: true });
  try {
    const recovery = run.page.getByRole('alert', { name: 'Cache unavailable' });
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('read-only');
    await expect(run.page.locator('.skip-link')).toHaveAttribute('href', '#recovery-state');
    await expect(recovery.getByRole('button', { name: 'Retry cache' })).toBeVisible();
    await expect(recovery.getByText('Back up and rebuild cache')).toBeVisible();
    await expectNoSeriousAxeViolations(run.page, 'cache recovery');
    await captureState(run.page, 'recovery');

    await recovery.getByRole('button', { name: 'Retry cache' }).click();
    await expect(recovery).toBeVisible();
    expect(await readFile(cache, 'utf8')).toBe(corrupt);
    await expectNoSeriousAxeViolations(run.page, 'cache recovery after retry');

    await recovery.getByText('Back up and rebuild cache').click();
    await expect(recovery).toContainText('retained backup');
    await expect(recovery).toContainText('resets preferences');
    await expectNoSeriousAxeViolations(run.page, 'cache rebuild confirmation');
    await recovery.getByRole('button', { name: 'Confirm backup and rebuild' }).click();

    const setup = run.page.getByRole('region', { name: 'Getting started' });
    await expect(setup).toBeVisible();
    const snapshot = await run.page.evaluate(() => window.lens.snapshot());
    expect(snapshot.recovery).toBeUndefined();
    expect(snapshot.preferences.onboardingCompleted).toBe(false);
    expect(snapshot.preferences.sampleMode).toBe(false);
    expect(snapshot.sessions).toEqual([]);
    expect(await readFile(sourceFixture, 'utf8')).toBe('{"source":"keep"}\n');
    const backupDirectory = (await readdir(data)).find(name => name.startsWith('cache-backup-'));
    expect(backupDirectory).toBeDefined();
    expect(await readFile(join(data, backupDirectory!, 'telemetry.sqlite'), 'utf8')).toBe(corrupt);
    await expectNoSeriousAxeViolations(run.page, 'setup after cache rebuild');
  } finally {
    await closeLens(run);
    await rm(root, { recursive: true, force: true });
  }
});
