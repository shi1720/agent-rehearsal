#!/usr/bin/env node
/** CI-friendly simulator. User-supplied files are data, never executable code. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compare } from '../lib/rehearsal/engine';
import { DEFAULT_EXPERIMENT } from '../lib/rehearsal/scenarios';
import {
  MAX_FILE_BYTES,
  parseFile,
  parseExperiment,
} from '../lib/rehearsal/validation';
try {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      scenario: { type: 'string' },
      seed: { type: 'string' },
      trials: { type: 'string' },
      'fault-rate': { type: 'string' },
      output: { type: 'string' },
      'min-safe': { type: 'string' },
      'max-duplicates': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      'rehearse [--config experiment.json] [--scenario checkout|research|devops] [--seed 1720] [--trials 250] [--fault-rate 0.35] [--output report.json] [--min-safe 0.8] [--max-duplicates 0]',
    );
    process.exit(0);
  }
  let input = structuredClone(DEFAULT_EXPERIMENT);
  if (values.config) {
    const data = readFileSync(values.config);
    if (data.byteLength > MAX_FILE_BYTES)
      throw new Error('Configuration exceeds 2 MB.');
    const parsed = parseFile(new TextDecoder().decode(data));
    if (parsed.kind !== 'experiment')
      throw new Error('Expected an experiment, not a tool trace.');
    input = parsed.value;
  }
  if (values.scenario !== undefined) input.scenarioId = values.scenario;
  if (values.seed !== undefined) input.seed = Number(values.seed);
  if (values.trials !== undefined) input.trials = Number(values.trials);
  if (values['fault-rate'] !== undefined)
    input.faultRate = Number(values['fault-rate']);
  const report = compare(parseExperiment(input));
  const minSafe =
    values['min-safe'] === undefined ? 0 : Number(values['min-safe']);
  const maxDuplicates =
    values['max-duplicates'] === undefined
      ? Infinity
      : Number(values['max-duplicates']);
  if (!Number.isFinite(minSafe) || minSafe < 0 || minSafe > 1)
    throw new Error('min-safe must be 0..1');
  if (
    values['max-duplicates'] !== undefined &&
    (!Number.isInteger(maxDuplicates) || maxDuplicates < 0)
  )
    throw new Error('max-duplicates must be a nonnegative integer');
  if (values.output)
    writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
  const { runs: _runs, ...summary } = report.candidate;
  console.log(
    JSON.stringify(
      {
        engineVersion: report.engineVersion,
        seed: input.seed,
        scenario: input.scenarioId,
        ...summary,
      },
      null,
      2,
    ),
  );
  if (
    summary.safeCompletions / summary.trials < minSafe ||
    summary.duplicateWrites > maxDuplicates
  ) {
    console.error('Regression gate failed.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid input.');
  process.exitCode = 2;
}
