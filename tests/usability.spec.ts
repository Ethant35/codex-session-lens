// Author: Ethan
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { addSession, appendTokenCount, closeLens, launchLens } from './helpers';

const screenshotDirectory = join(process.cwd(), '.local/usability-screens');
async function capture(page: import('@playwright/test').Page, name: string) {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), animations: 'disabled' });
}

type DialogMockState = {
  calls: number;
  options: { defaultPath?: string; properties?: string[] } | null;
  selected: string[] | null;
};

async function setDirectoryDialogResult(run: Awaited<ReturnType<typeof launchLens>>, selected: string[] | null) {
  return run.app.evaluate(({ dialog, BrowserWindow }, result: string[] | null) => {
    const state = globalThis as typeof globalThis & { __lensDialogMock?: DialogMockState; __lensOriginalOpenDialog?: typeof dialog.showOpenDialog };
    if (!state.__lensOriginalOpenDialog) state.__lensOriginalOpenDialog = dialog.showOpenDialog.bind(dialog);
    state.__lensDialogMock = { calls: 0, options: null, selected: result };
    dialog.showOpenDialog = (async (_window: unknown, options: { defaultPath?: string; properties?: string[] }) => {
      state.__lensDialogMock!.calls++;
      state.__lensDialogMock!.options = { defaultPath: options.defaultPath, properties: options.properties };
      return result === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: result };
    }) as typeof dialog.showOpenDialog;
    return { windows: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows().some(window => window.isVisible()) };
  }, selected);
}

async function dialogMockState(run: Awaited<ReturnType<typeof launchLens>>) {
  return run.app.evaluate(({ dialog, BrowserWindow }) => {
    const state = globalThis as typeof globalThis & { __lensDialogMock?: DialogMockState; __lensOriginalOpenDialog?: typeof dialog.showOpenDialog };
    const result = { mock: state.__lensDialogMock, windows: BrowserWindow.getAllWindows().length,
      visible: BrowserWindow.getAllWindows().some(window => window.isVisible()) };
    if (state.__lensOriginalOpenDialog) dialog.showOpenDialog = state.__lensOriginalOpenDialog;
    delete state.__lensOriginalOpenDialog;
    delete state.__lensDialogMock;
    return result;
  });
}

test('folder chooser cancellation changes nothing and selected folders save only on explicit submit', async () => {
  const run = await launchLens(undefined, undefined, { fresh: true });
  try {
    await run.page.evaluate(() => window.lens.preferences({ theme: 'dark' }));
    const before = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences.directories));
    const initialWindows = await setDirectoryDialogResult(run, null);
    expect(initialWindows).toMatchObject({ windows: 1, visible: false });
    const intro = run.page.getByRole('region', { name: 'Getting started' });
    await capture(run.page, 'setup');
    await intro.getByRole('button', { name: 'Choose folders…' }).click();
    await expect(intro).toBeVisible();
    expect(await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences.directories))).toEqual(before);
    let state = await dialogMockState(run);
    expect(state.mock).toMatchObject({ calls: 1, options: { defaultPath: expect.any(String), properties: ['openDirectory', 'multiSelections', 'showHiddenFiles'] }, selected: null });
    expect(state).toMatchObject({ windows: 1, visible: false });

    await setDirectoryDialogResult(run, [run.source]);
    await intro.getByRole('button', { name: 'Choose folders…' }).click();
    await expect(intro.getByRole('button', { name: 'Save folder and scan' })).toBeEnabled();
    expect(await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences.directories))).toEqual(before);
    await intro.getByRole('button', { name: 'Save folder and scan' }).click();
    await expect(intro).toBeHidden();
    const savedPreferences = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences));
    expect(savedPreferences.directories).toEqual([run.source]);
    expect(savedPreferences.theme).toBe('dark');
    state = await dialogMockState(run);
    expect(state.mock).toMatchObject({ calls: 1, options: { properties: ['openDirectory', 'multiSelections', 'showHiddenFiles'] }, selected: [run.source] });
    expect(state).toMatchObject({ windows: 1, visible: false });
  } finally {
    await dialogMockState(run).catch(() => undefined);
    await closeLens(run);
  }
});

