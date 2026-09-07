import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { DEFAULT_EXPERIMENT } from '../../lib/rehearsal/scenarios';
const source = readFileSync(
  new URL('../../public/example-trace.json', import.meta.url),
);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready=true]')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Give your agent a bad day.' }),
  ).toBeVisible();
});
test('initial experiment is real, reproducible, and inspectable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.metric.accent strong')).toHaveText('83.2%');
  await page
    .getByRole('button', { name: /Blind retry: payments.charge attempt 1/ })
    .click();
  await expect(page.locator('.event-detail')).toContainText('Write committed');
  await page.getByRole('button', { name: 'Run rehearsal' }).click();
  await expect(
    page.getByText('250 paired trials complete. Seed 1720.'),
  ).toBeVisible();
  await expect(page.locator('.metric.accent strong')).toHaveText('83.2%');
  expect(errors).toEqual([]);
});
test('controls update only after running, reset restores draft', async ({
  page,
}) => {
  await page.getByRole('slider', { name: 'Fault probability' }).focus();
  await page.keyboard.press('Home');
  await expect(
    page.getByText('Settings changed. Run to update results.'),
  ).toBeVisible();
  await expect(page.locator('.metric.accent strong')).toHaveText('83.2%');
  await page.getByRole('button', { name: 'Run rehearsal' }).click();
  await expect(page.locator('.metric.accent strong')).toHaveText('100.0%');
  await page.getByRole('button', { name: 'Reset experiment' }).click();
  await expect(page.getByLabel('Random seed')).toHaveValue('1720');
});
test('scenarios and candidate switches work', async ({ page }) => {
  await page.getByRole('button', { name: /The incident that loops/ }).click();
  await expect(page.locator('.results-header')).toContainText(
    'The double-charge trap',
  );
  await page.getByRole('switch', { name: 'Validate outputs' }).click();
  await expect(
    page.getByRole('switch', { name: 'Validate outputs' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Run rehearsal' }).click();
  await expect(
    page.getByText('250 paired trials complete. Seed 1720.'),
  ).toBeVisible();
  await expect(page.locator('.results-header')).toContainText(
    'The incident that loops',
  );
  await page.getByRole('button', { name: 'Next trial' }).click();
  await page.getByRole('button', { name: 'Previous trial' }).click();
});
test('invalid controls give a helpful error and preserve last valid results', async ({
  page,
}) => {
  await page.getByLabel('Random seed').fill('-1');
  await page.getByRole('button', { name: 'Run rehearsal' }).click();
  await expect(page.getByRole('alert')).toContainText('Seed must be');
  await expect(page.locator('.metric.accent strong')).toHaveText('83.2%');
});
test('recorded SDK trace loads, diagnoses, and clears', async ({ page }) => {
  await page.getByRole('tab', { name: /Trace inspector/ }).click();
  await page.getByRole('button', { name: 'Load SDK example' }).click();
  await expect(
    page.getByRole('heading', { name: 'A write has an uncertain outcome' }),
  ).toBeVisible();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear trace' }).click();
  await expect(page.getByText('Bring your agent’s bad day.')).toBeVisible();
});
test('local file imports make no upload requests', async ({ page }) => {
  const posted: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') posted.push(request.url());
  });
  await page.getByLabel('Import trace or experiment').setInputFiles({
    name: 'trace.json',
    mimeType: 'application/json',
    buffer: source,
  });
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
  expect(posted).toEqual([]);
});
test('hostile enum arrays show an error without crashing (review regression)', async ({
  page,
}) => {
  const trace = JSON.parse(source.toString());
  trace.events[0].status = ['ok'];
  await page.getByLabel('Import trace or experiment').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(trace)),
  });
  await expect(page.getByRole('alert')).toContainText('Unknown event status');
  await expect(
    page.getByRole('button', { name: 'Run rehearsal' }),
  ).toBeEnabled();
});
test('exported config reimports and shared URL reproduces the experiment', async ({
  page,
}) => {
  const config = { ...DEFAULT_EXPERIMENT, seed: 42, faultRate: 0, trials: 100 };
  await page.goto(
    '/?' + new URLSearchParams({ experiment: JSON.stringify(config) }),
  );
  await expect(page.getByLabel('Random seed')).toHaveValue('42');
  await expect(page.locator('.metric.accent strong')).toHaveText('100.0%');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export config', exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('rehearsal-experiment.json');
  await page.getByLabel('Import trace or experiment').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(config)),
  });
  await expect(
    page.getByText('Experiment imported and reproduced.'),
  ).toBeVisible();
});
test('field guide is available and all internal sections navigate', async ({
  page,
}) => {
  await page.getByRole('tab', { name: /Field guide/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Make failure reproducible.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Two paths. One failure vocabulary.' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Chaos lab/ }).click();
  await expect(
    page.getByRole('button', { name: 'Run rehearsal' }),
  ).toBeVisible();
});
test('layout has no page overflow', async ({ page }) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test('WCAG A/AA automated scan of the lab and loaded inspector', async ({
  page,
}) => {
  for (const inspector of [false, true]) {
    if (inspector) {
      await page.getByRole('tab', { name: /Trace inspector/ }).click();
      await page.getByRole('button', { name: 'Load SDK example' }).click();
      await expect(page.locator('.trace-table')).toBeVisible();
    }
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        description: v.description,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test('related trace findings filter to their evidence and clear', async ({
  page,
}) => {
  await page.getByRole('tab', { name: /Trace inspector/ }).click();
  await page.getByRole('button', { name: 'Load SDK example' }).click();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: /2 related events/ }).click();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.trace-table')).toContainText(
    'timeout after write',
  );
  await page.getByRole('button', { name: /Clear event filter/ }).click();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
});
test('evidence bundle roundtrip recomputes the recorded experiment', async ({
  page,
}) => {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Evidence bundle', exact: true })
    .click();
  const saved = await pending;
  const path = await saved.path();
  expect(path).not.toBeNull();
  await page.getByLabel('Import trace or experiment').setInputFiles(path!);
  await expect(
    page.getByText('Experiment imported and reproduced.'),
  ).toBeVisible();
  await expect(page.locator('.metric.accent strong')).toHaveText('83.2%');
});
