// Author: Ethan
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { addSession, appendTokenCount, type LensRun, launchLens } from './helpers';

test('signed app reinstall preserves local state and deleting disposable data returns to fresh setup', async () => {
  test.setTimeout(120_000);
  const configuredExecutable = process.env.LENS_EXECUTABLE;
  expect(configuredExecutable, 'Set LENS_EXECUTABLE to the signed packaged app executable').toBeTruthy();
  expect(process.env.LENS_VISIBLE_TESTS, 'This journey must run hidden').toBe('0');

  const sourceExecutable = await realpath(configuredExecutable!);
  const sourceBundle = resolve(dirname(sourceExecutable), '..', '..');
  expect(sourceBundle).toMatch(/\.app$/);
  const privateTemp = await realpath(tmpdir());
  const root = await mkdtemp(join(privateTemp, 'codex-session-lens-install-'));
  const appFolder = join(root, 'Applications');
  const appBundle = join(appFolder, 'Codex Session Lens.app');
  const executable = join(appBundle, 'Contents', 'MacOS', 'Codex Session Lens');
  const source = join(root, 'sessions');
  const data = join(root, 'disposable-data');
  let run: LensRun | undefined;
  const originalExecutable = configuredExecutable;
  const install = () => execFileSync('/usr/bin/ditto', [sourceBundle, appBundle], { stdio: 'pipe' });
  const launchInstalled = async (fresh = false) => {
    process.env.LENS_EXECUTABLE = executable;
    try { return await launchLens(source, data, { fresh }); }
    finally {
      if (originalExecutable) process.env.LENS_EXECUTABLE = originalExecutable;
      else delete process.env.LENS_EXECUTABLE;
    }
  };

  try {
    await Promise.all([mkdir(appFolder), mkdir(source), mkdir(data)]);
    install();

    const sessionId = 'reinstall-session';
    const file = await addSession(source, { id: sessionId, model: 'gpt-6-luna' });
    await appendTokenCount(file, sessionId, {
      total: { input: 2345, output: 321, cached: 600 },
      latest: { input: 500, output: 80, cached: 120 }, contextWindow: 128_000,
    });
    const sourceHash = createHash('sha256').update(await readFile(file)).digest('hex');

    run = await launchInstalled(true);
    const setup = run.page.getByRole('region', { name: 'Getting started' });
    await expect(setup).toBeVisible();
    await setup.getByText('Enter paths manually', { exact: true }).click();
    await setup.getByLabel('Session directories').fill(source);
    await setup.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(setup).toBeHidden();
    await expect(run.page.getByTestId(`session-${sessionId}`)).toBeVisible();
    await run.page.getByTestId(`session-${sessionId}`).click();
    await expect(run.page.getByTestId('total-input')).toHaveText('2,345');
    await expect(run.page.getByTestId('total-output')).toHaveText('321');

    await run.page.getByRole('button', { name: 'Expand display', exact: true }).click();
    await expect(run.page.getByRole('button', { name: 'Compact display', exact: true })).toBeVisible();
    const details = run.page.locator('details.summary-details');
    await expect(details).toHaveJSProperty('open',true);
    const naming = details.locator('details.local-name');
    if (!(await naming.evaluate((node: HTMLDetailsElement) => node.open))) await naming.locator(':scope > summary').click();
    await naming.getByLabel('Local session name').fill('Reinstall Check');
    await naming.getByRole('button', { name: 'Save name' }).click();
    await expect(run.page.getByRole('heading', { name: 'Reinstall Check', exact: true })).toBeVisible();

    await run.page.getByRole('button', { name: 'Settings' }).click();
    await run.page.getByLabel('Theme').selectOption('dark');
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await run.close(); run = undefined;

    await rm(appBundle, { recursive: true, force: true });
    install();

    run = await launchInstalled();
    const retained = await run.page.evaluate(() => window.lens.snapshot());
    expect(retained.preferences).toMatchObject({ theme: 'dark', selectedId: sessionId, aliases: { [sessionId]: 'Reinstall Check' } });
    await expect(run.page.getByRole('heading', { name: 'Reinstall Check', exact: true })).toBeVisible();
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await expect(run.page.getByTestId('total-input')).toHaveText('2,345');
    await expect(run.page.getByTestId('total-output')).toHaveText('321');
    await run.close(); run = undefined;

    await rm(data, { recursive: true, force: true });
    await mkdir(data);
    run = await launchInstalled(true);
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeVisible();
    await expect(run.page.getByRole('button', { name: 'Use synthetic sample' })).toBeVisible();
    await expect(run.page.getByTestId(`session-${sessionId}`)).toHaveCount(0);
    expect(createHash('sha256').update(await readFile(file)).digest('hex')).toBe(sourceHash);

    const freshSetup = run.page.getByRole('region', { name: 'Getting started' });
    await freshSetup.getByText('Enter paths manually', { exact: true }).click();
    await freshSetup.getByLabel('Session directories').fill(source);
    await freshSetup.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(freshSetup).toBeHidden();
    await expect(run.page.getByTestId(`session-${sessionId}`)).toBeVisible();
    await run.page.getByTestId(`session-${sessionId}`).click();
    await expect(run.page.getByTestId('total-input')).toHaveText('2,345');
    expect(createHash('sha256').update(await readFile(file)).digest('hex')).toBe(sourceHash);
  } finally {
    try { await run?.close(); } finally {
      if (originalExecutable) process.env.LENS_EXECUTABLE = originalExecutable;
      else delete process.env.LENS_EXECUTABLE;
      await rm(root, { recursive: true, force: true });
    }
  }
});
