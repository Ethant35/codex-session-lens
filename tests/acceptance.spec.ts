import { test, expect } from '@playwright/test';
import { appendEvent, appendRaw, appendTokenCount, addSession, closeLens, launchLens, record, rotateSession } from './helpers';
import { appendFile, rm } from 'node:fs/promises';

const t = (offset: number) => new Date(Date.now() + offset).toISOString();
const totalInput = (page: import('@playwright/test').Page) => page.getByTestId('total-input');
async function select(page: import('@playwright/test').Page, id: string) {
  await page.getByTestId(`session-${id}`).waitFor({state:'attached'});
  if (!(await page.locator('.session-picker').evaluate((node: HTMLDetailsElement) => node.open))) await page.locator('.session-picker > summary').click();
  await page.getByTestId(`session-${id}`).click();
  await expect(page.getByTestId('session-id')).toHaveText(id);
}
async function preferences(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
}

test('SL-01: clean launch shows empty state and usable settings', async () => {
  const run = await launchLens();
  try {
    await expect(run.page.getByText('No local sessions')).toBeVisible();
    await expect(run.page.getByText('No sessions found yet.')).toBeVisible();
    await preferences(run.page);
    await expect(run.page.getByRole('region', { name: 'Settings and diagnostics' })).toBeVisible();
    await expect(run.page.getByLabel('Theme')).toHaveValue('system');
    await run.page.getByLabel('Theme').selectOption('light');
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
  } finally { await closeLens(run); }
});

test('SL-02: discovers a session and renders exact model and cumulative metrics', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'known-session', model: 'gpt-5-codex', timestamp: t(0) });
    await appendTokenCount(file, 'known-session', { total: { input: 1000, output: 250, cached: 400 }, latest: { input: 800, output: 100, cached: 300 }, contextWindow: 4000, timestamp: t(1) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'known-session');
    await expect(run.page.getByTestId('model')).toHaveText('gpt-5-codex');
    await expect(totalInput(run.page)).toHaveText('1,000');
    await expect(run.page.getByTestId('total-output')).toHaveText('250');
    await expect(run.page.getByTestId('total-cached')).toHaveText('400');
  } finally { await closeLens(run); }
});

test('SL-03: appended telemetry updates the rendered metrics within five seconds', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'live-session', timestamp: t(0) });
    await appendTokenCount(file, 'live-session', { total: { input: 1000, output: 250, cached: 400 }, latest: { input: 800, output: 100, cached: 300 }, timestamp: t(1) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'live-session');
    await expect(totalInput(run.page)).toHaveText('1,000');
    await appendTokenCount(file, 'live-session', { total: { input: 2000, output: 500, cached: 800 }, latest: { input: 1000, output: 250, cached: 400 }, timestamp: t(2) });
    await expect(totalInput(run.page)).toHaveText('2,000', { timeout: 5_000 });
    await expect(run.page.getByTestId('total-output')).toHaveText('500');
    await expect(run.page.getByTestId('total-cached')).toHaveText('800');
  } finally { await closeLens(run); }
});

test('SL-04: switching sessions keeps each session metrics isolated', async () => {
  const run = await launchLens();
  try {
    const a = await addSession(run.source, { id: 'session-alpha', timestamp: t(0) });
    const b = await addSession(run.source, { id: 'session-bravo', timestamp: t(3) });
    await appendTokenCount(a, 'session-alpha', { total: { input: 111, output: 11, cached: 1 }, latest: { input: 90, output: 10 }, timestamp: t(1) });
    await appendTokenCount(b, 'session-bravo', { total: { input: 999, output: 99, cached: 9 }, latest: { input: 800, output: 80 }, timestamp: t(4) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'session-bravo');
    await expect(totalInput(run.page)).toHaveText('999');
    await select(run.page, 'session-alpha');
    await expect(totalInput(run.page)).toHaveText('111');
    await expect(run.page.getByTestId('total-output')).toHaveText('11');
  } finally { await closeLens(run); }
});

test('SL-05: cumulative token_count and overlapping usage records are not added together', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'overlap-session', timestamp: t(0) });
    const counts = { total: { input: 1200, output: 300, cached: 500 }, latest: { input: 900, output: 200, cached: 400 }, contextWindow: 5000 };
    await appendTokenCount(file, 'overlap-session', { ...counts, timestamp: t(1) });
    await appendTokenCount(file, 'overlap-session', { ...counts, event: 'token_usage_record', timestamp: t(2) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'overlap-session');
    await expect(totalInput(run.page)).toHaveText('1,200');
    await expect(run.page.getByTestId('total-output')).toHaveText('300');
    await expect(run.page.getByTestId('total-cached')).toHaveText('500');
    await expect(run.page.getByText('Separate from cumulative session totals')).toBeVisible();
    await expect(run.page.getByText('Last request estimate')).toBeVisible();
    await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
    await appendTokenCount(file, 'overlap-session', { ...counts, timestamp: t(3) });
    await expect(run.page.getByTestId('context-value')).toHaveText('22%');
  } finally { await closeLens(run); }
});

