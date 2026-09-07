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
  Copy,
  FlaskConical,
  GitBranch,
  GitFork as Github,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Upload,
  Workflow,
  X,
  Zap,
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
  const relatedSet = useMemo(() => relatedIds ? new Set(relatedIds) : null, [relatedIds]);
  const visibleEvents = trace?.events.filter(e => !relatedSet || relatedSet.has(e.id)) ?? [];
  const input = useRef<HTMLInputElement>(null);
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
    try {
      const params = new URLSearchParams(window.location.search);
      const config = params.get('experiment');
      if (config) {
        const parsed = parseExperiment(JSON.parse(config));
        const c = compare(parsed);
        // eslint-disable-next-line react/react-compiler -- browser-only URL hydration
        setDraft(parsed);
        setResult(c);
        setTrial(representativeTrial(c));
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
      setNotice(`${valid.trials} paired trials complete. Seed ${valid.seed}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run experiment.');
    } finally {
      setRunning(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error('File is too large. Maximum size is 2 MB.');
      const imported = parseFile(await file.text());
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
      setError(e instanceof Error ? e.message : 'Could not import this file.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  async function share() {
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('experiment', JSON.stringify(result.experiment));
      await navigator.clipboard.writeText(url.href);
      setNotice(
        'Experiment link copied. It contains configuration only, never imported trace data.',
      );
    } catch {
      download('rehearsal-experiment.json', result.experiment);
      setNotice(
        'Clipboard unavailable. Downloaded the shareable experiment instead.',
      );
    }
  }
  async function loadExample() {
    setError('');
    try {
      const r = await fetch('/example-trace.json');
      if (!r.ok) throw new Error('Example could not be loaded.');
      const parsed = parseFile(await r.text());
      if (parsed.kind !== 'trace')
        throw new Error('Example format is invalid.');
      setTrace(parsed.value);
      setTracePage(0);
      setRelatedIds(null);
      setTab('traces');
      setNotice('Loaded the committed Python SDK example trace.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load example.');
    }
  }
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(String(v))}
      className="app-shell"
      data-ready={hydrated}
      inert={!hydrated}
      aria-busy={!hydrated}
    >
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Agent Rehearsal home">
          <span className="brand-mark">
            <Workflow size={24} />
          </span>
          <span>
            rehearsal<span className="brand-period">.</span>
            <small>THE AGENT FAILURE LAB</small>
          </span>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <TabsList className="side-nav">
          <TabsTrigger value="lab">
            <FlaskConical size={18} />
            Chaos lab<span className="nav-key">01</span>
          </TabsTrigger>
          <TabsTrigger value="traces">
            <Activity size={18} />
            Trace inspector<span className="nav-key">02</span>
          </TabsTrigger>
          <TabsTrigger value="guide">
            <BookOpen size={18} />
            Field guide<span className="nav-key">03</span>
          </TabsTrigger>
        </TabsList>
        <div className="side-bottom">
          <div className="local-note">
            <LockKeyhole size={17} />
            <strong>Your traces stay yours.</strong>
            <p>
              Local analysis. No API keys.
              <br />
              No trace uploads.
            </p>
          </div>
          <a href={REPO} target="_blank" rel="noreferrer">
            <Github size={17} />
            Open source on GitHub
            <ArrowRight size={15} />
          </a>
          <span className="version">
            <span />
            ENGINE 1.0.0 <i>MIT LICENSE</i>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <span>
              {tab === 'lab'
                ? 'Chaos lab'
                : tab === 'traces'
                  ? 'Trace inspector'
                  : 'Field guide'}
            </span>
          </div>
          <div className="top-actions">
            <span className="local-badge">
              <span />
              BROWSER LOCAL
            </span>
            <button onClick={() => input.current?.click()}>
              <Upload size={15} />
              Import JSON
            </button>
          </div>
        </header>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Import trace or experiment"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <main id="main-content">
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
                <div className="eyebrow">
                  <span />
                  CONTROLLED CHAOS. BETTER AGENTS.
                </div>
                <h1>
                  Give your agent a <em>bad day.</em>
                </h1>
                <p>
                  Break the tools. Compare recovery policies. Find the failure
                  before your users do.
                </p>
              </div>
              <button
                className="outline-button share-button"
                onClick={() => void share()}
              >
                <GitBranch size={16} />
                Share experiment
              </button>
            </section>
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
                  <h2>
                    <Zap size={17} />
                    Fault controls
                  </h2>
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
                    <span>A quiet Tuesday</span>
                    <span>Everything is on fire</span>
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
                    <span id="trials-label">Paired trials</span>
                    <Select
                      value={String(draft.trials)}
                      onValueChange={(v) =>
                        setDraft((d) => ({ ...d, trials: Number(v) }))
                      }
                    >
                      <SelectTrigger aria-labelledby="trials-label">
                        <SelectValue />
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
                  <span>CANDIDATE POLICY</span>
                  <span className="tiny-tag">EDITABLE</span>
                </div>
                <div className="control">
                  <div className="label-line">
                    <span id="attempt-label">Maximum attempts</span>
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
                    <span>1 · fail fast</span>
                    <span>6 · keep trying</span>
                  </div>
                </div>
                <div className="control compact">
                  <div>
                    <label htmlFor="backoff">Backoff (ms)</label>
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
                  description="Reuse writes when tools support it"
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
                  description="Give throttled tools time to recover"
                  checked={draft.candidate.honorRetryAfter}
                  onChange={(v) => policy('honorRetryAfter', v)}
                />
                <button
                  className="run-button"
                  onClick={() => void run()}
                  disabled={running}
                >
                  <Play size={17} fill="currentColor" />
                  {running ? 'Running trials…' : 'Run rehearsal'}
                  <ArrowRight size={16} />
                </button>
                <details className="effective-policy">
                  <summary>Effective policy</summary>
                  <p>
                    Timeout: {draft.candidate.timeoutMs} ms.
                    <br />
                    Timeout and time budget apply to both policies.
                    <br />
                    Retry permanent errors:{' '}
                    {draft.candidate.retryPermanent ? 'yes' : 'no'}.<br />
                    Retry ambiguous writes without keys:{' '}
                    {draft.candidate.retryAmbiguous ? 'yes' : 'no'}.<br />
                    Change these advanced fields in an exported configuration.
                  </p>
                </details>
                <p className="run-note">
                  {dirty
                    ? 'Settings changed. Run to update results.'
                    : 'Same seed. Same failures. Reproducible.'}
                </p>
              </section>
              <div className="results-column">
                <div className="results-header">
                  <span className="eyebrow">
                    {getScenario(result.experiment.scenarioId).name}
                  </span>
                  <span className={`result-status ${dirty ? 'pending' : ''}`}>
                    <span />
                    {dirty ? 'PREVIOUS RUN' : 'REPRODUCIBLE'}
                    <b>SEED {result.experiment.seed}</b>
                  </span>
                </div>
                <div className="metric-grid">
                  <Metric
                    label="Safe completion"
                    value={percent(
                      result.candidate.safeCompletions,
                      result.experiment.trials,
                    )}
                    sub={`${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)} pp vs. blind retry`}
                    accent
                    icon={<ShieldCheck size={17} />}
                  />
                  <Metric
                    label="Duplicate writes"
                    value={String(result.candidate.duplicateWrites)}
                    sub={`${result.baseline.duplicateWrites} with blind retry`}
                    icon={<Copy size={17} />}
                  />
                  <Metric
                    label="p95 virtual latency"
                    value={seconds(result.candidate.p95Ms)}
                    sub={`${seconds(result.baseline.p95Ms)} with blind retry`}
                    icon={<Clock3 size={17} />}
                  />
                </div>
                <div className="attempt-summary">
                  <span>
                    <Workflow size={14} />
                    <strong>
                      {result.candidate.attempts.toLocaleString()}
                    </strong>{' '}
                    candidate calls
                  </span>
                  <span>
                    {result.baseline.attempts.toLocaleString()} with blind retry
                  </span>
                  <span>across {result.experiment.trials} workflows</span>
                </div>
                <section className="timeline-panel panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <Activity size={18} />
                        Anatomy of a failure
                      </h2>
                      <p>One paired trial. Click an attempt to inspect it.</p>
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
                        TRIAL <b>{String(trial + 1).padStart(3, '0')}</b>
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
                      <small>VIRTUAL TIME · NO REAL TOOL CALLS</small>
                    </div>
                  )}
                </section>
                <div className="bottom-grid">
                  <section className="panel outcome-panel">
                    <div className="panel-heading">
                      <h2>Finishing ≠ succeeding</h2>
                      <span className="tiny-tag">
                        {result.experiment.trials} TRIALS
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
                    <div className="eyebrow">
                      <Sparkles size={15} />
                      THE TAKEAWAY
                    </div>
                    <h3>
                      {result.baseline.duplicateWrites > 0 &&
                      result.candidate.duplicateWrites === 0
                        ? 'One order. One charge.'
                        : improvement > 0
                          ? 'A little patience pays off.'
                          : improvement < 0
                            ? 'More guardrails. Fewer finishes.'
                            : 'Recovery has tradeoffs.'}
                    </h3>
                    <p>
                      {result.baseline.duplicateWrites > 0 &&
                      result.candidate.duplicateWrites === 0
                        ? `Blind retry caused ${result.baseline.duplicateWrites} duplicate writes. Your candidate avoided them. An idempotency contract or a deliberate stop matters more than another retry.`
                        : `Your candidate completed ${result.candidate.safeCompletions} trials safely, versus ${result.baseline.safeCompletions} for blind retry. Inspect stopped runs: a safe escalation can be the correct outcome.`}
                    </p>
                    <button onClick={() => setTab('guide')}>
                      Understand the model
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
                <div className="result-footer">
                  <span>
                    <LockKeyhole size={13} />
                    Simulation, not an LLM benchmark. Tool costs are
                    illustrative.
                  </span>
                  <button
                    onClick={() =>
                      download('rehearsal-experiment.json', result.experiment)
                    }
                  >
                    <ArrowDownToLine size={14} />
                    Export config
                  </button>
                  <button
                    onClick={() =>
                      download(
                        'rehearsal-evidence.json',
                        evidenceBundle(result),
                      )
                    }
                  >
                    <ArrowDownToLine size={14} />
                    Evidence bundle
                  </button>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="traces">
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span />
                  REAL CALLS. INSPECTABLE EVIDENCE.
                </div>
                <h1>
                  Every call has a <em>story.</em>
                </h1>
                <p>
                  Inspect metadata from your own tools. Your file stays in this
                  browser tab.
                </p>
              </div>
              <button
                className="outline-button"
                onClick={() => void loadExample()}
              >
                <Terminal size={16} />
                Load SDK example
              </button>
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
                <h2>Bring your agent’s bad day.</h2>
                <p>
                  Drop a Rehearsal JSON trace here, or start with the
                  <br />
                  recorded checkout example. Up to 2 MB / 5,000 events.
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
                >
                  Explore the SDK example first
                </button>
                <code>python3 examples/checkout.py</code>
              </div>
            ) : (
              <>
                <div className="trace-title">
                  <div>
                    <span className="eyebrow">
                      {trace.source === 'python-sdk'
                        ? 'PYTHON SDK TRACE'
                        : 'MANUAL TRACE'}
                    </span>
                    <h2>{trace.name}</h2>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => {
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
                    label="Non-OK calls"
                    value={String(
                      trace.events.filter((e) => e.status !== 'ok').length,
                    )}
                    sub="Errors, cancellations, and injected faults"
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
                    <span className="tiny-tag">PAYLOADS OMITTED</span>
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
            <span>Built for the days the happy path takes off.</span>
            <a href={REPO} target="_blank" rel="noreferrer">
              Agent Rehearsal <ArrowRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </Tabs>
  );
}
