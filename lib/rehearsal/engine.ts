import type {
  Comparison,
  Experiment,
  Policy,
  Scenario,
  SimEvent,
  Summary,
  Trial,
} from './types';
import { BASELINE, getScenario } from './scenarios';
import { parseExperiment } from './validation';
/** FNV-1a over UTF-8. Keyed samples never depend on a policy's random-call count. */
export function sample(
  seed: number,
  trial: number,
  step: string,
  attempt: number,
  channel = 'fault',
): number {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(
    `${seed}:${trial}:${step}:${attempt}:${channel}`,
  ))
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  // Avalanche adjacent keys; all arithmetic is explicitly uint32 for Python parity.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
export function simulate(
  scenario: Scenario,
  policy: Policy,
  seed: number,
  trial: number,
  faultRate: number,
): Trial {
  const events: SimEvent[] = [];
  let clock = 0,
    totalCost = 0,
    duplicates = 0,
    invalid = 0,
    completed = true,
    stopReason = 'Workflow completed';
  for (const step of scenario.steps) {
    let acknowledged = false,
      writes = 0,
      retryAfterUntil = 0;
    const idempotent =
      step.kind === 'write' &&
      step.supportsIdempotency &&
      policy.useIdempotency;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      const start = clock;
      let fault =
        sample(seed, trial, step.id, attempt) < faultRate ? step.fault : 'none';
      // Permanent failures stay permanent within this workflow, independent of retries.
      if (
        step.fault === 'permanent' &&
        sample(seed, trial, step.id, 1) < faultRate
      )
        fault = 'permanent';
      const inCooldown = clock < retryAfterUntil;
      if (inCooldown) fault = 'rate_limit';
      const timeout =
        fault === 'timeout_before' || fault === 'timeout_after_write';
      const duration = timeout ? policy.timeoutMs : step.latencyMs;
      if (clock + duration > policy.budgetMs) {
        events.push({
          id: `${trial}:${step.id}:${attempt}`,
          stepId: step.id,
          tool: step.name,
          kind: step.kind,
          attempt,
          startMs: clock,
          durationMs: 0,
          waitMs: 0,
          status: 'budget_exhausted',
          fault: 'none',
          costMicros: 0,
          effectCommitted: false,
          deduplicated: false,
          detail:
            'No attempt started: the remaining time budget cannot cover it.',
        });
        stopReason = 'Time budget exhausted';
        break;
      }
      clock += duration;
      totalCost += step.costMicros;
      const event: SimEvent = {
        id: `${trial}:${step.id}:${attempt}`,
        stepId: step.id,
        tool: step.name,
        kind: step.kind,
        attempt,
        startMs: start,
        durationMs: duration,
        waitMs: 0,
        status: 'ok',
        fault,
        costMicros: step.costMicros,
        effectCommitted: false,
        deduplicated: false,
        detail: 'Tool returned a valid response.',
      };
      if (
        step.kind === 'write' &&
        (fault === 'none' ||
          fault === 'timeout_after_write' ||
          fault === 'malformed')
      ) {
        if (idempotent && writes > 0) {
          event.deduplicated = true;
        } else {
          writes++;
          event.effectCommitted = true;
          if (writes > 1) duplicates++;
        }
      }
      if (fault === 'none') {
        acknowledged = true;
        event.detail = event.deduplicated
          ? 'The tool reused the original operation. No second write.'
          : 'Tool returned a valid response.';
      } else if (fault === 'malformed') {
        event.status = 'malformed';
        event.detail = policy.validateOutput
          ? 'Output contract rejected. A green HTTP response is not a valid result.'
          : 'Malformed output was accepted as a success.';
        if (!policy.validateOutput) {
          invalid++;
          acknowledged = true;
        }
      } else if (fault === 'rate_limit') {
        event.status = 'rate_limit';
        if (!inCooldown) retryAfterUntil = clock + 1200;
        event.detail = 'Rate limited. Tool requests a 1,200 ms cooldown.';
      } else if (fault === 'permanent') {
        event.status = 'permanent';
        event.detail =
          'Credentials revoked. Retrying cannot repair authorization.';
      } else {
        event.status = 'timeout';
        event.detail =
          fault === 'timeout_after_write'
            ? event.deduplicated
              ? 'Response lost again; idempotency prevented a duplicate.'
              : 'Write committed, but its response was lost. Outcome is ambiguous to the caller.'
            : 'Timed out before the tool performed work.';
      }
      events.push(event);
      if (acknowledged) break;
      if (fault === 'permanent' && !policy.retryPermanent) {
        stopReason = 'Permanent failure: escalation required';
        break;
      }
      if (
        step.kind === 'write' &&
        (fault === 'timeout_after_write' || fault === 'malformed') &&
        !idempotent &&
        !policy.retryAmbiguous
      ) {
        event.detail += ' Automatic retry blocked: no idempotency contract.';
        stopReason = 'Ambiguous write: human verification required';
        break;
      }
      if (attempt === policy.maxAttempts) {
        stopReason = 'Attempt budget exhausted';
        break;
      }
      let wait = Math.round(
        policy.backoffMs *
          2 ** (attempt - 1) *
          (0.75 + sample(seed, trial, step.id, attempt, 'jitter') * 0.5),
      );
      if (policy.honorRetryAfter)
        wait = Math.max(wait, retryAfterUntil - clock);
      if (clock + wait > policy.budgetMs) {
        stopReason = 'Time budget exhausted before retry';
        break;
      }
      event.waitMs = wait;
      clock += wait;
    }
    if (!acknowledged) {
      completed = false;
      break;
    }
  }
  return {
    trial,
    events,
    completed,
    safe: completed && duplicates === 0 && invalid === 0,
    duplicateWrites: duplicates,
    invalidOutputs: invalid,
    durationMs: clock,
    costMicros: totalCost,
    stopReason,
  };
}
function summarize(policy: Policy, runs: Trial[]): Summary {
  const times = runs.map((r) => r.durationMs).sort((a, b) => a - b);
  return {
    policy,
    trials: runs.length,
    safeCompletions: runs.filter((r) => r.safe).length,
    completions: runs.filter((r) => r.completed).length,
    duplicateWrites: runs.reduce((n, r) => n + r.duplicateWrites, 0),
    invalidOutputs: runs.reduce((n, r) => n + r.invalidOutputs, 0),
    attempts: runs.reduce(
      (n, r) =>
        n + r.events.filter((e) => e.status !== 'budget_exhausted').length,
      0,
    ),
    costMicros: runs.reduce((n, r) => n + r.costMicros, 0),
    p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? 0,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    runs,
  };
}
export function compare(input: Experiment): Comparison {
  const experiment = parseExperiment(input);
  const scenario = getScenario(experiment.scenarioId);
  const baseline = {
    ...BASELINE,
    timeoutMs: experiment.candidate.timeoutMs,
    budgetMs: experiment.candidate.budgetMs,
  };
  const run = (p: Policy) =>
    summarize(
      p,
      Array.from({ length: experiment.trials }, (_, i) =>
        simulate(scenario, p, experiment.seed, i, experiment.faultRate),
      ),
    );
  return {
    version: 1,
    engineVersion: '1.0.0',
    experiment: structuredClone(experiment),
    baseline: run(baseline),
    candidate: run(experiment.candidate),
  };
}
export function representativeTrial(c: Comparison): number {
  const impactful = c.baseline.runs.findIndex(
    (r, i) => r.duplicateWrites > 0 && c.candidate.runs[i].safe,
  );
  if (impactful >= 0) return impactful;
  const improved = c.baseline.runs.findIndex(
    (r, i) => !r.safe && c.candidate.runs[i].safe,
  );
  return improved >= 0 ? improved : 0;
}
