// Author: Ethan
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { addSession, appendTokenCount, closeLens, launchLens, record, rewriteSession } from './helpers';

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

    const details = run.page.locator('details.summary-details');
    if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) await details.locator(':scope > summary').click();
    const naming = details.locator('details.local-name');
    await naming.locator(':scope > summary').click();
    await naming.getByLabel('Local session name').fill('Work Mac');
    await naming.getByRole('button', { name: 'Save name' }).click();
    await expect(run.page.getByTestId('session-id')).toHaveText('recognizable-session');
    await expect(run.page.getByRole('heading', { name: 'Work Mac', exact: true })).toBeVisible();
    await expect(naming.getByLabel('Local session name')).toHaveValue('Work Mac');
    await run.page.getByRole('button', { name: 'Compact display', exact: true }).click();
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
      const reopenedDetails = reopened.page.locator('details.summary-details');
      if (!(await reopenedDetails.evaluate((node: HTMLDetailsElement) => node.open))) await reopenedDetails.locator(':scope > summary').click();
      const reopenedNaming = reopenedDetails.locator('details.local-name');
      await reopenedNaming.locator(':scope > summary').click();
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

test('compact metrics fit the default window and project folder labels require opt-in', async () => {
  const run = await launchLens();
  try {
    const id = 'compact-project-session';
    const path = await addSession(run.source, { id, model: 'gpt-6-luna', timestamp: new Date(Date.now() + 1_000).toISOString() });
    const timestamp = (offset: number) => new Date(Date.now() + offset).toISOString();
    await rewriteSession(path, [
      record('session_meta', { id, cwd: '/tmp/synthetic-workspace/Project Cedar' }, timestamp(1)),
      record('turn_context', { id, model: 'gpt-6-luna' }, timestamp(2)),
      record('event_msg', { type: 'token_count', thread_id: id, info: {
        total_token_usage: { input_tokens: 10_000, output_tokens: 1_500, cached_input_tokens: 2_000, total_tokens: 11_500 },
        last_token_usage: { input_tokens: 2_000, output_tokens: 300, cached_input_tokens: 400, total_tokens: 2_300 },
        model_context_window: 128_000,
      } }, timestamp(3)),
    ]);
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 24, y: 32, width: 460, height: 650 }));
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    if (!(await run.page.locator('.session-picker').evaluate((node: HTMLDetailsElement) => node.open))) {
      await run.page.locator('.session-picker > summary').click();
    }
    await run.page.getByTestId(`session-${id}`).click();
    await expect(run.page.getByTestId('total-input')).toHaveText('10,000');
    await expect(run.page.getByTestId('total-output')).toHaveText('1,500');
    await expect(run.page.getByTestId('context-value')).toHaveText('2%');

    const setting = run.page.getByLabel('Show project folder labels');
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(setting).not.toBeChecked();
    await run.page.getByRole('button', { name: 'Settings' }).click();

    const viewport = await run.page.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const bounds = node.getBoundingClientRect();
        return { top: Math.floor(bounds.top), left: Math.floor(bounds.left), right: Math.ceil(bounds.right), bottom: Math.ceil(bounds.bottom) };
      };
      return { width: window.innerWidth, height: window.innerHeight, elements: {
        name: rect('[data-testid="selected-session-name"]'),
        inputLabel: rect('.metrics-grid > .metric:nth-child(1) .metric-label'),
        input: rect('[data-testid="total-input"]'),
        outputLabel: rect('.metrics-grid > .metric:nth-child(2) .metric-label'),
        output: rect('[data-testid="total-output"]'),
        contextLabel: rect('.context-label'), context: rect('[data-testid="context-value"]'),
        contextNote: rect('[data-testid="context-note"]'), details: rect('.summary-details > summary'),
      } };
    });
    for (const [key, bounds] of Object.entries(viewport.elements)) {
      expect(bounds, `${key} should be present: ${JSON.stringify(viewport)}`).not.toBeNull();
      expect(bounds!.top, `${key} should not be above the viewport`).toBeGreaterThanOrEqual(0);
      expect(bounds!.left, `${key} should not be left of the viewport`).toBeGreaterThanOrEqual(0);
      expect(bounds!.right, `${key} should not be clipped at the right edge`).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.bottom, `${key} should not be clipped at the bottom edge`).toBeLessThanOrEqual(viewport.height);
    }
    await capture(run.page, 'compact-priorities');
    await appendTokenCount(path,id,{total:{input:12_000,output:1_800,cached:2_400},latest:{input:2_000,output:300,cached:400},contextWindow:128_000,timestamp:timestamp(10)});
    await expect(run.page.getByTestId('total-input')).toHaveText('12,000',{timeout:5_000});
    await expect(run.page.getByTestId('total-output')).toHaveText('1,800');
    await expect(run.page.getByTestId('context-value')).toHaveText('2%');

    await run.page.getByRole('button', { name: 'Settings' }).click();
    await setting.click();
    await expect(setting).toBeChecked();
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(run.page.getByTestId('selected-session-name')).toHaveText('Project Cedar');
    await run.page.getByRole('button', { name: 'Expand display' }).click();
    const details = run.page.locator('details.summary-details');
    if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) await details.locator(':scope > summary').click();
    await expect(run.page.getByTestId('session-id')).toHaveText(id);
    await expect(run.page.getByTestId('total-cached')).toHaveText('2,400');
    await expect(details).toContainText('Project folder · Project Cedar');
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(run.page.getByRole('checkbox', { name: 'Show project folder labels' })).toBeVisible();
    await expect(run.page.getByRole('checkbox', { name: 'Show project folder labels' })).toBeChecked();
    await setting.click();
    await expect(setting).not.toBeChecked();
    await run.page.getByRole('button',{name:'Settings'}).click();
    await expect(run.page.getByTestId('selected-session-name')).not.toHaveText('Project Cedar');
    expect((await run.page.evaluate(()=>window.lens.snapshot())).sessions.find(s=>s.id===id)?.projectLabel).toBeUndefined();
    await closeLens(run,false);
    const reopened=await launchLens(run.source,run.data);
    try{
      const state=await reopened.page.evaluate(()=>window.lens.snapshot());
      expect(state.preferences.showProjectLabels).toBe(false);
      expect(state.preferences.selectedId).toBe(id);
      expect(state.sessions.find(s=>s.id===id)?.projectLabel).toBeUndefined();
      await expect(reopened.page.getByTestId('total-input')).toHaveText('12,000');
    }finally{await closeLens(reopened);}
  } finally { await closeLens(run); }
});

