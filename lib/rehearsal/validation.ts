import { getScenario } from './scenarios';
import type { Experiment, Trace, Finding, TraceEvent } from './types';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const faults = [
  'none',
  'rate_limit',
  'timeout_before',
  'timeout_after_write',
  'malformed',
  'permanent',
];
function object(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${label} must be an object.`);
  return v as Record<string, unknown>;
}
function num(
  v: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    throw new Error(
      `${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`,
    );
  return v;
}
function str(v: unknown, label: string, max = 160): string {
  if (
    typeof v !== 'string' ||
    v.length === 0 ||
    Array.from(v).length > max ||
    Array.from(v).some((c) => c.charCodeAt(0) < 32)
  )
    throw new Error(
      `${label} must be nonempty text, at most ${max} characters, without control characters.`,
    );
  return v;
}
function bool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean')
    throw new Error(`${label} must be true or false.`);
  return v;
}
export function parseExperiment(value: unknown): Experiment {
  const x = object(value, 'Experiment');
  if (x.version !== 1)
    throw new Error('Unsupported experiment version; expected 1.');
  const scenarioId = str(x.scenarioId, 'Scenario');
  getScenario(scenarioId);
  const p = object(x.candidate, 'Policy');
  return {
    version: 1,
    scenarioId,
    seed: num(x.seed, 'Seed', 0, 4294967295, true),
    trials: num(x.trials, 'Trials', 1, 1000, true),
    faultRate: num(x.faultRate, 'Fault rate', 0, 1),
    candidate: {
      id: 'candidate',
      name:
        p.validateOutput &&
        p.honorRetryAfter &&
        p.useIdempotency &&
        !p.retryPermanent &&
        !p.retryAmbiguous
          ? 'Guarded retry'
          : 'Custom policy',
      maxAttempts: num(p.maxAttempts, 'Max attempts', 1, 6, true),
      backoffMs: num(p.backoffMs, 'Backoff', 0, 5000, true),
      timeoutMs: num(p.timeoutMs, 'Timeout', 1000, 10000, true),
      budgetMs: num(p.budgetMs, 'Time budget', 1000, 60000, true),
      validateOutput: bool(p.validateOutput, 'Output validation'),
      honorRetryAfter: bool(p.honorRetryAfter, 'Retry-After'),
      useIdempotency: bool(p.useIdempotency, 'Idempotency'),
      retryPermanent: bool(p.retryPermanent, 'Permanent retries'),
      retryAmbiguous: bool(p.retryAmbiguous, 'Ambiguous retries'),
    },
  };
}
export function parseTrace(value: unknown): Trace {
  const x = object(value, 'Trace');
  if (x.schemaVersion !== 1)
    throw new Error('Unsupported trace version; expected schemaVersion: 1.');
  if (x.source !== 'python-sdk' && x.source !== 'manual')
    throw new Error('Trace source must be python-sdk or manual.');
  if (
    !Array.isArray(x.events) ||
    x.events.length === 0 ||
    x.events.length > 5000
  )
    throw new Error('A trace needs between 1 and 5,000 events.');
  const ids = new Set<string>();
  const events = x.events.map((v, i): TraceEvent => {
    const e = object(v, `Event ${i + 1}`),
      id = str(e.id, 'Event ID');
    if (ids.has(id)) throw new Error('Duplicate event ID.');
    ids.add(id);
    if (e.kind !== 'read' && e.kind !== 'write')
      throw new Error('Tool kind must be read or write.');
    if (
      typeof e.status !== 'string' ||
      !['ok', 'error', 'cancelled', 'injected'].includes(e.status)
    )
      throw new Error('Unknown event status.');
    if (typeof e.fault !== 'string' || !faults.includes(e.fault))
      throw new Error('Unknown fault type.');
    if (
      typeof e.effect !== 'string' ||
      !['none', 'unknown', 'committed'].includes(e.effect)
    )
      throw new Error('Unknown effect state.');
    return {
      id,
      tool: str(e.tool, 'Tool name'),
      kind: e.kind,
      attempt: num(e.attempt, 'Attempt', 1, 100000, true),
      startMs: num(e.startMs, 'Start time', 0, 1e12),
      durationMs: num(e.durationMs, 'Duration', 0, 1e12),
      status: e.status as TraceEvent['status'],
      fault: e.fault as TraceEvent['fault'],
      effect: e.effect as TraceEvent['effect'],
      ...(e.errorType ? { errorType: str(e.errorType, 'Error type') } : {}),
    };
  });
  return {
    schemaVersion: 1,
    name: str(x.name, 'Trace name'),
    source: x.source,
    events,
  };
}
export function parseFile(
  text: string,
): { kind: 'trace'; value: Trace } | { kind: 'experiment'; value: Experiment } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error('File is too large. Maximum size is 2 MB.');
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    throw new Error(
      'Invalid JSON. Export a trace or experiment and try again.',
    );
  }
  const file = object(x, 'File');
  if (file.kind === 'rehearsal-evidence') {
    if (file.engineVersion !== '1.0.0' || file.version !== 1)
      throw new Error('Unsupported evidence bundle version.');
    return { kind: 'experiment', value: parseExperiment(file.experiment) };
  }
  if (object(x, 'File').schemaVersion !== undefined)
    return { kind: 'trace', value: parseTrace(x) };
  return { kind: 'experiment', value: parseExperiment(x) };
}
export function diagnose(trace: Trace): Finding[] {
  const findings: Finding[] = [];
  const ambiguous = trace.events.filter(
    (e) => e.kind === 'write' && e.effect !== 'none' && e.status !== 'ok',
  );
  if (ambiguous.length)
    findings.push({
      severity: 'critical',
      title: 'A write has an uncertain outcome',
      detail:
        'Verify the operation at the destination before retrying. An error does not prove that a side effect failed.',
      eventIds: ambiguous.map((e) => e.id),
    });
  const malformed = trace.events.filter((e) => e.fault === 'malformed');
  if (malformed.length)
    findings.push({
      severity: 'warning',
      title: 'An output contract was challenged',
      detail:
        'Check that the caller validates tool responses before using them. A response arriving is not proof that it is usable.',
      eventIds: malformed.map((e) => e.id),
    });
  const groups = new Map<string, TraceEvent[]>();
  for (const e of trace.events) {
    const g = groups.get(e.tool) ?? [];
    g.push(e);
    groups.set(e.tool, g);
  }
  for (const [tool, events] of groups) {
    const errors = events.filter(
      (e) => e.status === 'error' || e.status === 'injected',
    );
    if (errors.length >= 3)
      findings.push({
        severity: 'warning',
        title: `Repeated failures in ${tool}`,
        detail: `${errors.length} failed or injected calls. Inspect retry limits, permanent-error classification, and total deadlines. These may be separate logical operations.`,
        eventIds: errors.map((e) => e.id),
      });
  }
  const cancelled = trace.events.filter((e) => e.status === 'cancelled');
  if (cancelled.length)
    findings.push({
      severity: 'info',
      title: 'Cancellation reached the tool boundary',
      detail:
        'Cancellation was recorded. Confirm downstream operations also stopped; cooperative cancellation is not a rollback.',
      eventIds: cancelled.map((e) => e.id),
    });
  if (!findings.length)
    findings.push({
      severity: 'info',
      title: 'No configured warning patterns found',
      detail:
        'This metadata-only inspection cannot prove task correctness, absence of side effects, or the quality of an agent’s answer.',
      eventIds: [],
    });
  return findings;
}
