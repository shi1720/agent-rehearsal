'use client';
import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { SimEvent, Summary, Trial } from '@/lib/rehearsal/types';
const seconds = (n: number) => `${(n / 1000).toFixed(2)}s`;
export function FaultTag({ status }: { status: string }) {
  const success = status === 'ok';
  return (
    <span
      className={`status-tag ${success ? 'ok' : status === 'rate_limit' ? 'amber' : 'bad'}`}
    >
      {success ? <Check size={12} /> : <span className="status-dot" />}
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = label.toLowerCase().replaceAll(' ', '-');
  return (
    <div className="toggle-row">
      <div>
        <label id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
        <span>{description}</span>
      </div>
      <Switch
        id={id}
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}
export function Metric({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  );
}
export function Waterfall({
  run,
  label,
  maxMs,
  onSelect,
  selected,
  guarded,
}: {
  run: Trial;
  label: string;
  maxMs: number;
  onSelect: (e: SimEvent) => void;
  selected: string;
  guarded?: boolean;
}) {
  const groups = Array.from(new Set(run.events.map((e) => e.stepId)));
  return (
    <div className={`waterfall ${guarded ? 'guarded' : ''}`}>
      <div className="waterfall-label">
        <span className="policy-dot" />
        {label}
        <span
          className={`run-state ${run.safe ? 'success' : run.completed ? 'unsafe' : 'stopped'}`}
        >
          {run.safe
            ? 'Safe completion'
            : run.completed
              ? 'Unsafe completion'
              : 'Stopped'}
        </span>
        <small>{seconds(run.durationMs)}</small>
      </div>
      <div className="time-axis">
        <span>Tool call</span>
        <div>
          <span>0s</span>
          <span>{seconds(maxMs / 2)}</span>
          <span>{seconds(maxMs)}</span>
        </div>
      </div>
      {groups.map((id) => (
        <div className="waterfall-row" key={id}>
          <span className="tool-label">
            {run.events.find((e) => e.stepId === id)?.tool}
          </span>
          <div className="track">
            {run.events
              .filter((e) => e.stepId === id)
              .map((e) => (
                <Fragment key={e.id}>
                  {e.waitMs > 0 && (
                    <span
                      className="wait-bar"
                      aria-hidden="true"
                      style={{
                        left: `${((e.startMs + e.durationMs) / maxMs) * 100}%`,
                        width: `${(e.waitMs / maxMs) * 100}%`,
                      }}
                    />
                  )}
                  <button
                    aria-label={`${label}: ${e.tool} attempt ${e.attempt}, ${e.status}`}
                    className={`event-bar ${e.status === 'ok' ? 'bar-ok' : e.status === 'rate_limit' ? 'bar-warn' : 'bar-error'} ${selected === `${label}:${e.id}` ? 'selected' : ''}`}
                    style={{
                      left: `${(e.startMs / maxMs) * 100}%`,
                      width: `${Math.max((e.durationMs / maxMs) * 100, 1.4)}%`,
                    }}
                    title={`${e.tool} · attempt ${e.attempt} · ${e.status}`}
                    onClick={() => onSelect(e)}
                  >
                    <span>{e.attempt}</span>
                  </button>
                </Fragment>
              ))}
          </div>
        </div>
      ))}
      <p className="waterfall-foot">
        {run.stopReason}
        {run.duplicateWrites > 0 && (
          <b>
            {' '}
            · {run.duplicateWrites} duplicate{' '}
            {run.duplicateWrites === 1 ? 'write' : 'writes'}
          </b>
        )}
        {run.invalidOutputs > 0 && <b> · invalid output accepted</b>}
      </p>
    </div>
  );
}
export function Outcome({ summary }: { summary: Summary }) {
  const safe = summary.safeCompletions,
    unsafe = summary.completions - safe,
    stopped = summary.trials - summary.completions;
  return (
    <div className="outcome">
      <div>
        <strong>{summary.policy.name}</strong>
        <span>
          {safe} / {summary.trials} safe
        </span>
      </div>
      <figure
        className="outcome-track"
        aria-label={`${safe} safe, ${unsafe} unsafe, ${stopped} stopped`}
      >
        <span
          className="safe"
          style={{ width: `${(safe / summary.trials) * 100}%` }}
        />
        <span
          className="unsafe"
          style={{ width: `${(unsafe / summary.trials) * 100}%` }}
        />
        <span
          className="stopped"
          style={{ width: `${(stopped / summary.trials) * 100}%` }}
        />
      </figure>
      <div className="outcome-legend">
        <span>
          <i className="safe" />
          {safe} safe
        </span>
        <span>
          <i className="unsafe" />
          {unsafe} unsafe
        </span>
        <span>
          <i className="stopped" />
          {stopped} stopped
        </span>
      </div>
    </div>
  );
}
