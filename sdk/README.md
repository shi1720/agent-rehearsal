# Agent Rehearsal Python SDK

Small, explicit wrappers for recording tool calls and testing recovery. Python 3.9+, **zero runtime dependencies**. The package is installable from this repository; no PyPI publication is implied.

## Install

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ./sdk
```

The last command assumes you are in the repository root. From another project:

```bash
python -m pip install 'git+https://github.com/shi1720/agent-rehearsal.git@v1.0.0#subdirectory=sdk'
```

## Record without altering behavior

```python
from rehearsal import Recorder

recorder = Recorder("support workflow")

@recorder.tool(name="customers.lookup", kind="read")
def lookup(customer_id):
    return client.lookup(customer_id)

@recorder.tool(name="tickets.create", kind="write")
async def create_ticket(fields):
    return await async_client.create_ticket(fields)
```

Invoke the wrapped functions normally, await async tools, then `recorder.export("trace.json")`. Open that file in the [local trace inspector](https://agent-rehearsal.web.app).

Recording captures the invocation name, read/write kind, relative start time, duration, status, fault class, coarse error class, and effect state. It does **not** capture arguments, results, headers, tokens, exception messages, or custom exception class names. This is data minimization, not a universal secret scanner: keep secrets out of names you supply.

Async functions and async callable instances are supported. Generator functions and lazy awaitables returned by sync functions are rejected because recording their construction is not recording their execution. Exceptions, including cancellation, are re-raised.

## Inject a known failure

```python
from rehearsal import FaultPlan, Recorder, ToolTimeout

recorder = Recorder("payment sandbox")

@recorder.tool(kind="write", faults=FaultPlan({1: "timeout_after_write"}))
def charge():
    return payment_sandbox.charge()

try:
    charge()
except ToolTimeout:
    pass  # Verify the outcome. The sandbox was called before the error.

recorder.export("trace.json")
```

Fault scripts address the **wrapper's invocation count**, starting at 1. They are not inferred logical retries. A fresh recorder/wrapper resets the count. Each wrapper name must be unique within a recorder. The exported observed `attempt` is always 1 because the recorder cannot infer logical operation identity. Grouping by name in the inspector is explicitly heuristic.

| Fault | Wrapped function executes? | Observable result |
|---|---|---|
| `none` | Yes | Original result or original exception |
| `rate_limit` | No | `RateLimited(retry_after_ms=1200)` |
| `timeout_before` | No | `ToolTimeout` |
| `permanent` | No | `PermanentFailure` |
| `timeout_after_write` | Yes | Result discarded; `ToolTimeout` raised afterward |
| `malformed` | Yes | Result discarded; `MalformedOutput` raised afterward |

`malformed` emulates an output-validator failure; it does not return arbitrary corrupted bytes. Post-call injection happens only if the wrapped function returns successfully. Failures propagated from an inner wrapper remain ordinary observed errors at the outer boundary, not falsely attributed local injections.

Seeded plans are also available: `FaultPlan(seed=1720, probability=0.25, fault="timeout_before")`. Explicit script entries override sampling. The sampler is stable v1; concurrent invocations get unique numbers, but scheduling determines which real invocation receives which number. For reproducible concurrent integration tests, provide deterministic orchestration.

## Opt-in retries

```python
from rehearsal import RetryPolicy, retry_call, retry_async

result = retry_call(
    lambda: lookup("customer-001"),
    policy=RetryPolicy(max_attempts=3, backoff_ms=100, budget_ms=5000),
    kind="read",
)
```

Retry helpers accept a zero-argument callable; use a closure or `functools.partial` to bind parameters. They handle a small explicit exception taxonomy: timeout, connection failure, Rehearsal rate limit, and malformed output. Permission errors, permanent faults, and unknown exceptions are not retried. Vendor HTTP clients need an explicit adapter that maps status/error behavior to this taxonomy; the SDK does not guess.

**Non-idempotent write errors are never automatically retried**, including nested rate limits and pre-call timeouts. The failing inner tool may have run after the outer operation already changed state.

Set `kind="write", idempotent=True` only when **your tool implements a stable operation key and deduplication**. Rehearsal does not insert keys or enforce exactly-once execution. The [checkout example](../examples/checkout.py) contains an inspectable in-memory contract.

Backoff is exponential with keyed jitter and honors `RateLimited.retry_after_ms` when it fits the remaining deadline. All elapsed time, including waits, consumes the budget. Attempts are capped. Policy fields are validated.

### Cancellation and deadlines

Sync functions cannot be forcibly interrupted safely. Configure a transport timeout in the underlying client. A sync function may return after the deadline; the helper then raises `BudgetExceeded`, but any side effects still happened.

Async deadlines cancel the child and wait for it to settle. Caller cancellation propagates; child tasks are drained. A coroutine that suppresses cancellation can delay completion beyond the deadline. Late returns are rejected. Cancellation is not rollback and cannot undo external side effects.

## Effects and trace limits

For observed tools, `committed` means a declared write function returned without error; it is **not independent verification of durable storage**. An executed write which raised or was cancelled is `unknown`. A read or a fault injected before execution is `none`.

The recorder accepts at most 5,000 events and refuses an additional call **before** execution. Use a new recorder for the next bounded run. Snapshot/export is refused while calls are in flight. Export takes a completed-event snapshot, writes a temporary file with restrictive permissions, flushes it, and replaces the explicitly requested destination atomically. Files must fit the browser's 2 MB import limit.

## Validate in CI

```bash
rehearsal trace.json
rehearsal trace.json --fail-on-errors
```

Exit codes: **0** valid/passed, **1** non-OK events when gated, **2** invalid input or read error. Expected injected faults count as non-OK; use behavior assertions for a scenario that intentionally injects failures, as the checkout example does.

See [trace schema](../schema/trace.schema.json) and [security model](../docs/security.md).
