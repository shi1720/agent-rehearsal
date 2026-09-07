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
    page.getByRole('heading', { name: 'Compare retry policies' }),
  ).toBeVisible();
  if (
    !(await page
      .locator('.settings-disclosure')
      .evaluate((el) => (el as HTMLDetailsElement).open))
  ) {
    await page.getByText('Edit experiment settings', { exact: true }).click();
  }
});
test('initial experiment is real, reproducible, and inspectable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '83.2%',
  );
  await page
    .getByRole('button', { name: /Blind retry: payments.charge attempt 1/ })
    .click();
  await expect(page.locator('.event-detail')).toContainText('Write committed');
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(
    page.getByText('Compared 250 trials per policy. Seed 1720.'),
  ).toBeVisible();
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '83.2%',
  );
  expect(errors).toEqual([]);
});
test('controls update only after running, reset restores draft', async ({
  page,
}) => {
  await page.getByRole('slider', { name: 'Fault probability' }).focus();
  await page.keyboard.press('Home');
  await expect(
    page.getByText('Settings changed. Compare to update results.'),
  ).toBeVisible();
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '83.2%',
  );
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '100.0%',
  );
  await page.getByRole('button', { name: 'Reset experiment' }).click();
  await expect(page.getByLabel('Random seed')).toHaveValue('1720');
});
test('scenarios and candidate switches work', async ({ page }) => {
  await page.getByRole('button', { name: /Incident response/ }).click();
  await expect(page.locator('.results-header')).toContainText(
    'Checkout payments',
  );
  await page.getByRole('switch', { name: 'Validate outputs' }).click();
  await expect(
    page.getByRole('switch', { name: 'Validate outputs' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(
    page.getByText('Compared 250 trials per policy. Seed 1720.'),
  ).toBeVisible();
  await expect(page.locator('.results-header')).toContainText(
    'Incident response',
  );
  await page.getByRole('button', { name: 'Next trial' }).click();
  await page.getByRole('button', { name: 'Previous trial' }).click();
});
test('invalid controls give a helpful error and preserve last valid results', async ({
  page,
}) => {
  await page.getByLabel('Random seed').fill('-1');
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(page.getByRole('alert')).toContainText('Seed must be');
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '83.2%',
  );
});
test('recorded SDK trace loads, diagnoses, and clears', async ({ page }) => {
  await page.getByRole('tab', { name: /Trace inspector/ }).click();
  await page.getByRole('button', { name: 'Load example trace' }).click();
  await expect(
    page.getByRole('heading', { name: 'A write has an uncertain outcome' }),
  ).toBeVisible();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear trace' }).click();
  await expect(page.getByText('Open a tool-call trace')).toBeVisible();
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
    page.getByRole('button', { name: 'Compare policies' }),
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
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '100.0%',
  );
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export settings', exact: true })
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
  await page.getByRole('tab', { name: /Documentation/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Run your first test' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'How the components fit together' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Simulator/ }).click();
  await expect(
    page.getByRole('button', { name: 'Compare policies' }),
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
      await page.getByRole('button', { name: 'Load example trace' }).click();
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
  await page.getByRole('button', { name: 'Load example trace' }).click();
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
    .getByRole('button', { name: 'Export results', exact: true })
    .click();
  const saved = await pending;
  const path = await saved.path();
  expect(path).not.toBeNull();
  await page.getByLabel('Import trace or experiment').setInputFiles(path!);
  await expect(
    page.getByText('Experiment imported and reproduced.'),
  ).toBeVisible();
  await expect(page.locator('.comparison-safe .candidate-value')).toHaveText(
    '83.2%',
  );
});

test('newer imports and clearing invalidate a delayed example load', async ({
  page,
}) => {
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/example-trace.json', async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: source,
    });
  });
  await page.getByRole('tab', { name: 'Trace inspector', exact: true }).click();
  await page
    .getByRole('button', { name: 'Load example trace', exact: true })
    .click();
  await expect(
    page
      .locator('.heading-actions')
      .getByRole('button', { name: 'Loading example…', exact: true }),
  ).toBeDisabled();
  const trace = JSON.parse(source.toString());
  trace.name = 'User trace selected last';
  await page
    .getByLabel('Import trace or experiment')
    .setInputFiles({
      name: 'last.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(trace)),
    });
  await expect(page.getByRole('heading', { name: trace.name })).toBeVisible();
  release();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: trace.name })).toBeVisible();
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page
    .getByRole('button', { name: 'Load example trace', exact: true })
    .click();
  await page.getByRole('button', { name: 'Clear trace', exact: true }).click();
  release();
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('heading', { name: 'Open a tool-call trace' }),
  ).toBeVisible();
  await expect(page.locator('.trace-table')).toHaveCount(0);
});