test('compact is the default, and manual local session names remain aliases of their real IDs', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'recognizable-session', model: 'gpt-6-luna' });
    await appendTokenCount(file, 'recognizable-session', { total: { input: 160, output: 22, cached: 40 }, latest: { input: 60, output: 8 }, contextWindow: 128_000 });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    if (!(await run.page.locator('.session-picker').evaluate((node: HTMLDetailsElement) => node.open))) {
      await run.page.locator('.session-picker > summary').click();
    }
    await run.page.getByTestId('session-recognizable-session').click();
    expect((await run.page.evaluate(() => window.lens.snapshot())).preferences.compact).toBe(true);
    await expect(run.page.getByRole('button', { name: 'Expand display' })).toBeVisible();
    await run.page.getByRole('button', { name: 'Expand display' }).click();
    await expect(run.page.getByText('Separate from cumulative session totals', { exact: true })).toBeVisible();

    const naming = run.page.locator('details').filter({ hasText: /Name this session|Edit local name/ });
    await naming.locator('summary').click();
    await naming.getByLabel('Local session name').fill('Work Mac');
    await naming.getByRole('button', { name: 'Save name' }).click();
    await expect(run.page.getByTestId('session-id')).toHaveText('recognizable-session');
    await expect(run.page.getByRole('heading', { name: 'Work Mac', exact: true })).toBeVisible();
    await expect(naming.getByLabel('Local session name')).toHaveValue('Work Mac');
    await run.page.getByRole('button', { name: 'Compact display', exact: true }).click();
    await naming.locator('summary').click();
    await capture(run.page, 'compact-alias-populated');
    await run.page.getByRole('button', { name: 'Expand display', exact: true }).click();
    const search = run.page.getByLabel('Search sessions');
    await run.page.keyboard.press('Meta+K');
    await search.fill('Work Mac');
    await expect(run.page.getByTestId('session-recognizable-session')).toBeVisible();
    await run.page.getByTestId('session-recognizable-session').click();
    await expect(run.page.getByTestId('session-id')).toHaveText('recognizable-session');
    const saved = await run.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.preferences.aliases));
    expect(saved).toEqual({ 'recognizable-session': 'Work Mac' });

    const root = run.root, source = run.source, data = run.data;
    await closeLens(run, false);
    const reopened = await launchLens(source, data);
    try {
      if (!(await reopened.page.locator('.session-picker').evaluate((node: HTMLDetailsElement) => node.open))) {
        await reopened.page.locator('.session-picker > summary').click();
      }
      await expect(reopened.page.getByTestId('session-recognizable-session')).toBeVisible();
      await reopened.page.getByTestId('session-recognizable-session').click();
      await expect(reopened.page.getByTestId('session-id')).toHaveText('recognizable-session');
      await expect(reopened.page.getByRole('heading', { name: 'Work Mac', exact: true })).toBeVisible();
      const reopenedNaming = reopened.page.locator('details.local-name');
      await reopenedNaming.locator('summary').click();
      await expect(reopenedNaming.getByLabel('Local session name')).toHaveValue('Work Mac');
      expect((await reopened.page.evaluate(() => window.lens.snapshot())).preferences.aliases).toEqual({ 'recognizable-session': 'Work Mac' });
      expect(await reopened.page.evaluate(() => window.lens.snapshot().then(snapshot => snapshot.sessions.map(session => session.id)))).toContain('recognizable-session');
    } finally {
      await closeLens(reopened);
      // The first run's close intentionally retained its data for this restart check.
      const { rm } = await import('node:fs/promises');
      await rm(root, { recursive: true, force: true });
    }
  } finally { await closeLens(run); }
});

