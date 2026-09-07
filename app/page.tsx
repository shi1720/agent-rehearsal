'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FlaskConical,
  GitBranch,
  GitFork as Github,
  LockKeyhole,
  Play,
  RotateCcw,
  Terminal,
  TriangleAlert,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  FaultTag,
  Toggle,
  Metric,
  Waterfall,
  Outcome,
} from '@/components/rehearsal/visuals';
import { FieldGuide } from '@/components/rehearsal/field-guide';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { compare, representativeTrial } from '@/lib/rehearsal/engine';
import {
  DEFAULT_EXPERIMENT,
  SCENARIOS,
  getScenario,
} from '@/lib/rehearsal/scenarios';
import { evidenceBundle } from '@/lib/rehearsal/report';
import {
  diagnose,
  MAX_FILE_BYTES,
  parseExperiment,
  parseFile,
} from '@/lib/rehearsal/validation';
import type {
  Comparison,
  Experiment,
  Policy,
  SimEvent,
  Trace,
} from '@/lib/rehearsal/types';

const REPO = 'https://github.com/shi1720/agent-rehearsal';
const percent = (n: number, total: number) =>
  `${((100 * n) / total).toFixed(1)}%`;
const seconds = (n: number) => `${(n / 1000).toFixed(2)}s`;
const traceTime = (n: number) =>
  n < 1000 ? `${Number(n.toFixed(3))}ms` : seconds(n);
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + '\n'], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Home() {
  const [tab, setTab] = useState('lab');
  const [hydrated, setHydrated] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [draft, setDraft] = useState<Experiment>(
    structuredClone(DEFAULT_EXPERIMENT),
  );
  const [result, setResult] = useState<Comparison>(() =>
    compare(DEFAULT_EXPERIMENT),
  );
  const [trial, setTrial] = useState(() =>
    representativeTrial(compare(DEFAULT_EXPERIMENT)),
  );
  const [selection, setSelection] = useState<{
    policy: string;
    event: SimEvent;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [tracePage, setTracePage] = useState(0);
  const [relatedIds, setRelatedIds] = useState<string[] | null>(null);
  const relatedSet = useMemo(
    () => (relatedIds ? new Set(relatedIds) : null),
    [relatedIds],
  );
  const visibleEvents =
    trace?.events.filter((e) => !relatedSet || relatedSet.has(e.id)) ?? [];
  const input = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const [loadingExample, setLoadingExample] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(result.experiment);
  const scenario = getScenario(draft.scenarioId);
  const findings = useMemo(() => (trace ? diagnose(trace) : []), [trace]);
  const baseline = result.baseline.runs[trial],
    candidate = result.candidate.runs[trial];
  const maxMs =
    Math.max(baseline.durationMs, candidate.durationMs, 1000) * 1.06;
  const improvement =
    (100 *
      (result.candidate.safeCompletions - result.baseline.safeCompletions)) /
    result.experiment.trials;
  // URL hydration reads browser state once; the server renders the reproducible default.
  // eslint-disable-next-line react/react-compiler
  useEffect(() => {
    // eslint-disable-next-line react/react-compiler -- disable controls until browser hydration
    setHydrated(true);
    setSettingsExpanded(!window.matchMedia('(max-width: 850px)').matches);
    try {
      const params = new URLSearchParams(window.location.search);
      const config = params.get('experiment');
      if (config) {
        const parsed = parseExperiment(JSON.parse(config));
        const c = compare(parsed);
        const sharedTrial = params.get('trial');
        if (
          sharedTrial !== null &&
          (!/^\d+$/.test(sharedTrial) ||
            Number(sharedTrial) < 1 ||
            Number(sharedTrial) > parsed.trials)
        ) {
          throw new Error('Shared trial is out of range.');
        }
        // eslint-disable-next-line react/react-compiler -- browser-only URL hydration
        setDraft(parsed);
        setResult(c);
        setTrial(
          sharedTrial === null
            ? representativeTrial(c)
            : Number(sharedTrial) - 1,
        );
        setNotice('Shared experiment loaded. Results reproduced locally.');
      }
    } catch {
      setError(
        'This shared experiment is invalid. The default experiment is ready below.',
      );
    }
  }, []);
  function policy<K extends keyof Policy>(key: K, value: Policy[K]) {
    setDraft((d) => ({ ...d, candidate: { ...d.candidate, [key]: value } }));
  }
  async function run() {
    ++loadGeneration.current;
    setLoadingExample(false);
    setError('');
    setRunning(true);
    setNotice('');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const valid = parseExperiment(draft);
      const c = compare(valid);
      setDraft(valid);
      setResult(c);
      setTrial(representativeTrial(c));
      setSelection(null);
      setNotice(
        `Compared ${valid.trials} trials per policy. Seed ${valid.seed}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run experiment.');
    } finally {
      setRunning(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    const generation = ++loadGeneration.current;
    setLoadingExample(false);
    setError('');
    setNotice('');
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error('File is too large. Maximum size is 2 MB.');
      const content = await file.text();
      if (generation !== loadGeneration.current) return;
      const imported = parseFile(content);
      if (imported.kind === 'trace') {
        setTrace(imported.value);
        setTracePage(0);
        setRelatedIds(null);
        setTab('traces');
        setNotice(
          `Loaded ${imported.value.events.length} events. The file stays in this browser tab.`,
        );
      } else {
        const c = compare(imported.value);
        setDraft(imported.value);
        setResult(c);
        setTrial(representativeTrial(c));
        setSelection(null);
        setTab('lab');
        setNotice('Experiment imported and reproduced.');
      }
    } catch (e) {
      if (generation === loadGeneration.current)
        setError(
          e instanceof Error ? e.message : 'Could not import this file.',
        );
    } finally {
      if (generation === loadGeneration.current && input.current)
        input.current.value = '';
    }
  }
  async function share() {
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('experiment', JSON.stringify(result.experiment));
      url.searchParams.set('trial', String(trial + 1));
      await navigator.clipboard.writeText(url.href);
      setNotice(
        'Link copied. It reproduces these settings and the selected trial; it contains no imported trace data.',
      );
    } catch {
      download('rehearsal-experiment.json', result.experiment);
      setNotice(
        'Clipboard unavailable. Downloaded the shareable experiment instead.',
      );
    }
  }
  async function loadExample() {
    const generation = ++loadGeneration.current;
    setLoadingExample(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/example-trace.json');
      if (!r.ok) throw new Error('Example could not be loaded.');
      const content = await r.text();
      if (generation !== loadGeneration.current) return;
      const parsed = parseFile(content);
      if (parsed.kind !== 'trace')
        throw new Error('Example format is invalid.');
      setTrace(parsed.value);
      setTracePage(0);
      setRelatedIds(null);
      setTab('traces');
      setNotice(
        `Loaded checkout example · ${parsed.value.events.length} recorded calls.`,
      );
    } catch (e) {
      if (generation === loadGeneration.current)
        setError(e instanceof Error ? e.message : 'Could not load example.');
    } finally {
      if (generation === loadGeneration.current) setLoadingExample(false);
    }
  }
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(String(v))}
      className="app-shell"
      data-ready={hydrated}
      inert={!hydrated || running}
      aria-busy={!hydrated || running}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="sidebar">
        <Link href="/" className="brand" aria-label="Agent Rehearsal home">
          <span className="brand-mark">
            <Workflow size={24} />
          </span>
          <span className="brand-name">
            Agent Rehearsal<small>Tool reliability, examined.</small>
          </span>
        </Link>
        <TabsList className="side-nav" aria-label="Main navigation">
          <TabsTrigger value="lab">
            <FlaskConical size={18} />
            Simulator
          </TabsTrigger>
          <TabsTrigger value="traces">
            <Activity size={18} />
            Trace inspector
          </TabsTrigger>
          <TabsTrigger value="guide">
            <BookOpen size={18} />
            Documentation
          </TabsTrigger>
        </TabsList>
        <a className="repo-link" href={REPO} target="_blank" rel="noreferrer">
          <Github size={16} /> GitHub <ArrowRight size={14} />
        </a>
      </header>
      <div className="main-shell">
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Import trace or experiment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void importFile(file);
          }}
        />
        <main id="main-content" tabIndex={-1}>
          <div className="feedback" aria-live="polite">
            {notice && (
              <div className="notice">
                <Check size={15} />
                {notice}
                <button
                  aria-label="Dismiss notification"
                  onClick={() => setNotice('')}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                <TriangleAlert size={16} />
                {error}
                <button aria-label="Dismiss error" onClick={() => setError('')}>
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <TabsContent value="lab">
            <section className="page-heading">
              <div>
                <div className="eyebrow">Retry policy simulator</div>
                <h1>Compare retry policies</h1>
                <p>
                  Test retry policies against simulated tool failures. See which
                  workflows finish safely, which stop, and what recovery costs
                  in time and calls.
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="outline-button"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} /> Import JSON
                </button>
                <button
                  className="outline-button share-button"
                  onClick={() => void share()}
                >
                  <GitBranch size={16} />
                  Share results
                </button>
              </div>
            </section>
            <div className="model-banner">
              <FlaskConical size={17} />
              <p>
                <strong>A simulation of tool calls.</strong> These results use a
                fixed workflow, not a live agent or an LLM.{' '}
                <button onClick={() => setTab('guide')}>
                  How the model works <ArrowRight size={13} />
                </button>
              </p>
            </div>
            <div className="scenario-strip">
              {SCENARIOS.map((s, i) => (
                <button
                  className={`scenario-card ${draft.scenarioId === s.id ? 'active' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, scenarioId: s.id }))}
                  key={s.id}
                  aria-pressed={draft.scenarioId === s.id}
                >
                  <span className="scenario-number">0{i + 1}</span>
                  <div>
                    <span>{s.eyebrow}</span>
                    <strong>{s.name}</strong>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
            <div className="lab-grid">
              <section className="control-panel panel">
                <div className="panel-heading">
                  <h2>Experiment settings</h2>
                  <button
                    className="icon-button"
                    aria-label="Reset experiment"
                    title="Reset experiment"
                    onClick={() =>
                      setDraft(structuredClone(DEFAULT_EXPERIMENT))
                    }
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <p className="control-intro">{scenario.description}</p>
                <button
                  className="run-button"
                  onClick={() => void run()}
                  disabled={running}
                >
                  <Play size={15} fill="currentColor" />
                  {running ? 'Comparing…' : 'Compare policies'}
                  <ArrowRight size={16} />
                </button>
                <details
                  className="settings-disclosure"
                  open={settingsExpanded}
                  onToggle={(e) => setSettingsExpanded(e.currentTarget.open)}
                >
                  <summary>Edit experiment settings</summary>
                  <div className="control">
                    <div className="label-line">
                      <span id="fault-label">Fault probability</span>
                      <output>
                        {Math.round(draft.faultRate * 100)}
                        <small>%</small>
                      </output>
                    </div>
                    <Slider
                      aria-labelledby="fault-label"
                      value={[Math.round(draft.faultRate * 100)]}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          faultRate: (Array.isArray(v) ? v[0] : v) / 100,
                        }))
                      }
                      min={0}
                      max={100}
                      step={5}
                    />
                    <div className="range-labels">
                      <span>0% · no faults</span>
                      <span>100% · every eligible call</span>
                    </div>
                  </div>
                  <div className="control compact">
                    <div>
                      <label htmlFor="seed">Random seed</label>
                      <input
                        id="seed"
                        type="number"
                        min="0"
                        max="4294967295"
                        step="1"
                        value={Number.isNaN(draft.seed) ? '' : draft.seed}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            seed: e.target.valueAsNumber,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <span id="trials-label">Trials per policy</span>
                      <Select
                        value={String(draft.trials)}
                        onValueChange={(v) =>
                          setDraft((d) => ({ ...d, trials: Number(v) }))
                        }
                      >
                        <SelectTrigger aria-labelledby="trials-label">
                          <SelectValue>{draft.trials}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {[100, 250, 500, 1000].map((n) => (
                            <SelectItem value={String(n)} key={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="control-divider">
                    <h3>Your retry policy</h3>
                    <span>Compared with blind retry</span>
                  </div>
                  <div className="control">
                    <div className="label-line">
                      <span id="attempt-label">Attempts per tool</span>
                      <output>{draft.candidate.maxAttempts}</output>
                    </div>
                    <Slider
                      aria-labelledby="attempt-label"
                      value={[draft.candidate.maxAttempts]}
                      onValueChange={(v) =>
                        policy('maxAttempts', Array.isArray(v) ? v[0] : v)
                      }
                      min={1}
                      max={6}
                      step={1}
                    />
                    <div className="range-labels">
                      <span>Includes the first call</span>
                      <span>6 · up to 5 retries</span>
                    </div>
                  </div>
                  <div className="control compact">
                    <div>
                      <label htmlFor="backoff">Initial backoff (ms)</label>
                      <input
                        id="backoff"
                        type="number"
                        min="0"
                        max="5000"
                        step="100"
                        value={
                          Number.isNaN(draft.candidate.backoffMs)
                            ? ''
                            : draft.candidate.backoffMs
                        }
                        onChange={(e) =>
                          policy('backoffMs', e.target.valueAsNumber)
                        }
                      />
                    </div>
                    <div>
                      <span id="budget-label">Time budget</span>
                      <Select
                        value={String(draft.candidate.budgetMs)}
                        onValueChange={(v) => policy('budgetMs', Number(v))}
                      >
                        <SelectTrigger aria-labelledby="budget-label">
                          <SelectValue>
                            {draft.candidate.budgetMs / 1000}s
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {[3000, 5000, 15000, 30000].map((n) => (
                            <SelectItem value={String(n)} key={n}>
                              {n / 1000}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Toggle
                    label="Idempotency keys"
                    description="Reuse the same operation key on retries"
                    checked={draft.candidate.useIdempotency}
                    onChange={(v) => policy('useIdempotency', v)}
                  />
                  <Toggle
                    label="Validate outputs"
                    description="Reject malformed responses"
                    checked={draft.candidate.validateOutput}
                    onChange={(v) => policy('validateOutput', v)}
                  />
                  <Toggle
                    label="Honor Retry-After"
                    description="Wait as requested by a rate-limited tool"
                    checked={draft.candidate.honorRetryAfter}
                    onChange={(v) => policy('honorRetryAfter', v)}
                  />
                  <details className="effective-policy">
                    <summary>Timeout and error handling</summary>
                    <div className="control">
                      <label htmlFor="timeout">Call timeout (ms)</label>
                      <input
                        id="timeout"
                        type="number"
                        min="1000"
                        max="10000"
                        step="100"
                        value={
                          Number.isNaN(draft.candidate.timeoutMs)
                            ? ''
                            : draft.candidate.timeoutMs
                        }
                        onChange={(e) =>
                          policy('timeoutMs', e.target.valueAsNumber)
                        }
                      />
                      <p className="field-help">
                        Call timeout and total time budget apply to both
                        policies.
                      </p>
                    </div>
                    <Toggle
                      label="Retry permanent errors"
                      description="Repeat calls even after an authorization failure"
                      checked={draft.candidate.retryPermanent}
                      onChange={(v) => policy('retryPermanent', v)}
                    />
                    <Toggle
                      label="Retry uncertain writes"
                      description="Retry without a supported idempotency key; this can duplicate a write"
                      checked={draft.candidate.retryAmbiguous}
                      onChange={(v) => policy('retryAmbiguous', v)}
                    />
                  </details>
                  <p className="run-note">
                    {dirty
                      ? 'Settings changed. Compare to update results.'
                      : 'The same settings reproduce the same results.'}
                  </p>
                </details>
                <p className="settings-snapshot">
                  {Math.round(draft.faultRate * 100)}% faults ·{' '}
                  {draft.candidate.maxAttempts} attempts ·{' '}
                  {draft.candidate.backoffMs} ms backoff ·{' '}
                  {draft.candidate.budgetMs / 1000}s budget
                </p>
              </section>
              <div className="results-column">
                <div className="results-header">
                  <div>
                    <span className="eyebrow">Simulation results</span>
                    <h2>{getScenario(result.experiment.scenarioId).name}</h2>
                  </div>
                  <span className={`result-status ${dirty ? 'pending' : ''}`}>
                    <span />
                    {dirty
                      ? 'Settings not applied'
                      : `${result.experiment.trials} trials per policy`}
                    <b>Seed {result.experiment.seed}</b>
                  </span>
                </div>
                <section
                  className="comparison-panel"
                  aria-label="Policy comparison"
                >
                  <Table
                    tabIndex={0}
                    aria-label="Results for all simulated trials"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Measure</TableHead>
                        <TableHead>
                          Blind retry<small>Baseline</small>
                        </TableHead>
                        <TableHead className="candidate-column">
                          Your policy
                          <small>{result.candidate.policy.name}</small>
                        </TableHead>
                        <TableHead>
                          Difference<small>Your policy − baseline</small>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="comparison-safe">
                        <TableCell>
                          <strong>Safe completion</strong>
                          <small>
                            Finished, with no duplicate writes
                            <br />
                            or accepted malformed outputs
                          </small>
                        </TableCell>
                        <TableCell>
                          {percent(
                            result.baseline.safeCompletions,
                            result.experiment.trials,
                          )}
                        </TableCell>
                        <TableCell className="candidate-column">
                          <strong className="candidate-value">
                            {percent(
                              result.candidate.safeCompletions,
                              result.experiment.trials,
                            )}
                          </strong>
                        </TableCell>
                        <TableCell>
                          <strong>
                            {improvement > 0 ? '+' : ''}
                            {improvement.toFixed(1)} pp
                          </strong>
                          <small>Percentage points</small>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <strong>Duplicate writes</strong>
                          <small>
                            Extra committed effects, including
                            <br />
                            those in stopped workflows
                          </small>
                        </TableCell>
                        <TableCell>{result.baseline.duplicateWrites}</TableCell>
                        <TableCell className="candidate-column">
                          {result.candidate.duplicateWrites}
                        </TableCell>
                        <TableCell>
                          {result.candidate.duplicateWrites -
                            result.baseline.duplicateWrites >
                          0
                            ? '+'
                            : ''}
                          {result.candidate.duplicateWrites -
                            result.baseline.duplicateWrites}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <strong>p95 simulated duration</strong>
                          <small>
                            95% of workflows finish or stop
                            <br />
                            within this time
                          </small>
                        </TableCell>
                        <TableCell>{seconds(result.baseline.p95Ms)}</TableCell>
                        <TableCell className="candidate-column">
                          {seconds(result.candidate.p95Ms)}
                        </TableCell>
                        <TableCell>
                          {result.candidate.p95Ms - result.baseline.p95Ms > 0
                            ? '+'
                            : ''}
                          {seconds(
                            result.candidate.p95Ms - result.baseline.p95Ms,
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>
                          <strong>Tool calls</strong>
                          <small>
                            First calls and retries across all trials
                          </small>
                        </TableCell>
                        <TableCell>
                          {result.baseline.attempts.toLocaleString()}
                        </TableCell>
                        <TableCell className="candidate-column">
                          {result.candidate.attempts.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {result.candidate.attempts -
                            result.baseline.attempts >
                          0
                            ? '+'
                            : ''}
                          {(
                            result.candidate.attempts - result.baseline.attempts
                          ).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <details className="metrics-glossary">
                    <summary>How to read these measures</summary>
                    <dl>
                      <dt>Safe completion</dt>
                      <dd>
                        A finished workflow with no duplicate writes or accepted
                        malformed outputs.
                      </dd>
                      <dt>Duplicate writes</dt>
                      <dd>
                        Extra committed effects, including those in workflows
                        that later stopped.
                      </dd>
                      <dt>p95 simulated duration</dt>
                      <dd>
                        95% of workflows finish or stop within this time. A
                        shorter time can reflect earlier failure.
                      </dd>
                      <dt>Tool calls</dt>
                      <dd>
                        First calls and retries across all trials. Differences
                        are your policy minus the baseline; pp means percentage
                        points.
                      </dd>
                    </dl>
                  </details>
                  <p className="comparison-note">
                    Blind retry uses 3 attempts and 100 ms initial backoff,
                    without output validation or idempotency.{' '}
                    <button onClick={() => setTab('guide')}>
                      See the full policy
                    </button>
                  </p>
                </section>
                <section className="timeline-panel panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Compare a single trial</h2>
                      <p>
                        The same workflow under both policies. Select a call for
                        details.
                      </p>
                    </div>
                    <div className="trial-picker">
                      <button
                        aria-label="Previous trial"
                        disabled={trial === 0}
                        onClick={() => {
                          setTrial((t) => t - 1);
                          setSelection(null);
                        }}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        <label
                          className="visually-hidden"
                          htmlFor="trial-number"
                        >
                          Inspect trial
                        </label>
                        <input
                          id="trial-number"
                          type="number"
                          min="1"
                          max={result.experiment.trials}
                          value={trial + 1}
                          onChange={(e) => {
                            const n = e.target.valueAsNumber;
                            if (
                              Number.isInteger(n) &&
                              n >= 1 &&
                              n <= result.experiment.trials
                            ) {
                              setTrial(n - 1);
                              setSelection(null);
                            }
                          }}
                        />
                        <span>/ {result.experiment.trials}</span>
                      </span>
                      <button
                        aria-label="Next trial"
                        disabled={trial === result.experiment.trials - 1}
                        onClick={() => {
                          setTrial((t) => t + 1);
                          setSelection(null);
                        }}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="selection-note">
                    The initial example selects a trial where your policy avoids
                    a duplicate write, then an improved completion. Browse any
                    trial above; totals include every trial.
                  </p>
                  <div className="call-picker">
                    <span id="call-picker-label">Inspect a call</span>
                    <Select
                      value={
                        selection
                          ? `${selection.policy === 'Blind retry' ? 'baseline' : 'candidate'}:${selection.event.id}`
                          : null
                      }
                      onValueChange={(value) => {
                        const entries = [
                          ...baseline.events.map((event) => ({
                            value: `baseline:${event.id}`,
                            policy: 'Blind retry',
                            event,
                          })),
                          ...candidate.events.map((event) => ({
                            value: `candidate:${event.id}`,
                            policy: result.candidate.policy.name,
                            event,
                          })),
                        ];
                        const picked = entries.find(
                          (entry) => entry.value === value,
                        );
                        if (picked)
                          setSelection({
                            policy: picked.policy,
                            event: picked.event,
                          });
                      }}
                    >
                      <SelectTrigger aria-labelledby="call-picker-label">
                        <SelectValue placeholder="Choose a tool call" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          {
                            run: baseline,
                            key: 'baseline',
                            label: 'Blind retry',
                          },
                          {
                            run: candidate,
                            key: 'candidate',
                            label: result.candidate.policy.name,
                          },
                        ].flatMap(({ run, key, label }) =>
                          run.events.map((event) => (
                            <SelectItem
                              key={`${key}:${event.id}`}
                              value={`${key}:${event.id}`}
                            >
                              {label} · {event.tool} · attempt {event.attempt}
                            </SelectItem>
                          )),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Waterfall
                    run={baseline}
                    label="Blind retry"
                    maxMs={maxMs}
                    onSelect={(event) =>
                      setSelection({ policy: 'Blind retry', event })
                    }
                    selected={
                      selection
                        ? `${selection.policy}:${selection.event.id}`
                        : ''
                    }
                  />
                  <Waterfall
                    run={candidate}
                    label={result.candidate.policy.name}
                    maxMs={maxMs}
                    guarded
                    onSelect={(event) =>
                      setSelection({
                        policy: result.candidate.policy.name,
                        event,
                      })
                    }
                    selected={
                      selection
                        ? `${selection.policy}:${selection.event.id}`
                        : ''
                    }
                  />
                  {selection ? (
                    <div className="event-detail">
                      <div>
                        <Braces size={16} />
                        <strong>{selection.event.tool}</strong>
                        <FaultTag status={selection.event.status} />
                        <button
                          className="icon-button"
                          aria-label="Close event details"
                          onClick={() => setSelection(null)}
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <p>{selection.event.detail}</p>
                      <code>
                        attempt {selection.event.attempt} ·{' '}
                        {selection.event.durationMs} ms · backoff{' '}
                        {selection.event.waitMs} ms · {selection.policy}
                      </code>
                    </div>
                  ) : (
                    <div className="timeline-legend">
                      <span>
                        <i className="green" />
                        Valid response
                      </span>
                      <span>
                        <i className="orange" />
                        Rate limited
                      </span>
                      <span>
                        <i className="red" />
                        Fault
                      </span>
                      <span>
                        <i className="dashed" />
                        Backoff
                      </span>
                      <small>Simulated time · no tool calls executed</small>
                    </div>
                  )}
                </section>
                <div className="bottom-grid">
                  <section className="panel outcome-panel">
                    <div className="panel-heading">
                      <h2>Outcomes across all trials</h2>
                      <span className="tiny-tag">
                        {result.experiment.trials} per policy
                      </span>
                    </div>
                    <Outcome summary={result.baseline} />
                    <Outcome summary={result.candidate} />
                    <p className="footnote">
                      Safe = completed, with no duplicate writes or accepted
                      malformed output in this model.
                    </p>
                  </section>
                  <section className="verdict-panel">
                    <div className="eyebrow">Reading these results</div>
                    <h3>
                      {result.candidate.safeCompletions} safe.{' '}
                      {result.candidate.completions -
                        result.candidate.safeCompletions >
                      0
                        ? `${result.candidate.completions - result.candidate.safeCompletions} unsafe. `
                        : ''}
                      {result.experiment.trials - result.candidate.completions}{' '}
                      stopped.
                    </h3>
                    <p>
                      Your policy finished {result.candidate.completions} of{' '}
                      {result.experiment.trials} workflows, including{' '}
                      {result.candidate.completions -
                        result.candidate.safeCompletions}{' '}
                      unsafe completions. Blind retry finished{' '}
                      {result.baseline.completions}, including{' '}
                      {result.baseline.completions -
                        result.baseline.safeCompletions}{' '}
                      unsafe completions.
                    </p>
                    <p>
                      Recovery used {result.candidate.attempts.toLocaleString()}{' '}
                      calls, compared with{' '}
                      {result.baseline.attempts.toLocaleString()} for blind
                      retry. Duration includes retries and waiting, even for
                      stopped workflows.
                    </p>
                    <button onClick={() => setTab('guide')}>
                      Read the assumptions <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
                <div className="result-footer">
                  <span>
                    <LockKeyhole size={13} />
                    Calculated in this browser · engine {result.engineVersion}
                  </span>
                  <button
                    onClick={() =>
                      download('rehearsal-experiment.json', result.experiment)
                    }
                  >
                    <ArrowDownToLine size={14} />
                    Export settings
                  </button>
                  <button
                    onClick={() =>
                      download(
                        'rehearsal-evidence.json',
                        evidenceBundle(result, trial),
                      )
                    }
                  >
                    <ArrowDownToLine size={14} />
                    Export results
                  </button>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="traces">
            <section className="page-heading">
              <div>
                <div className="eyebrow">Recorded tool calls</div>
                <h1>Trace inspector</h1>
                <p>
                  Review call timing, failures, and write outcomes from a
                  Rehearsal JSON trace. Files are processed in this tab and are
                  never uploaded.
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="outline-button"
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} /> Import JSON
                </button>
                <button
                  className="outline-button"
                  onClick={() => void loadExample()}
                  disabled={loadingExample}
                >
                  <Terminal size={16} />
                  {loadingExample ? 'Loading example…' : 'Load example trace'}
                </button>
              </div>
            </section>
            {!trace ? (
              <div
                className="import-panel panel"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void importFile(e.dataTransfer.files[0]);
                }}
              >
                <div className="import-icon">
                  <Upload size={30} />
                </div>
                <h2>Open a tool-call trace</h2>
                <p>
                  Drop a JSON file exported by the Python SDK, or choose a file
                  below. Up to 2 MB and 5,000 events. The checkout example is
                  ready to explore.
                </p>
                <button
                  className="run-button"
                  onClick={() => input.current?.click()}
                >
                  Choose a trace file
                  <ArrowRight size={17} />
                </button>
                <button
                  className="text-button"
                  onClick={() => void loadExample()}
                  disabled={loadingExample}
                >
                  {loadingExample
                    ? 'Loading example…'
                    : 'Explore the example trace'}
                </button>
                <code>python3 examples/checkout.py</code>
              </div>
            ) : (
              <>
                <div className="trace-title">
                  <div>
                    <span className="eyebrow">
                      {trace.source === 'python-sdk'
                        ? 'Python SDK trace'
                        : 'Manual trace'}
                    </span>
                    <h2>{trace.name}</h2>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => {
                      ++loadGeneration.current;
                      setLoadingExample(false);
                      setTrace(null);
                      setNotice('Trace cleared from this view.');
                    }}
                  >
                    Clear trace
                    <X size={16} />
                  </button>
                </div>
                <div className="metric-grid trace-metrics">
                  <Metric
                    label="Recorded calls"
                    value={String(trace.events.length)}
                    sub={`${new Set(trace.events.map((e) => e.tool)).size} distinct tools`}
                    icon={<Workflow size={17} />}
                  />
                  <Metric
                    label="Calls with errors or faults"
                    value={String(
                      trace.events.filter(
                        (e) => e.status !== 'ok' || e.fault !== 'none',
                      ).length,
                    )}
                    sub="Errors, cancellations, and recorded faults"
                    icon={<TriangleAlert size={17} />}
                  />
                  <Metric
                    label="Sum of call durations"
                    value={traceTime(
                      trace.events.reduce((n, e) => n + e.durationMs, 0),
                    )}
                    sub="Concurrent calls may overlap"
                    icon={<Clock3 size={17} />}
                  />
                </div>
                <div className="finding-grid">
                  {findings.map((f, i) => (
                    <div className={`finding ${f.severity}`} key={i}>
                      <TriangleAlert size={19} />
                      <div>
                        <h3>{f.title}</h3>
                        <p>{f.detail}</p>
                        <span>
                          {f.eventIds.length ? (
                            <button
                              className="finding-link"
                              onClick={() => {
                                setRelatedIds(f.eventIds);
                                setTracePage(0);
                              }}
                            >
                              {f.eventIds.length} related events →
                            </button>
                          ) : (
                            'Metadata heuristics only'
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <section className="panel trace-table">
                  <div className="panel-heading">
                    <h2>Recorded tool calls</h2>
                    {relatedIds && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setRelatedIds(null);
                          setTracePage(0);
                        }}
                      >
                        Clear event filter <X size={12} />
                      </button>
                    )}
                    <span className="tiny-tag">Call metadata</span>
                  </div>
                  <Table tabIndex={0} aria-label="Scrollable data table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool / event</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status / fault</TableHead>
                        <TableHead>Side effect</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleEvents
                        .slice(tracePage * 50, (tracePage + 1) * 50)
                        .map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>
                              <strong>{e.tool}</strong>
                              <small>
                                {e.id} · attempt {e.attempt}
                              </small>
                            </TableCell>
                            <TableCell>{e.kind}</TableCell>
                            <TableCell>{traceTime(e.startMs)}</TableCell>
                            <TableCell>{traceTime(e.durationMs)}</TableCell>
                            <TableCell>
                              <FaultTag status={e.status} />
                              <small className="fault-description">
                                {e.fault !== 'none'
                                  ? e.fault.replaceAll('_', ' ')
                                  : (e.errorType ?? '—')}
                              </small>
                            </TableCell>
                            <TableCell>{e.effect}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  <div className="table-pagination">
                    <button
                      disabled={tracePage === 0}
                      onClick={() => setTracePage((p) => p - 1)}
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </button>
                    <span>
                      Page {tracePage + 1} of{' '}
                      {Math.ceil(visibleEvents.length / 50)}
                    </span>
                    <button
                      disabled={(tracePage + 1) * 50 >= visibleEvents.length}
                      onClick={() => setTracePage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </section>
                <p className="footnote">
                  {trace.source === 'python-sdk' && (
                    <>
                      The SDK records each wrapper invocation as attempt 1; it
                      does not infer which calls are retries of the same
                      operation.{' '}
                    </>
                  )}
                  Observed metadata is evidence about calls, not proof of task
                  correctness. Importing a trace does not run a policy
                  simulation or call an LLM.
                </p>
              </>
            )}
          </TabsContent>
          <TabsContent value="guide">
            <FieldGuide />
          </TabsContent>
          <footer className="page-footer">
            <span>
              Agent Rehearsal <span aria-hidden="true">/</span> Open source
              under MIT
            </span>
            <a href={REPO} target="_blank" rel="noreferrer">
              Source & documentation <ArrowRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </Tabs>
  );
}