test('SL-06: context estimate requires complete latest usage and a known limit', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'context-session', timestamp: t(0) });
    await appendTokenCount(file, 'context-session', { total: { input: 80000, output: 20000, cached: 40000 }, latest: { input: 1000, output: 250, cached: 200 }, contextWindow: 5000, timestamp: t(1) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'context-session');
    await expect(run.page.getByTestId('context-value')).toHaveText('25%');
    await appendTokenCount(file, 'context-session', { total: { input: 81000, output: 20250, cached: 40200 }, latest: { input: 1200, output: 300 }, timestamp: t(2) });
    await expect(run.page.getByTestId('total-input')).toHaveText('81,000');
    await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
    await appendFile(file, `${JSON.stringify(record('event_msg', { type: 'token_count', thread_id: 'context-session', info: { total_token_usage: { input_tokens: 82000, output_tokens: 20300, cached_input_tokens: 40200 } } }, t(3)))}\n`);
    await expect(run.page.getByTestId('total-input')).toHaveText('82,000');
    await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
  } finally { await closeLens(run); }
});

test('SL-07: recorded compaction appears in the selected session timeline', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'compact-session', timestamp: t(0) });
    const other = await addSession(run.source, { id: 'uncompacted-session', timestamp: t(1) });
    await appendTokenCount(file, 'compact-session', { total: { input: 1500, output: 300 }, latest: { input: 1000, output: 200 }, contextWindow: 5000, timestamp: t(1) });
    await appendEvent(file, 'context_compacted', 'compact-session', t(2));
    await appendTokenCount(other, 'uncompacted-session', { total: { input: 400, output: 90 }, latest: { input: 300, output: 80 }, timestamp: t(3) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'compact-session');
    await run.page.getByText('Compaction history').click();
    await expect(run.page.getByText('Context compacted')).toBeVisible();
    await expect(run.page.getByTestId('context-value')).toHaveText('Unavailable');
    await select(run.page, 'uncompacted-session');
    await run.page.getByText('Compaction history').click();
    await expect(run.page.locator('.timeline')).toHaveCount(0);
    await expect(run.page.getByText('No recorded compaction events for this session.')).toBeVisible();
  } finally { await closeLens(run); }
});

test('SL-08: malformed, partial, rotated, and truncated files retain valid history and report errors', async () => {
  const run = await launchLens();
  try {
    const file = await addSession(run.source, { id: 'resilient-session', timestamp: t(0) });
    await appendTokenCount(file, 'resilient-session', { total: { input: 700, output: 70, cached: 20 }, latest: { input: 600, output: 60 }, timestamp: t(1) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'resilient-session');
    await expect(totalInput(run.page)).toHaveText('700');

    await appendRaw(file, '{malformed json}\n{"timestamp":"');
    await run.page.getByRole('button', { name: 'Settings' }).click();
    await expect(run.page.getByText('ingestion errors')).toBeVisible();
    await expect(run.page.getByText('Malformed JSON record skipped.')).toBeVisible();
    await expect(run.page.getByText('Incomplete trailing record; waiting for the next append.')).toBeVisible();
    await appendRaw(file, `${t(2)}","type":"event_msg","payload":{"type":"token_count","thread_id":"resilient-session","info":{"total_token_usage":{"input_tokens":900,"output_tokens":90,"cached_input_tokens":30},"last_token_usage":{"input_tokens":800,"output_tokens":80,"cached_input_tokens":20,"total_tokens":880}}}}\n`);
    await run.page.getByRole('button', { name: 'Close settings' }).click();
    await expect(totalInput(run.page)).toHaveText('900');

    // Replacing a file with a shorter fresh rollout must preserve its stable session and avoid re-adding totals.
    await rotateSession(file, [
      record('session_meta', { id: 'resilient-session' }, t(0)),
      record('turn_context', { id: 'resilient-session', model: 'gpt-5-codex' }, t(0)),
      record('event_msg', { type: 'token_count', thread_id: 'resilient-session', info: { total_token_usage: { input_tokens: 1200, output_tokens: 120, cached_input_tokens: 40 }, last_token_usage: { input_tokens: 1100, output_tokens: 110, cached_input_tokens: 30, total_tokens: 1210 } } }, t(3)),
    ]);
    await expect(totalInput(run.page)).toHaveText('1,200');
    await expect(run.page.getByTestId('session-id')).toHaveText('resilient-session');
  } finally { await closeLens(run); }
});

test('SL-09: preferences, selected session, recent history, and window bounds persist after restart', async () => {
  const run = await launchLens();
  let secondRoot: string | undefined;
  try {
    const a = await addSession(run.source, { id: 'persist-one', timestamp: t(0) });
    const b = await addSession(run.source, { id: 'persist-two', timestamp: t(2) });
    await appendTokenCount(a, 'persist-one', { total: { input: 10, output: 2 }, latest: { input: 9, output: 1 }, timestamp: t(1) });
    await appendTokenCount(b, 'persist-two', { total: { input: 20, output: 4 }, latest: { input: 18, output: 2 }, timestamp: t(3) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'persist-one');
    await select(run.page, 'persist-two');
    await preferences(run.page);
    await run.page.getByLabel('Theme').selectOption('dark');
    await run.page.getByLabel('Always on top').click();
    await expect(run.page.getByLabel('Always on top')).toBeChecked();
    await run.page.getByRole('button', { name: 'Compact display' }).click();
    await expect(run.page.locator('.app-shell')).toHaveAttribute('data-compact', 'true');
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 50, width: 520, height: 700 }));
    await closeLens(run, false);
    await rm(run.source, { recursive: true, force: true });

    const relaunched = await launchLens(run.source, run.data);
    secondRoot = relaunched.root;
    try {
      await expect(relaunched.page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
      await expect(relaunched.page.locator('.app-shell')).toHaveAttribute('data-compact', 'true');
      await expect(relaunched.page.getByTestId('session-id')).toHaveText('persist-two');
      await expect(relaunched.page.getByTestId('total-input')).toHaveText('20');
      await preferences(relaunched.page);
      await expect(relaunched.page.getByLabel('Always on top')).toBeChecked();
      await expect(relaunched.page.getByLabel('Theme')).toHaveValue('dark');
      await relaunched.page.locator('.session-picker > summary').click();
      await expect(relaunched.page.getByRole('button', { name: /persist-one/ }).first()).toBeVisible();
      const bounds = await relaunched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
      expect(bounds).toMatchObject({ x: 40, y: 50, width: 520, height: 700 });
      await expect(relaunched.page.getByText('0 files scanned')).toBeVisible();
    } finally { await closeLens(relaunched); }
  } finally {
    await closeLens(run);
    if (secondRoot) await rm(secondRoot, { recursive: true, force: true });
  }
});