test('prototype-like IDs start unnamed, accept identical local aliases, and remain distinct after restart', async () => {
  const run = await launchLens();
  const specialIds = ['constructor', '__proto__', 'toString'];
  const rendererResults: Array<{ id: string; aliasReplyOwn: boolean; aliasReplyValue: unknown; aliasReplyPrototypeIsPlain: boolean; snapshotOwn: boolean; snapshotValue: unknown; snapshotPrototypeIsPlain: boolean }> = [];
  let storageResults: Array<{ id: string; own: boolean; value: unknown; prototypeIsPlain: boolean }> = [];
  let restartResults: Array<{ id: string; own: boolean; value: unknown; prototypeIsPlain: boolean }> = [];
  let passed = false;
  try {
    for (const [index, id] of specialIds.entries()) {
      const file = await addSession(run.source, { id, model: 'gpt-6-luna', timestamp: new Date(Date.now() + index * 1_000).toISOString() });
      await appendTokenCount(file, id, { total: { input: 30 + index, output: 4 }, latest: { input: 20 + index, output: 3 } });
    }
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    for (const id of specialIds) {
      await run.page.keyboard.press('Meta+K');
      const search = run.page.getByLabel('Search sessions');
      await search.fill(id);
      const option = run.page.getByTestId(`session-${id}`);
      await expect(option).toBeVisible();
      await option.click();
      await expect(run.page.getByTestId('session-id')).toHaveText(id);
      await expect(run.page.getByRole('heading', { name: 'Selected session', exact: true })).toBeVisible();

      const naming = run.page.locator('details.local-name');
      await naming.locator('summary').click();
      await naming.getByLabel('Local session name').fill('Local test chat');
      await naming.getByRole('button', { name: 'Save name' }).click();
      await expect(run.page.getByRole('heading', { name: 'Local test chat', exact: true })).toBeVisible();
      await expect(run.page.getByTestId('session-id')).toHaveText(id);
      rendererResults.push(await run.page.evaluate(async (sessionId: string) => {
        const reply = await window.lens.alias(sessionId, 'Local test chat');
        const snapshot = await window.lens.snapshot();
        const replyAliases = reply.preferences.aliases!, snapshotAliases = snapshot.preferences.aliases!;
        return { id: sessionId, aliasReplyOwn: Object.hasOwn(replyAliases, sessionId), aliasReplyValue: replyAliases[sessionId],
          aliasReplyPrototypeIsPlain: Object.getPrototypeOf(replyAliases) === Object.prototype,
          snapshotOwn: Object.hasOwn(snapshotAliases, sessionId), snapshotValue: snapshotAliases[sessionId],
          snapshotPrototypeIsPlain: Object.getPrototypeOf(snapshotAliases) === Object.prototype };
      }, id));
    }
    const root = run.root, source = run.source, data = run.data;
    await closeLens(run, false);

    const database = new DatabaseSync(join(data, 'telemetry.sqlite'), { readOnly: true });
    try {
      const row = database.prepare("SELECT value FROM settings WHERE id='preferences'").get() as { value: string };
      const stored = JSON.parse(row.value) as { aliases?: Record<string, string>; selectedId?: string };
      storageResults = specialIds.map(id => ({ id, own: Object.hasOwn(stored.aliases ?? {}, id), value: stored.aliases?.[id],
        prototypeIsPlain: Object.getPrototypeOf(stored.aliases ?? {}) === Object.prototype }));
    } finally { database.close(); }

    const reopened = await launchLens(source, data);
    try {
      await expect(reopened.page.getByRole('heading', { name: 'Local test chat', exact: true })).toBeVisible();
      await expect(reopened.page.getByTestId('session-id')).toHaveText('toString');
      restartResults = await reopened.page.evaluate(async (ids: string[]) => {
        const value = await window.lens.snapshot(), aliases = value.preferences.aliases!;
        return ids.map(id => ({ id, own: Object.hasOwn(aliases, id), value: aliases[id], prototypeIsPlain: Object.getPrototypeOf(aliases) === Object.prototype }));
      }, specialIds);
      for (const id of specialIds) {
        expect(await reopened.page.getByTestId(`session-${id}`).count()).toBe(1);
      }
    expect(rendererResults).toEqual(specialIds.map(id => ({ id, aliasReplyOwn: true, aliasReplyValue: 'Local test chat', aliasReplyPrototypeIsPlain: true, snapshotOwn: true, snapshotValue: 'Local test chat', snapshotPrototypeIsPlain: true })));
    expect(storageResults).toEqual(specialIds.map(id => ({ id, own: true, value: 'Local test chat', prototypeIsPlain: true })));
    expect(restartResults).toEqual(specialIds.map(id => ({ id, own: true, value: 'Local test chat', prototypeIsPlain: true })));
      await reopened.page.keyboard.press('Meta+K');
      await reopened.page.getByLabel('Search sessions').fill('Local test chat');
      for (const id of specialIds) await expect(reopened.page.getByTestId(`session-${id}`)).toBeVisible();
      expect(await reopened.page.evaluate(() => window.lens.snapshot().then(value => value.sessions.map(session => session.id).sort()))).toEqual([...specialIds].sort());
      passed = true;
    } finally {
      await closeLens(reopened);
      const { rm } = await import('node:fs/promises');
      await rm(root, { recursive: true, force: true });
    }
  } finally {
    await closeLens(run);
    await mkdir(join(process.cwd(), '.local'), { recursive: true });
    await writeFile(join(process.cwd(), '.local/usability-prototype-report.json'), JSON.stringify({
      author: 'Ethan', timestamp: new Date().toISOString(), candidate: process.env.LENS_EXECUTABLE ?? 'release/mac-arm64/Codex Session Lens.app/Contents/MacOS/Codex Session Lens',
      sessionIds: specialIds, passed, rendererResults, storageResults, restartResults,
    }, null, 2) + '\n', { mode: 0o600 });
  }
});
