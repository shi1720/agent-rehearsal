/** Public v1 contracts. Durations are virtual milliseconds, costs are integer microdollars. */
export type Fault =
  | 'none'
  | 'rate_limit'
  | 'timeout_before'
  | 'timeout_after_write'
  | 'malformed'
  | 'permanent';
export type ToolKind = 'read' | 'write';
export interface Step {
  id: string;
  name: string;
  kind: ToolKind;
  latencyMs: number;
  costMicros: number;
  fault: Fault;
  supportsIdempotency: boolean;
}
export interface Scenario {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  icon: string;
  steps: Step[];
}
export interface Policy {
  id: string;
  name: string;
  maxAttempts: number;
  backoffMs: number;
  timeoutMs: number;
  budgetMs: number;
  validateOutput: boolean;
  honorRetryAfter: boolean;
  useIdempotency: boolean;
  retryPermanent: boolean;
  retryAmbiguous: boolean;
}
export interface Experiment {
  version: 1;
  scenarioId: string;
  seed: number;
  trials: number;
  faultRate: number;
  candidate: Policy;
}
export type EventStatus =
  | 'ok'
  | 'rate_limit'
  | 'timeout'
  | 'malformed'
  | 'permanent'
  | 'budget_exhausted'
  | 'unsafe_retry_blocked';
export interface SimEvent {
  id: string;
  stepId: string;
  tool: string;
  kind: ToolKind;
  attempt: number;
  startMs: number;
  durationMs: number;
  waitMs: number;
  status: EventStatus;
  fault: Fault;
  costMicros: number;
  effectCommitted: boolean;
  deduplicated: boolean;
  detail: string;
}
export interface Trial {
  trial: number;
  events: SimEvent[];
  completed: boolean;
  safe: boolean;
  duplicateWrites: number;
  invalidOutputs: number;
  durationMs: number;
  costMicros: number;
  stopReason: string;
}
export interface Summary {
  policy: Policy;
  trials: number;
  safeCompletions: number;
  completions: number;
  duplicateWrites: number;
  invalidOutputs: number;
  attempts: number;
  costMicros: number;
  p95Ms: number;
  meanMs: number;
  runs: Trial[];
}
export interface Comparison {
  version: 1;
  engineVersion: '1.0.0';
  experiment: Experiment;
  baseline: Summary;
  candidate: Summary;
}
export interface TraceEvent {
  id: string;
  tool: string;
  kind: ToolKind;
  attempt: number;
  startMs: number;
  durationMs: number;
  status: 'ok' | 'error' | 'cancelled' | 'injected';
  fault: Fault;
  effect: 'none' | 'unknown' | 'committed';
  errorType?: string;
}
export interface Trace {
  schemaVersion: 1;
  name: string;
  source: 'python-sdk' | 'manual';
  events: TraceEvent[];
}
export interface Finding {
  severity: 'warning' | 'info' | 'critical';
  title: string;
  detail: string;
  eventIds: string[];
}
