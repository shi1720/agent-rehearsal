# Verification scope

This document describes what the repository checks. Passing tests establish behavior for the cases below, not universal production reliability.

## Engine and input boundary

`npm test` exercises keyed sampler cross-language vectors, full report repeatability, zero/all fault controls, duplicate-write controls, policy-order independence, persistent errors, unknown idempotency contracts, malformed writes, cooldown boundaries, budget conservation, limits, configuration isolation, and scenario invariants.

Parser tests cover actual Python exports, JSON errors, byte/event limits, duplicate IDs, unknown versions, primitive enum enforcement, non-finite/negative/string numbers, unexpected payload fields, HTML-as-data, and controlled metadata lengths.

`npm run test:golden` compares the default experiment's aggregate against a committed fixture. Updating it is a semantic review decision. `npm run rehearse -- --min-safe 0.8 --max-duplicates 0` verifies the default candidate meets explicit model-specific regression gates.

## Python SDK

`npm run test:python` runs standard-library unittest tests covering privacy, pre/post-call effects, falsey exceptions, nested provenance, immutable plans, concurrent recording and event limits, refusal of in-flight exports, atomic output permissions, schema bounds, Unicode names, generator/lazy callable rejection, fault taxonomy, sampler parity, conservative write retries, idempotency, deadline/backoff budgets, cancellation, async callable objects, and Python 3.9's cancellation race.

The checkout example asserts that the intentionally broken control reproduces two writes, while the corrected implementation creates one. This is executable code with assertions, not a report fixture standing in for a run.

CI tests Python 3.9, 3.11, and 3.13 and builds/installs the wheel in each job. The core is dependency-free; packaging uses modern pip/build/setuptools.

## Browser and accessibility

Playwright exercises desktop Chromium and mobile-emulated Chromium: initial results, attempt inspection, changed settings, scenario switching, validation errors, trace import and clearing, no upload on import, malformed input handling, configuration exports, shared experiment reproduction, navigation, and page overflow.

Axe checks WCAG A/AA rule sets for the simulator, loaded trace inspector, and documentation. This automated scan does not establish complete accessibility conformance. Manual screenshot review and keyboard checks complement it; a real assistive-technology audit remains outside this v1 verification.

## Build and dependencies

`npm run typecheck`, first-party `npm run lint`, `npm run build`, and `npm audit --audit-level=high` are required CI gates. Vendored generated components are typechecked and behavior-tested through the app, but excluded from first-party lint. Security advisories can change after a release; inspect the current CI rather than relying on a fixed badge claim.

## Performance

`npm run benchmark` warms the engine, runs 30 repetitions of 1,000 paired trials, and reports observed local median/p95 runtime with Node/platform/architecture metadata. These milliseconds measure the simulator itself; the UI's seconds are virtual workflow latency. Neither is measured performance of a production LLM agent.

A development measurement on Apple Silicon, Node 22.16.0, recorded roughly 4.2 ms median and 5.5 ms p95 for 1,000 paired trials. This is one local observation, not a service-level objective or cross-machine guarantee. Re-run the script on your environment.

## Independent review

See [review-log.md](./review-log.md). All reported release-blocking SDK and engine findings were reproduced and patched. Reviewing agents checked the fixes independently; this is not formal verification or an external security certification.

## Release validation (2026-09-07)

The original 1.0.0 release candidate passed 60 TypeScript tests, 31 Python tests, and 26 desktop/mobile browser checks. The same 26 browser checks also passed against the built Worker running in Wrangler's local production runtime. The wheel and source distribution built in a clean Python 3.9 virtual environment, installed successfully, and validated the example trace through the installed CLI. Production build, strict types, first-party lint, golden aggregate, regression thresholds, and the dependency audit all passed. Public GitHub CI remains the ongoing record for the released commit.


## Interface release — 1.1.0

The 1.1.0 browser release adds regressions for delayed requests, clearing pending imports, long metadata, advanced controls, resize recovery, keyboard navigation, selected-trial reports/shares, manual fault counting, scaled waits, mobile call selection, command copying, and clipboard/network failure recovery. The engine’s golden aggregate and Python SDK version remain unchanged.

Release validation passed **61 TypeScript tests, 31 Python tests, and 58 browser checks** (29 workflows across desktop and mobile Chromium). Strict types, first-party lint, golden aggregate, model-specific CLI gates, production Worker build, and the dependency audit also passed. The review findings and subjective design rubric are recorded in [review-log.md](./review-log.md).


The same 56 pre-publication browser checks also passed against the built Worker in Wrangler’s local production runtime. Separate Firefox and WebKit smoke checks passed simulation, mobile call selection, trace import, finding filters, documentation, and offline simulation, with no page errors. These are smoke checks, not the complete Chromium suite. The published GitHub workflow records the checks for each pushed commit.


During live validation, Cloudflare's hosting-layer challenge request triggered the original catch-all upload assertion. The test now excludes only same-origin `/cdn-cgi/challenge-platform/` requests, the documented [Cloudflare JavaScript Detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/) namespace, while still rejecting other non-GET requests during import. An additional desktop/mobile test imports and filters a trace with the network offline. Hosting-layer traffic is not a claim that the website is network-silent; the application does not upload imported traces.

The final public-site suite passed all 58 desktop/mobile checks, including offline trace import.
