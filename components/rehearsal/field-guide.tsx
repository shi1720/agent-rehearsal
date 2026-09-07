'use client';
import {
  ArrowRight,
  GitFork as Github,
  Code2,
  Workflow,
  Braces,
  Activity,
  FlaskConical,
  GitBranch,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
const REPO = 'https://github.com/shi1720/agent-rehearsal';
export function FieldGuide() {
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            SMALL SDK. DELIBERATE SEMANTICS.
          </div>
          <h1>
            Make failure <em>reproducible.</em>
          </h1>
          <p>
            A practical toolkit for the space between “the tool returned” and
            “the task worked.”
          </p>
        </div>
        <a
          className="outline-button"
          href={`${REPO}/tree/main/docs`}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          Read the docs
        </a>
      </section>
      <div className="guide-grid">
        <section className="panel guide-card">
          <span className="eyebrow">01 / INSTRUMENT</span>
          <h2>Your tools. A few extra lines.</h2>
          <p>
            The Python SDK records timing, fault provenance, and coarse error
            classes. Arguments, results, and exception messages are never
            recorded.
          </p>
          <pre>
            <code>{`from rehearsal import Recorder, FaultPlan\n\nrecorder = Recorder("checkout rehearsal")\n\n@recorder.tool(kind="write", faults=FaultPlan(\n    {1: "timeout_after_write"}\n))\ndef charge():\n    return sandbox_payment.charge()\n\n# Run against a test double or sandbox.\ntry:\n    charge()\nexcept TimeoutError:\n    pass  # Verify before retrying a write.\n\nrecorder.export("trace.json")`}</code>
          </pre>
          <a href={`${REPO}/tree/main/sdk`} target="_blank" rel="noreferrer">
            Explore the zero-dependency SDK
            <ArrowRight size={16} />
          </a>
        </section>
        <section className="panel guide-card">
          <span className="eyebrow">02 / UNDERSTAND</span>
          <h2>What the lab actually measures.</h2>
          <dl>
            <dt>Paired, deterministic experiments</dt>
            <dd>
              Both policies see faults keyed by seed, trial, tool, and attempt.
              Extra retries never shift another tool’s random sequence.
            </dd>
            <dt>Meaningful success criteria</dt>
            <dd>
              Safe completion requires a finished workflow, no duplicate
              effects, and no accepted malformed output. Stopping can be the
              right decision.
            </dd>
            <dt>A bounded model, honestly labeled</dt>
            <dd>
              The lab simulates a fixed sequence of tools, not an LLM’s
              reasoning. Fault probability applies independently to each
              eligible attempt, except persistent authorization failures and
              cooldowns.
            </dd>
            <dt>Known costs and deadlines</dt>
            <dd>
              Every attempted call has a configured latency and illustrative
              cost. Backoff consumes the time budget. Timeout events use a 1,500
              ms virtual timeout by default.
            </dd>
          </dl>
        </section>
      </div>
      <section className="panel architecture-panel">
        <div className="panel-heading">
          <h2>
            <Workflow size={18} />
            Two paths. One failure vocabulary.
          </h2>
          <span className="tiny-tag">ARCHITECTURE</span>
        </div>
        <div className="architecture-flow">
          <div>
            <Code2 />
            <strong>Python tools</strong>
            <span>Sync + async wrappers</span>
          </div>
          <ArrowRight />
          <div>
            <Braces />
            <strong>Versioned trace</strong>
            <span>Metadata-only JSON</span>
          </div>
          <ArrowRight />
          <div>
            <Activity />
            <strong>Local inspector</strong>
            <span>Transparent heuristics</span>
          </div>
        </div>
        <div className="architecture-flow">
          <div>
            <FlaskConical />
            <strong>Experiment config</strong>
            <span>Scenario + seed + policy</span>
          </div>
          <ArrowRight />
          <div>
            <GitBranch />
            <strong>Paired simulator</strong>
            <span>Shared fault schedule</span>
          </div>
          <ArrowRight />
          <div>
            <ShieldCheck />
            <strong>Evidence bundle</strong>
            <span>Metrics + event timelines</span>
          </div>
        </div>
        <p className="footnote">
          The two paths are separate: a real trace is inspected, not converted
          into a claim about what an LLM would have done.
        </p>
      </section>
      <section className="panel policy-table">
        <div className="panel-heading">
          <h2>Compare the default policies</h2>
          <span className="tiny-tag">INSPECTABLE BY DESIGN</span>
        </div>
        <Table tabIndex={0} aria-label="Scrollable data table">
          <TableHeader>
            <TableRow>
              <TableHead>Behavior</TableHead>
              <TableHead>Blind retry</TableHead>
              <TableHead>Guarded retry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ['Maximum attempts', '3', '3'],
              [
                'Backoff',
                '100 ms exponential + jitter',
                '600 ms exponential + jitter',
              ],
              ['Rate limits', 'Ignores Retry-After', 'Honors Retry-After'],
              ['Malformed output', 'Accepts as success', 'Rejects and retries'],
              ['Permanent error', 'Retries', 'Stops for escalation'],
              [
                'Ambiguous write',
                'Retries regardless',
                'Idempotency contract or stop',
              ],
              ['Total time budget', '15 seconds', '15 seconds'],
            ].map((row) => (
              <TableRow key={row[0]}>
                {row.map((v, i) => (
                  <TableCell key={i}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div className="guide-note">
        <CircleHelp size={20} />
        <p>
          Production reliability needs representative workloads and measured
          tool behavior. Rehearsal makes assumptions visible; it does not
          certify an agent as safe.{' '}
          <a
            href={`${REPO}/blob/main/docs/model.md`}
            target="_blank"
            rel="noreferrer"
          >
            Read the model and limitations.
          </a>
        </p>
      </div>
    </>
  );
}
