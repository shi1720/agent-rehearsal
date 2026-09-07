# Changelog

## 1.1.0 — 2026-09-07

- Reworked the browser app around a side-by-side policy comparison, readable simulation assumptions, and responsive navigation.
- Replaced promotional result copy with exact safe, unsafe, and stopped counts; clarified duration and call metrics.
- Added editable timeout/error settings, direct trial selection, mobile call selection, and runnable SDK documentation with command copying.
- Shared links and exported reports preserve the inspected trial; aggregate results still include all trials.
- Fixed stale example loads overwriting imports, inaccurate backoff rendering, long-name overflow, inaccessible controls after resizing, and fault-count labeling.
- Expanded browser regression coverage, including keyboard navigation and accessibility scans of documentation.
- Simulator behavior, experiment/trace schema version 1, and Python SDK version 1.0.0 are unchanged.

## 1.0.0 — 2026-09-07

- Deterministic paired policy simulations for commerce, research, and incident response.
- Interactive attempt timelines, configurable failure probability, deadline/attempt limits, and outcome comparisons.
- Local metadata trace import, explicit failure details, related-event filters, and portable evidence bundles.
- Zero-dependency Python recording/fault-injection SDK with synchronous and asynchronous retry helpers.
- Executable duplicate-charge control and correction, shared sampler vectors, golden regression, and CI thresholds.
- Independent review fixes for hostile enum imports, cooldown renewal, malformed write retries, nested-write classification, fault provenance, callable detection, falsey exceptions, numeric bounds, and Python 3.9 cancellation races.
