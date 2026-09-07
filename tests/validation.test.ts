import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_EXPERIMENT } from '../lib/rehearsal/scenarios';
import {
  diagnose,
  parseExperiment,
  parseFile,
  parseTrace,
  MAX_FILE_BYTES,
} from '../lib/rehearsal/validation';
const trace = JSON.parse(
  readFileSync(
    new URL('../public/example-trace.json', import.meta.url),
    'utf8',
  ),
);
void test('real Python output imports into the TS inspector', () => {
  const parsed = parseTrace(trace);
  assert.equal(parsed.events.length, 4);
  assert.ok(diagnose(parsed).some((f) => f.severity === 'critical'));
});
void test('experiment export/import round trips without prototype baggage', () =>
  assert.deepEqual(
    parseExperiment(JSON.parse(JSON.stringify(DEFAULT_EXPERIMENT))),
    DEFAULT_EXPERIMENT,
  ));
void test('malformed JSON and oversized files produce clear errors', () => {
  assert.throws(() => parseFile('{garbage'), /Invalid JSON/);
  assert.throws(() => parseFile(' '.repeat(MAX_FILE_BYTES + 1)), /too large/);
});
void test('unsupported schema versions rejected', () => {
  assert.throws(() => parseTrace({ ...trace, schemaVersion: 2 }));
  assert.throws(() => parseExperiment({ ...DEFAULT_EXPERIMENT, version: 2 }));
});
for (const key of ['status', 'fault', 'effect'])
  for (const bad of [['ok'], {}, null, 1, true])
    void test(`strict primitive enum: ${key} / ${JSON.stringify(bad)}`, () => {
      const data = structuredClone(trace);
      data.events[0][key] = bad;
      assert.throws(() => parseTrace(data));
    });
for (const key of ['startMs', 'durationMs', 'attempt'])
  for (const bad of [NaN, Infinity, -1, '1', null])
    void test(`invalid numeric trace: ${key} / ${String(bad)}`, () => {
      const data = structuredClone(trace);
      data.events[0][key] = bad;
      assert.throws(() => parseTrace(data));
    });
void test('empty, excessive, and duplicate events rejected', () => {
  assert.throws(() => parseTrace({ ...trace, events: [] }));
  assert.throws(() =>
    parseTrace({ ...trace, events: Array(5001).fill(trace.events[0]) }),
  );
  assert.throws(() =>
    parseTrace({ ...trace, events: [trace.events[0], trace.events[0]] }),
  );
});
void test('unknown fields containing sensitive payloads are discarded', () => {
  const data = structuredClone(trace);
  data.api_key = 'TOP SECRET';
  data.events[0].args = { token: 'secret' };
  assert.equal(JSON.stringify(parseTrace(data)).includes('secret'), false);
});
void test('HTML strings remain inert strings; controls and oversize labels rejected', () => {
  const data = structuredClone(trace);
  data.name = '<script>alert(1)</script>';
  assert.equal(parseTrace(data).name, data.name);
  data.name = 'x\u0000y';
  assert.throws(() => parseTrace(data));
  data.name = 'x'.repeat(161);
  assert.throws(() => parseTrace(data));
});
void test('booleans and fractional counts are rejected', () => {
  assert.throws(() => parseExperiment({ ...DEFAULT_EXPERIMENT, seed: 1.1 }));
  assert.throws(() =>
    parseExperiment({
      ...DEFAULT_EXPERIMENT,
      candidate: { ...DEFAULT_EXPERIMENT.candidate, useIdempotency: 'yes' },
    }),
  );
});
void test('successful trace gets a cautious no-pattern finding', () => {
  const d = structuredClone(trace);
  d.events = d.events.filter((e: { status: string }) => e.status === 'ok');
  assert.match(diagnose(parseTrace(d))[0].title, /No configured/);
});

void test('evidence bundles reopen by configuration, discarding untrusted metrics', async () => {
  const { evidenceBundle } = await import('../lib/rehearsal/report');
  const { compare } = await import('../lib/rehearsal/engine');
  const bundle = evidenceBundle(compare(DEFAULT_EXPERIMENT));
  bundle.candidate.safeCompletions = 999999;
  const reopened = parseFile(JSON.stringify(bundle));
  assert.equal(reopened.kind, 'experiment');
  if (reopened.kind === 'experiment')
    assert.equal(compare(reopened.value).candidate.safeCompletions, 208);
  assert.throws(
    () => parseFile(JSON.stringify({ ...bundle, engineVersion: '99.0.0' })),
    /Unsupported/,
  );
  assert.ok(
    JSON.stringify(
      evidenceBundle(compare({ ...DEFAULT_EXPERIMENT, trials: 1000 })),
    ).length < MAX_FILE_BYTES,
  );
});
void test('unsafe imported policies are labeled custom and Unicode labels roundtrip', () => {
  const policy = parseExperiment({
    ...DEFAULT_EXPERIMENT,
    candidate: { ...DEFAULT_EXPERIMENT.candidate, retryAmbiguous: true },
  });
  assert.equal(policy.candidate.name, 'Custom policy');
  assert.equal(
    parseTrace({ ...trace, name: '😀'.repeat(160) }).name,
    '😀'.repeat(160),
  );
  assert.throws(() => parseTrace({ ...trace, name: '😀'.repeat(161) }));
});
