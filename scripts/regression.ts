/** Committed, inspectable golden aggregate; any change requires semantic review. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare } from '../lib/rehearsal/engine';
import { DEFAULT_EXPERIMENT } from '../lib/rehearsal/scenarios';
const { baseline, candidate } = compare(DEFAULT_EXPERIMENT);
const actual = {
  baseline: {
    safe: baseline.safeCompletions,
    completed: baseline.completions,
    duplicates: baseline.duplicateWrites,
    invalid: baseline.invalidOutputs,
    p95Ms: baseline.p95Ms,
  },
  candidate: {
    safe: candidate.safeCompletions,
    completed: candidate.completions,
    duplicates: candidate.duplicateWrites,
    invalid: candidate.invalidOutputs,
    p95Ms: candidate.p95Ms,
  },
};
const expected = JSON.parse(
  readFileSync(
    new URL('../fixtures/golden-summary.json', import.meta.url),
    'utf8',
  ),
);
assert.deepEqual(actual, expected);
console.log('Golden aggregate matches. Seed 1720, 250 paired checkout trials.');