test('compact HUD keeps unknown values explicit and wraps a long local session name', async () => {
  const run = await launchLens();
  try {
    const id = `long-session-${'x'.repeat(90)}`;
    const name = 'Long local name for legal research with a clear identity across many tasks';
    await addSession(run.source, { id, model: '', timestamp: new Date(Date.now() + 1_000).toISOString() });
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 24, y: 32, width: 460, height: 650 }));
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    if (!(await run.page.locator('.session-picker').evaluate((node: HTMLDetailsElement) => node.open))) {
      await run.page.locator('.session-picker > summary').click();
    }
    await run.page.getByTestId(`session-${id}`).click();
    await expect(run.page.getByTestId('total-input')).toHaveText('Unavailable');
    await expect(run.page.getByTestId('total-output')).toHaveText('Unavailable');
    await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
    await expect(run.page.getByTestId('context-note')).toHaveText('Estimate unavailable · occupancy unknown');
    const details = run.page.locator('details.summary-details');
    if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) await details.locator(':scope > summary').click();
    const naming = details.locator('details.local-name');
    if (!(await naming.evaluate((node: HTMLDetailsElement) => node.open))) await naming.locator(':scope > summary').click();
    await naming.getByLabel('Local session name').fill(name);
    await naming.getByRole('button', { name: 'Save name' }).click();
    await expect(run.page.getByTestId('selected-session-name')).toHaveText(name);
    const bounds = await run.page.getByTestId('selected-session-name').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.innerWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.innerHeight);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
    if (await details.evaluate((node: HTMLDetailsElement) => node.open)) await details.locator(':scope > summary').click();
    await capture(run.page, 'compact-long-name-unknown-metrics');
    await run.page.getByRole('button', { name: 'Expand display' }).click();
    await expect(run.page.getByTestId('session-id')).toHaveText(id);
    await expect(run.page.getByTestId('model')).toHaveText('Unavailable');
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
      await expect(run.page.getByRole('heading', { name: 'gpt-6-luna', exact: true })).toBeVisible();

      const details = run.page.locator('details.summary-details');
      if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) await details.locator(':scope > summary').click();
      const naming = details.locator('details.local-name');
      await naming.locator(':scope > summary').click();
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
