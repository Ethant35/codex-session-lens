// Author: Ethan
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { chmod, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchLens, type LensRun } from './helpers';

test('failed preference writes stay visible and retry after a real SQLite lock clears', async () => {
  const run = await launchLens();
  const lock = new DatabaseSync(join(run.data, 'telemetry.sqlite'));
  try {
    lock.exec('BEGIN EXCLUSIVE');
    await run.page.getByRole('button', { name: 'Compact display', exact: true }).click();
    await expect(run.page.getByRole('alert')).toContainText('Could not save this change');
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(false);
    lock.exec('ROLLBACK');
    await run.page.getByRole('button', { name: 'Compact display', exact: true }).click();
    await expect(run.page.getByRole('alert')).toBeHidden();
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(true);
  } finally { if (lock.isTransaction) lock.exec('ROLLBACK'); lock.close(); await run.close(); }
});

test('unreadable source directory reports a local error and recovers after access returns', async () => {
  const run = await launchLens();
  try {
    await chmod(run.source, 0o000);
    await run.page.evaluate(() => window.lens.rescan());
    await run.page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = run.page.getByRole('region', { name: 'Settings and diagnostics' });
    await expect(settings).toContainText('A configured directory is unavailable or unreadable.');
    await chmod(run.source, 0o700);
    await run.page.evaluate(() => window.lens.rescan());
    await expect(settings).toContainText('0 ingestion errors');
  } finally { await chmod(run.source, 0o700); await run.close(); }
});

test('unfinished setup survives restart and keyboard actions expose named accessibility nodes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lens-setup-restart-'));
  const source = join(root, 'source'), data = join(root, 'data');
  await Promise.all([mkdir(source), mkdir(data)]);
  let run: LensRun | undefined;
  try {
    run = await launchLens(source, data, { fresh: true });
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeVisible();
    await run.close();
    run = await launchLens(source, data, { fresh: true });
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeVisible();
    const cdp = await run.page.context().newCDPSession(run.page);
    try {
      await cdp.send('Accessibility.enable');
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const visible = nodes.filter(node => !node.ignored);
      expect(visible.some(node => node.role?.value === 'region' && node.name?.value === 'Getting started')).toBe(true);
      expect(visible.some(node => node.role?.value === 'textbox' && node.name?.value === 'Session directories')).toBe(true);
      expect(visible.some(node => node.role?.value === 'button' && node.name?.value === 'Skip setup')).toBe(true);
    } finally { await cdp.detach(); }
    // Traverse actual tab order, then activate with the keyboard rather than clicking.
    let reached = false;
    for (let step = 0; step < 15; step++) {
      await run.page.keyboard.press('Tab');
      if (await run.page.getByRole('button', { name: 'Skip setup', exact: true }).evaluate(node => node === document.activeElement)) { reached = true; break; }
    }
    expect(reached).toBe(true);
    await run.page.keyboard.press('Enter');
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeHidden();
    await run.close();
    run = await launchLens(source, data, { fresh: true });
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeHidden();
  } finally { await run?.close(); await rm(root, { recursive: true, force: true }); }
});
