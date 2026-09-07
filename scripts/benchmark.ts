import { performance } from 'node:perf_hooks';
import { compare } from '../lib/rehearsal/engine';
import { DEFAULT_EXPERIMENT } from '../lib/rehearsal/scenarios';
const input = { ...DEFAULT_EXPERIMENT, trials: 1000 };
for (let i = 0; i < 5; i++) compare(input);
const elapsed: number[] = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  compare(input);
  elapsed.push(performance.now() - start);
}
elapsed.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pairedTrials: 1000,
      repetitions: 30,
      medianMs: elapsed[15],
      p95Ms: elapsed[28],
      note: 'Local simulator runtime, not virtual tool latency. Not a production-agent benchmark.',
    },
    null,
    2,
  ),
);
