// Author: Ethan
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { chmod, mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSession, appendTokenCount, launchLens, type LensRun } from './helpers';

test('compact HUD warns about a missing source, opens diagnostics by keyboard, and clears after recovery', async () => {
  const run = await launchLens();
  const moved = `${run.source}-missing`;
  try {
    const file = await addSession(run.source, { id: 'scan-warning' });
    await appendTokenCount(file, 'scan-warning', { total: { input: 1000, output: 200 }, latest: { input: 100, output: 20 }, contextWindow: 1000 });
    await run.page.getByRole('button', { name: 'Rescan sessions', exact: true }).click();
    await run.page.getByTestId('session-scan-warning').click();
    const warning = run.page.getByRole('status', { name: 'Scan warning' });
    await expect(warning).toHaveCount(0);
    await rename(run.source, moved);
    await run.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await run.page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await run.page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await expect(warning).toContainText('Displayed values may be out of date or incomplete.');
    await expect(run.page.locator('.footer')).toHaveText('Scan incomplete');
    await expect(run.page.getByTestId('total-input')).toHaveText('1,000');
    await expect(run.page.locator('.summary-details')).not.toHaveAttribute('open', '');
    await expect(run.page.locator('.checkpoints')).not.toHaveAttribute('open', '');
    const button = warning.getByRole('button', { name: 'View diagnostics' });
    await button.focus();
    await run.page.keyboard.press('Enter');
    await expect(run.page.locator('#settings-title')).toBeFocused();
    await expect(run.page.getByRole('region', { name: 'Settings and diagnostics' })).toContainText('A configured directory is unavailable or unreadable.');
    // A pause must not hide the known scan error or claim that watching resumed.
    const pause = run.page.getByRole('checkbox', { name: 'Pause ingestion', exact: true });
    await pause.click();
    await expect(pause).toBeChecked();
    await expect(warning).toBeVisible();
    await expect(run.page.locator('.footer')).toHaveText('Ingestion paused');
    await pause.click();
    await expect(pause).not.toBeChecked();
    await mkdir('.local/review-fixes-2026-10-29/screens', { recursive: true });
    for (const theme of ['light', 'dark']) {
      await run.page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme);
      await run.page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await run.page.evaluate(() => window.scrollTo(0, 0));
      await expect(warning).toBeInViewport();
      await expect(button).toBeInViewport();
      expect(await run.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await run.page.screenshot({ path: `.local/review-fixes-2026-10-29/screens/scan-warning-${theme}.png` });
      await run.page.getByRole('button', { name: 'Settings', exact: true }).click();
    }
    await rename(moved, run.source);
    await run.page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect(run.page.locator('.footer')).toHaveText('Watching session folders');
    await expect(run.page.getByTestId('total-input')).toHaveText('1,000');
  } finally { await run.close(); }
});

test('malformed-only sources show a compact warning instead of a healthy empty state', async () => {
  const run = await launchLens();
  try {
    const malformed = join(run.source, 'malformed.jsonl');
    await writeFile(malformed, '{invalid json}\n');
    await run.page.getByRole('button', { name: 'Rescan sessions', exact: true }).click();
    const warning = run.page.getByRole('status', { name: 'Scan warning' });
    await expect(warning).toContainText('Session files could not be fully read.');
    await expect(warning).toBeInViewport();
    await expect(run.page.locator('.footer')).toHaveText('Scan incomplete');
    await expect(run.page.getByRole('region', { name: 'Settings and diagnostics' })).toBeHidden();
    await rm(malformed);
    await run.page.getByRole('button', { name: 'Rescan sessions', exact: true }).click();
    // Skipped-record diagnostics remain until sources are saved again. Removing
    // a file must not silently hide that known gap in observed history.
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'View diagnostics' }).click();
    await expect(run.page.getByRole('region', { name: 'Settings and diagnostics' })).toContainText('Malformed JSON record skipped.');
    await run.page.getByRole('button', { name: 'Save directories', exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect(run.page.locator('.footer')).toHaveText('Watching session folders');
  } finally { await run.close(); }
});

test('failed preference writes stay visible and retry after a real SQLite lock clears', async () => {
  const run = await launchLens();
  const lock = new DatabaseSync(join(run.data, 'telemetry.sqlite'));
  try {
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(true);
    lock.exec('BEGIN EXCLUSIVE');
    await run.page.getByRole('button', { name: 'Expand display', exact: true }).click();
    await expect(run.page.getByRole('alert')).toContainText('Could not save this change');
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(true);
    lock.exec('ROLLBACK');
    await run.page.getByRole('button', { name: 'Expand display', exact: true }).click();
    await expect(run.page.getByRole('alert')).toBeHidden();
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(false);
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
    await run.page.getByRole('region', { name: 'Getting started' }).getByText('Enter paths manually', { exact: true }).click();
    await run.close();
    run = await launchLens(source, data, { fresh: true });
    await expect(run.page.getByRole('region', { name: 'Getting started' })).toBeVisible();
    await run.page.getByRole('region', { name: 'Getting started' }).getByText('Enter paths manually', { exact: true }).click();
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
    for (let step = 0; step < 30; step++) {
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
