// Author: Ethan
import { test, expect } from '@playwright/test';
import { copyFile, mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchLens, addSession, appendTokenCount, type LensRun } from './helpers';

test('hidden v1.0.1 upgrade and rollback preserve real prior-version cache, preferences and removed-source history', async () => {
  test.setTimeout(90_000);
  const baseline = process.env.LENS_BASELINE_EXECUTABLE;
  expect(baseline, 'Set LENS_BASELINE_EXECUTABLE to the retained v1.0.1 hidden-capable executable').toBeTruthy();
  const current = process.env.LENS_EXECUTABLE;
  const root = await mkdtemp(join(tmpdir(), 'lens-current-upgrade-'));
  const source = join(root, 'source'), data = join(root, 'data');
  await Promise.all([mkdir(source), mkdir(data)]);
  let run: LensRun | undefined;
  const launch = async (executable: string | undefined) => {
    if (executable) process.env.LENS_EXECUTABLE = executable; else delete process.env.LENS_EXECUTABLE;
    try { return await launchLens(source, data); }
    finally { if (current) process.env.LENS_EXECUTABLE = current; else delete process.env.LENS_EXECUTABLE; }
  };
  try {
    const file = await addSession(source, { id: 'prior-version', model: 'gpt-6-luna', timestamp: '2026-10-22T10:00:00Z' });
    await appendTokenCount(file, 'prior-version', { total: { input: 1234, output: 200, cached: 500 },
      latest: { input: 400, output: 50, cached: 100 }, contextWindow: 1000, timestamp: '2026-10-22T10:00:01Z' });
    run = await launch(baseline);
    expect(await run.app.evaluate(({ app }) => app.getVersion())).toBe('1.0.1');
    await run.page.getByTestId('session-prior-version').click();
    await expect(run.page.getByTestId('total-input')).toHaveText('1,234');
    await run.page.evaluate(() => window.lens.preferences({ theme: 'dark', compact: true }));
    await run.close(); run = undefined;
    await copyFile(join(data, 'telemetry.sqlite'), join(root, 'before-upgrade.sqlite'));
    await rename(file, join(root, 'retained-source.jsonl'));

    run = await launch(current);
    expect(await run.app.evaluate(({ app }) => app.getVersion())).toBe('1.1.0');
    const state = await run.page.evaluate(() => window.lens.snapshot());
    expect(state.preferences).toMatchObject({ theme: 'dark', compact: true, selectedId: 'prior-version', onboardingCompleted: true });
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeHidden();
    await expect(run.page.getByTestId('total-input')).toHaveText('1,234');
    await expect(run.page.getByTestId('total-cached')).toHaveText('500');
    await run.close(); run = undefined;

    run = await launch(baseline);
    await expect(run.page.getByTestId('total-input')).toHaveText('1,234');
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences).toMatchObject({ theme: 'dark', compact: true, selectedId: 'prior-version' });
    await run.close(); run = undefined;

    run = await launch(current);
    await rename(join(root, 'retained-source.jsonl'), file);
    await appendTokenCount(file, 'prior-version', { total: { input: 1500, output: 300, cached: 600 },
      latest: { input: 200, output: 100, cached: 50 }, contextWindow: 1000, timestamp: '2026-10-22T10:00:02Z' });
    await run.page.evaluate(() => window.lens.rescan());
    await expect(run.page.getByTestId('total-input')).toHaveText('1,500');
    await expect(run.page.getByTestId('total-output')).toHaveText('300');
  } finally { await run?.close(); await rm(root, { recursive: true, force: true }); }
});
