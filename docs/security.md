# Security and privacy model

## Browser

The application runs fixed, committed simulation code. Imported JSON is never executed. Strict version/enum/bounds checks reject invalid numbers, unknown schemas, duplicate IDs, excessive events, and oversized files. Unknown payload fields are discarded. Text is rendered through React escaping, never `dangerouslySetInnerHTML`.

Imports are limited to 2 MB and 5,000 trace events. Comparisons are limited to 1,000 paired trials and six attempts per tool. Trace rendering is paginated. Imports stay in browser memory; the product has no trace-upload endpoint, localStorage retention, analytics SDK, provider API keys, or persistent account database. Loading the site and its sample trace still makes normal HTTP requests to the hosting service.

Experiment links contain configuration in their query string. This configuration is visible to the hosting server and anyone with the link. It contains no imported trace content. Do not invent secret-bearing fields in a shareable configuration.

## Python

The SDK is a testing/instrumentation library, **not a sandbox**. A wrapped function retains the process's full privileges. Post-call faults intentionally run the function before discarding its response. Run fault plans against disposable test doubles or supported service sandboxes.

Recording omits arguments, results, exception messages, and arbitrary custom exception class names. Caller-supplied trace and tool labels are exported and may still contain sensitive information. Coarse error types and names can reveal operational metadata; review before sharing.

`idempotent=True` is a caller declaration, not verification. Enabling it incorrectly can duplicate real-world side effects. Neither timeout nor cancellation proves an external write failed. Use operation verification and a durable idempotency contract where needed.

Sync code cannot be safely preempted by this wrapper. Async cancellation is cooperative; a function can suppress it. The helper waits for child cleanup and rejects late results, but cannot roll back or guarantee termination of arbitrary tools.

## Files and exports

SDK exports use mode 0600 temporary files and atomic replacement of the explicit destination. Existing destination content is replaced because that is what `export(path)` requests. No filesystem path is derived from trace content. The CLI reads one explicit file and never executes its contents.

## Supply chain

The web dependency lockfile is committed. The shipped dependencies were upgraded from the generated starter to address its audit advisories. CI runs `npm audit --audit-level=high`; that is an advisory check, not a proof of security. Vendored UI primitives retain their upstream code and are excluded from first-party lint to avoid modifying vendor source merely to satisfy project-specific lint rules. Browser behavior and accessibility are tested at the integration boundary.

## Reporting

Use GitHub's private vulnerability reporting for this repository when available. Do not include live credentials or private traces in public issues. Report the minimum reproduction with synthetic data, affected version, and the expected versus observed behavior. No response-time SLA is promised for this independent open-source project.


### Hosting-layer requests

The public demo is served through Sites and Cloudflare. Page delivery can include hosting-layer bot detection under `/cdn-cgi/challenge-platform/`, as described in [Cloudflare's JavaScript Detections documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/). The application itself has no trace-upload endpoint and imports work with the network offline. Local trace analysis does not mean that loading the hosted website produces no network traffic.