test('SL-10: distinguishable child sessions are attributed to the correct parent', async () => {
  const run = await launchLens();
  try {
    const parent = await addSession(run.source, { id: 'parent-session', timestamp: t(0) });
    const otherParent = await addSession(run.source, { id: 'other-parent', timestamp: t(1) });
    const child = await addSession(run.source, { id: 'child-session', parentId: 'parent-session', model: 'gpt-5-codex', timestamp: t(2) });
    await appendTokenCount(parent, 'parent-session', { total: { input: 10, output: 2 }, latest: { input: 9, output: 1 }, timestamp: t(3) });
    await appendTokenCount(child, 'child-session', { total: { input: 30, output: 5 }, latest: { input: 25, output: 4 }, timestamp: t(4) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    await select(run.page, 'parent-session');
    await expect(run.page.getByText('Subagents')).toBeVisible();
    await expect(run.page.locator('.child-row').getByText('child-session')).toBeVisible();
    await expect(run.page.locator('.child-row').getByText('other-parent')).toHaveCount(0);
    await select(run.page, 'other-parent');
    await run.page.getByText('Subagents').click();
    await expect(run.page.getByText('Unavailable. No distinguishable child session was observed.')).toBeVisible();
  } finally { await closeLens(run); }
});

test('SL-13: packaged Apple Silicon app launches and supports navigation, directories, and keyboard search', async () => {
  const run = await launchLens();
  try {
    const [packaged, arch] = await run.app.evaluate(({ app }) => [app.isPackaged, process.arch]);
    expect(packaged).toBe(true);
    expect(arch).toBe('arm64');
    const file = await addSession(run.source, { id: 'packaged-session', model: 'gpt-5-codex', timestamp: t(0) });
    await appendTokenCount(file, 'packaged-session', { total: { input: 321, output: 65, cached: 123 }, latest: { input: 200, output: 30, cached: 80 }, timestamp: t(1) });
    await run.page.getByRole('button', { name: 'Rescan sessions' }).click();
    const search = run.page.getByLabel('Search sessions');
    await run.page.keyboard.press('Meta+K');
    await expect(search).toBeFocused();
    await search.fill('packaged-session');
    await select(run.page, 'packaged-session');
    await expect(run.page.getByTestId('total-input')).toHaveText('321');
    await expect(run.page.getByTestId('total-output')).toHaveText('65');
    await appendTokenCount(file, 'packaged-session', { total: { input: 654, output: 98, cached: 234 }, latest: { input: 333, output: 33, cached: 111 }, timestamp: t(2) });
    await expect(run.page.getByTestId('total-input')).toHaveText('654', { timeout: 5_000 });
    await preferences(run.page);
    await expect(run.page.getByLabel('Session directories')).toHaveValue(run.source);
    await run.page.getByLabel('Session directories').fill(run.source);
    await run.page.getByRole('button', { name: 'Save directories' }).click();
    await expect(run.page.getByText('1 files scanned')).toBeVisible();
  } finally { await closeLens(run); }
});
