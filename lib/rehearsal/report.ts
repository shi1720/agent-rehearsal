import { representativeTrial } from './engine';
import type { Comparison } from './types';
/** A bounded, portable bundle. Aggregate metrics plus one explicitly named example. */
export function evidenceBundle(report: Comparison, selectedTrial?: number) {
  const index = selectedTrial ?? representativeTrial(report);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= report.experiment.trials
  ) {
    throw new RangeError(
      'Selected trial must be an index within this experiment.',
    );
  }
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
        selectedTrial === undefined
          ? 'First trial where the candidate avoids a duplicate write; otherwise first safe-completion improvement; otherwise trial zero.'
          : 'The currently inspected trial (zero-based index). Aggregate metrics include all trials.',
      baseline: baselineRuns[index],
      candidate: candidateRuns[index],
    },
  };
}
