import { representativeTrial } from './engine';
import type { Comparison } from './types';
/** A bounded, portable bundle. Aggregate metrics plus one explicitly named example. */
export function evidenceBundle(report: Comparison) {
  const index = representativeTrial(report);
  const { runs: baselineRuns, ...baseline } = report.baseline;
  const { runs: candidateRuns, ...candidate } = report.candidate;
  return {
    kind: 'rehearsal-evidence',
    version: 1,
    engineVersion: report.engineVersion,
    experiment: report.experiment,
    baseline,
    candidate,
    example: {
      trial: index,
      selection:
        'First duplicate-write recovery; otherwise first safe-completion improvement; otherwise trial zero.',
      baseline: baselineRuns[index],
      candidate: candidateRuns[index],
    },
  };
}
