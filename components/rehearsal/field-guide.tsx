'use client';
import { CodeExample } from './code-example';
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
          <div className="eyebrow">Getting started & model reference</div>
          <h1>Run your first test</h1>
          <p>
            Run the checkout example, inspect its trace, and learn what the
            simulator measures. The example needs Python 3.9 or later and makes
            no external API calls.
          </p>
        </div>
        <a
          className="outline-button"
          href={`${REPO}/tree/main/docs`}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          Full documentation
        </a>
      </section>
      <div className="guide-grid">
        <section className="panel guide-card">
          <span className="eyebrow">Start with a working example</span>
          <h2>Reproduce a duplicate charge</h2>
          <p>
            The example runs a payment function against an in-memory sandbox. It
            discards the first response after the charge succeeds, then checks
            both retry implementations.
          </p>
          <CodeExample name="checkout commands">{`git clone https://github.com/shi1720/agent-rehearsal.git
cd agent-rehearsal
python3 examples/checkout.py`}</CodeExample>
          <p>
            <strong>Expected result:</strong> blind retry creates two charges;
            using a stable operation key creates one. The script asserts both
            outcomes and saves <code>trace.json</code>.
          </p>
          <p className="install-note">
            Open Trace inspector and import trace.json to review the four
            recorded calls. To instrument your own code, install the SDK in a
            virtual environment:
          </p>
          <CodeExample name="SDK installation commands">{`python3 -m venv .venv
. .venv/bin/activate
python -m pip install ./sdk`}</CodeExample>
          <p className="install-note">
            Commands above use a macOS or Linux shell. In Windows Command
            Prompt, use <code>.venv\Scripts\activate.bat</code>. Tool arguments,
            results, and exception messages are omitted from SDK traces. Choose
            tool and trace names that contain no secrets.
          </p>
          <a href={`${REPO}/tree/main/sdk`} target="_blank" rel="noreferrer">
            Read the SDK usage and guarantees
            <ArrowRight size={16} />
          </a>
        </section>
        <section className="panel guide-card">
          <span className="eyebrow">Before interpreting the numbers</span>
          <h2>What the simulator measures.</h2>
          <dl>
            <dt>Two policies, matched trials</dt>
            <dd>
              Both policies see faults keyed by seed, trial, tool, and attempt.
              Extra retries never shift another tool’s random sequence.
            </dd>
            <dt>Safe completion in this model</dt>
            <dd>
              Safe completion requires a finished workflow, no duplicate
              effects, and no accepted malformed output. Stopping can be the
              right decision.
            </dd>
            <dt>Fixed workflows and known faults</dt>
            <dd>
              Each scenario models a fixed sequence of tools. It does not run an
              LLM or judge the quality of an answer. Fault probability applies
              independently to each eligible attempt, except persistent
              authorization failures and cooldowns.
            </dd>
            <dt>Simulated time and deadlines</dt>
            <dd>
              Calls and retry delays consume a shared time budget. The default
              call timeout is 1,500 ms. The p95 includes workflows that stopped;
              a shorter duration can reflect earlier failure. Call costs in
              exported reports are illustrative.
            </dd>
          </dl>
        </section>
      </div>
      <section className="panel architecture-panel">
        <div className="panel-heading">
          <h2>
            <Workflow size={18} />
            How the components fit together
          </h2>
          <span className="tiny-tag">System architecture</span>
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
          <span className="tiny-tag">Defaults · editable in the simulator</span>
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
              [
                'Malformed output',
                'Accepts as success',
                'Rejects; retries only when permitted',
              ],
              ['Permanent error', 'Retries', 'Stops for escalation'],
              [
                'Ambiguous write',
                'Retries regardless',
                'Idempotency contract or stop',
              ],
              ['Call timeout', '1.5 seconds', '1.5 seconds'],
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
          The baseline intentionally omits recovery safeguards so their effects
          are visible. It is a teaching control, not a comparison with another
          framework. Validate changes against representative workloads and
          measured tool behavior before applying them to a live agent.{' '}
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
