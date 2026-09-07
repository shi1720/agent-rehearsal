import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, sample, simulate } from '../lib/rehearsal/engine';
import {
  BASELINE,
  DEFAULT_EXPERIMENT,
  GUARDED,
  SCENARIOS,
} from '../lib/rehearsal/scenarios';
import type { Scenario } from '../lib/rehearsal/types';
import vectors from '../fixtures/random-vectors.json';

for (const v of vectors)
  void test(`shared Python/TS sampler: ${v.step} / ${v.seed}`, () =>
    assert.equal(
      sample(v.seed, v.trial, v.step, v.attempt, v.channel),
      v.expected,
    ));
void test('same config produces the exact same full report', () =>
  assert.deepEqual(compare(DEFAULT_EXPERIMENT), compare(DEFAULT_EXPERIMENT)));
void test('happy path: both policies finish safely without faults', () => {
  const c = compare({ ...DEFAULT_EXPERIMENT, faultRate: 0 });
  assert.equal(c.baseline.safeCompletions, 250);
  assert.equal(c.candidate.safeCompletions, 250);
  assert.equal(c.candidate.duplicateWrites, 0);
});
void test('all attempts failing exhausts finitely', () => {
  const c = compare({ ...DEFAULT_EXPERIMENT, faultRate: 1 });
  assert.equal(c.baseline.completions, 0);
  assert.equal(c.candidate.completions, 0);
  assert.ok(c.candidate.runs.every((r) => r.events.length <= 3));
});
void test('default regression: naive duplicate charges, guarded zero duplicates', () => {
  const c = compare(DEFAULT_EXPERIMENT);
  assert.ok(c.baseline.duplicateWrites > 0);
  assert.equal(c.candidate.duplicateWrites, 0);
  assert.ok(c.candidate.safeCompletions > c.baseline.safeCompletions);
});
void test('fault schedule is independent of policy order', () => {
  const a = simulate(SCENARIOS[0], GUARDED, 21, 2, 0.35);
  simulate(SCENARIOS[1], BASELINE, 99, 8, 0.8);
  assert.deepEqual(a, simulate(SCENARIOS[0], GUARDED, 21, 2, 0.35));
});
void test('different seeds produce different reports', () =>
  assert.notDeepEqual(
    compare(DEFAULT_EXPERIMENT).baseline,
    compare({ ...DEFAULT_EXPERIMENT, seed: 1721 }).baseline,
  ));
void test('permanent failures stop guarded retry immediately', () => {
  const s = { ...SCENARIOS[2], steps: [SCENARIOS[2].steps[2]] };
  const r = simulate(s, GUARDED, 0, 0, 1);
  assert.equal(r.events.length, 1);
  assert.match(r.stopReason, /Permanent/);
});
void test('no idempotency contract: ambiguous write stops before repeating', () => {
  const s = { ...SCENARIOS[2], steps: [SCENARIOS[2].steps[3]] };
  const r = simulate(s, GUARDED, 0, 0, 1);
  assert.equal(r.events.length, 1);
  assert.equal(r.duplicateWrites, 0);
  assert.match(r.stopReason, /Ambiguous/);
});
void test('malformed write result is also ambiguous (review regression)', () => {
  const s: Scenario = {
    id: 'custom',
    name: 'custom',
    eyebrow: '',
    description: '',
    icon: '',
    steps: [
      {
        id: 'write',
        name: 'charges.create',
        kind: 'write',
        latencyMs: 100,
        costMicros: 1,
        fault: 'malformed',
        supportsIdempotency: false,
      },
    ],
  };
  const r = simulate(s, GUARDED, 0, 0, 0.5);
  assert.equal(r.events.length, 1);
  assert.equal(r.duplicateWrites, 0);
  assert.equal(r.completed, false);
});
void test('crossing a cooldown boundary never extends it (review regression)', () => {
  const s = { ...SCENARIOS[0], steps: [SCENARIOS[0].steps[0]] };
  const r = simulate(
    s,
    { ...GUARDED, maxAttempts: 6, backoffMs: 50, honorRetryAfter: false },
    219,
    0,
    0.3,
  );
  assert.equal(r.completed, true);
  assert.equal(r.events.at(-1)?.status, 'ok');
});
void test('time budget prevents a call from starting', () => {
  const r = simulate(SCENARIOS[0], { ...GUARDED, budgetMs: 100 }, 5, 0, 0);
  assert.equal(r.durationMs, 0);
  assert.equal(r.costMicros, 0);
  assert.equal(r.events[0].status, 'budget_exhausted');
});
void test('public comparison validates CPU/memory bounds and nonfinite data', () => {
  for (const bad of [NaN, Infinity, -1, 1e9])
    assert.throws(() => compare({ ...DEFAULT_EXPERIMENT, trials: bad }));
  assert.throws(() =>
    compare({ ...DEFAULT_EXPERIMENT, scenarioId: 'unknown' }),
  );
});
void test('experiment snapshot is isolated from caller mutations', () => {
  const input = structuredClone(DEFAULT_EXPERIMENT);
  const result = compare(input);
  input.candidate.maxAttempts = 6;
  assert.equal(result.experiment.candidate.maxAttempts, 3);
});
void test('model invariants across 3 scenarios, 20 seeds and 6 fault rates', () => {
  for (const scenario of SCENARIOS)
    for (let seed = 0; seed < 20; seed++)
      for (const rate of [0, 0.1, 0.35, 0.7, 0.99, 1])
        for (const policy of [
          BASELINE,
          GUARDED,
          { ...GUARDED, budgetMs: 1000 },
        ]) {
          const r = simulate(scenario, policy, seed, 0, rate);
          assert.ok(r.durationMs <= policy.budgetMs);
          assert.equal(
            r.costMicros,
            r.events.reduce((n, e) => n + e.costMicros, 0),
          );
          assert.equal(
            r.durationMs,
            r.events.reduce((n, e) => n + e.durationMs + e.waitMs, 0),
          );
          assert.equal(
            r.safe,
            r.completed && r.duplicateWrites === 0 && r.invalidOutputs === 0,
          );
          assert.ok(
            r.events.length <= scenario.steps.length * policy.maxAttempts,
          );
          if (policy.useIdempotency && !policy.retryAmbiguous)
            assert.equal(r.duplicateWrites, 0);
          if (policy.validateOutput) assert.equal(r.invalidOutputs, 0);
          for (let i = 1; i < r.events.length; i++)
            assert.ok(
              r.events[i].startMs >=
                r.events[i - 1].startMs +
                  r.events[i - 1].durationMs +
                  r.events[i - 1].waitMs,
            );
        }
});