test('long valid trace names wrap without expanding the page', async ({
  page,
}) => {
  const trace = {
    schemaVersion: 1,
    source: 'manual',
    name: 'N'.repeat(160),
    events: Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      tool: 'T'.repeat(160),
      kind: 'read',
      attempt: 1,
      startMs: i,
      durationMs: 1,
      status: 'error',
      fault: 'none',
      effect: 'none',
    })),
  };
  await page
    .getByLabel('Import trace or experiment')
    .setInputFiles({
      name: 'long.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(trace)),
    });
  await expect(
    page.getByRole('heading', {
      name: 'Repeated failures in ' + 'T'.repeat(160),
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test('advanced policy fields run, export, and roundtrip without manual JSON edits', async ({
  page,
}) => {
  await page.getByText('Timeout and error handling', { exact: true }).click();
  await page.getByLabel('Call timeout (ms)').fill('2400');
  await page
    .getByRole('switch', { name: 'Retry permanent errors', exact: true })
    .click();
  await page
    .getByRole('switch', { name: 'Retry uncertain writes', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Compare policies', exact: true })
    .click();
  await expect(page.locator('.comparison-panel')).toContainText(
    'Custom policy',
  );
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export settings', exact: true })
    .click();
  const saved = await pending;
  const path = await saved.path();
  const experiment = JSON.parse(readFileSync(path!, 'utf8'));
  expect(experiment.candidate).toMatchObject({
    timeoutMs: 2400,
    retryPermanent: true,
    retryAmbiguous: true,
  });
  await page.getByLabel('Import trace or experiment').setInputFiles(path!);
  await expect(page.getByLabel('Call timeout (ms)')).toHaveValue('2400');
});

test('horizontal navigation follows arrow keys on desktop and mobile', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Simulator', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Trace inspector', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Trace inspector', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Run your first test', exact: true }),
  ).toBeVisible();
});

test('direct trial selection validates bounds and keeps both timelines paired', async ({
  page,
}) => {
  await page.getByLabel('Inspect trial', { exact: true }).fill('250');
  await expect(page.getByLabel('Inspect trial', { exact: true })).toHaveValue(
    '250',
  );
  await expect(
    page.getByRole('button', { name: 'Next trial', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Inspect trial', { exact: true }).fill('251');
  await expect(page.getByLabel('Inspect trial', { exact: true })).toHaveValue(
    '250',
  );
  await page.getByLabel('Inspect trial', { exact: true }).fill('1');
  await expect(
    page.getByRole('button', { name: 'Previous trial', exact: true }),
  ).toBeDisabled();
});

test('comparison columns remain visible without horizontal scrolling', async ({
  page,
}) => {
  const fits = await page.locator('.comparison-panel table').evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth;
  });
  expect(fits).toBeTruthy();
});

test('documentation passes accessibility scan and has no page overflow', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test('an example network error can be dismissed and recovered from', async ({
  page,
}) => {
  await page.route('**/example-trace.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.getByRole('tab', { name: 'Trace inspector', exact: true }).click();
  await page
    .getByRole('button', { name: 'Load example trace', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Example could not be loaded.',
  );
  await page
    .getByRole('button', { name: 'Dismiss error', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unroute('**/example-trace.json');
  await page
    .getByRole('button', { name: 'Load example trace', exact: true })
    .click();
  await expect(page.locator('.trace-table tbody tr')).toHaveCount(4);
});

test('settings stay accessible after resizing a mobile visit to desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('[data-ready=true]')).toBeVisible();
  await expect(page.getByLabel('Random seed')).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('Edit experiment settings', { exact: true }).click();
  await expect(page.getByLabel('Random seed')).toBeVisible();
});

test('mobile call selector exposes the same event details as the timeline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('combobox', { name: 'Inspect a call', exact: true })
    .click();
  await page
    .getByRole('option', {
      name: 'Blind retry · payments.charge · attempt 1',
      exact: true,
    })
    .click();
  await expect(page.locator('.event-detail')).toContainText('Write committed');
});

test('exported results preserve the currently inspected trial', async ({
  page,
}) => {
  await page.getByLabel('Inspect trial', { exact: true }).fill('250');
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export results', exact: true })
    .click();
  const file = await pending;
  const path = await file.path();
  const report = JSON.parse(readFileSync(path!, 'utf8'));
  expect(report.example.trial).toBe(249);
  expect(report.example.baseline.trial).toBe(249);
  expect(report.example.candidate.trial).toBe(249);
  expect(report.candidate.trials).toBe(250);
});

test('recorded faults are counted even when a manual trace labels the call OK', async ({
  page,
}) => {
  const trace = {
    schemaVersion: 1,
    source: 'manual',
    name: 'Observed malformed output',
    events: [
      {
        id: 'e',
        tool: 'read',
        kind: 'read',
        attempt: 1,
        startMs: 0,
        durationMs: 1,
        status: 'ok',
        fault: 'malformed',
        effect: 'none',
      },
    ],
  };
  await page
    .getByLabel('Import trace or experiment')
    .setInputFiles({
      name: 'fault.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(trace)),
    });
  await expect(
    page
      .locator('.trace-metrics .metric')
      .filter({ hasText: 'Calls with errors or faults' })
      .locator('strong'),
  ).toHaveText('1');
});

test('wait segments use the timeline scale even for short call bars', async ({
  page,
}) => {
  const { compare, representativeTrial } =
    await import('../../lib/rehearsal/engine');
  const config = {
    ...DEFAULT_EXPERIMENT,
    seed: 1720,
    trials: 73,
    faultRate: 0.7,
    candidate: {
      ...DEFAULT_EXPERIMENT.candidate,
      maxAttempts: 6,
      backoffMs: 5000,
      budgetMs: 60000,
    },
  };
  const report = compare(config);
  const trial = representativeTrial(report);
  await page.goto(
    '/?' + new URLSearchParams({ experiment: JSON.stringify(config) }),
  );
  await expect(page.getByLabel('Inspect trial')).toHaveValue(String(trial + 1));
  const baseline = report.baseline.runs[trial],
    candidate = report.candidate.runs[trial];
  const maxMs =
    Math.max(baseline.durationMs, candidate.durationMs, 1000) * 1.06;
  for (const [index, run] of [baseline, candidate].entries()) {
    const waits = run.events.filter((e) => e.waitMs > 0);
    const measured = await page
      .locator('.waterfall')
      .nth(index)
      .locator('.wait-bar')
      .evaluateAll((els) =>
        els.map(
          (el) =>
            el.getBoundingClientRect().width /
            el.parentElement!.getBoundingClientRect().width,
        ),
      );
    expect(measured.length).toBe(waits.length);
    waits.forEach((event, i) =>
      expect(measured[i]).toBeCloseTo(event.waitMs / maxMs, 2),
    );
  }
});

test('sharing preserves the selected trial and falls back to a settings download', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByLabel('Inspect trial').fill('250');
  await page
    .getByRole('button', { name: 'Share results', exact: true })
    .click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).searchParams.get('trial')).toBe('250');
  await page.goto(url);
  await expect(page.getByLabel('Inspect trial')).toHaveValue('250');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Unavailable')) },
    }),
  );
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Share results', exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('rehearsal-experiment.json');
  await expect(
    page.getByText(
      'Clipboard unavailable. Downloaded the shareable experiment instead.',
    ),
  ).toBeVisible();
});

test('documentation commands copy exactly and report clipboard failure clearly', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  await page
    .getByRole('button', { name: 'Copy checkout commands', exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'git clone https://github.com/shi1720/agent-rehearsal.git\ncd agent-rehearsal\npython3 examples/checkout.py',
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('Unavailable')) },
    }),
  );
  await page
    .getByRole('button', {
      name: 'Copy SDK installation commands',
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      'Clipboard access is unavailable. Select the commands below to copy them.',
    ),
  ).toBeVisible();
});
