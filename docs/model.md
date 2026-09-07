# Model, assumptions, and tradeoffs

## What a result means

The lab measures a **fixed sequence of simulated tool operations**. It does not run an LLM, replan after failure, or estimate a provider's quality. A safe-completion percentage applies only to the selected scenario, policy, seed, and engine version.

A run is `completed` when all modeled steps produce an accepted acknowledgment. It is `safe` only when completed with zero duplicate writes and zero accepted malformed outputs. An incomplete run may be a correct escalation; the percentage alone is not a full quality measure. This definition is deliberately visible in the UI.

## Faults

| Type | Modeled behavior | Important assumption |
|---|---|---|
| Rate limit | Call returns failure and establishes a 1,200 ms cooldown | Attempts during an existing cooldown do not extend it |
| Timeout before call | Caller spends its virtual timeout, no modeled write occurs | The simulator knows the phase; real callers often cannot |
| Timeout after write | Write may commit, response is lost, caller spends timeout | Only declared idempotency prevents repeating the effect |
| Malformed output | Tool returns but output violates the modeled contract | Accepting it permits completion but makes the run unsafe |
| Permanent failure | Authorization failure persists for the step throughout the trial | Retrying cannot repair a revoked credential |

Fault probability applies per eligible attempt. A sampled permanent failure is fixed from the first-attempt key. Cooldowns temporarily override subsequent samples. Steps configured with `none` never fault.

A new independently sampled 429 after a cooldown expires may establish another cooldown. An attempt that starts during an existing cooldown and finishes afterward does not silently restart the timer; this boundary has a regression test.

## Retry policies

The baseline uses three attempts, 100 ms exponential backoff, and keyed jitter in `[0.75,1.25)`. It ignores Retry-After, accepts malformed responses, and retries permanent and ambiguous errors. The default candidate uses three attempts, 600 ms backoff, output validation, Retry-After, and idempotency where supported. It stops on permanent failures and ambiguous writes without a contract.

Backoff after attempt `a` is:

```text
round(backoffMs × 2^(a−1) × (0.75 + sample(jitter) × 0.5))
```

The candidate's timeout and total time budget apply to **both** policies for a comparable experiment. The default values are 1,500 ms and 15,000 ms. The budget includes modeled call durations and all backoffs; no partial call is started if its complete modeled duration cannot fit. Real network deadlines behave differently because a live call can begin without knowing when it will finish.

For SDK live tools, classification is more conservative than this phase-aware model: **no non-idempotent write is automatically retried**, even if a nested exception says “before call.” The outer write may already have performed work.

## Idempotency

In the simulator, supporting tools deduplicate repeated writes within the same logical step. Keys are stable for that step and trial, never regenerated on retry. This is a declared capability of the scenario, not magic inserted by the policy.

In real tools, the caller must implement a durable idempotency contract before enabling `idempotent=True`. The included in-memory sandbox demonstrates the concept, but it is not a production payment gateway. A successful function return is not independent evidence of durable storage.

## Statistics and example selection

All aggregate figures include every trial. p95 uses nearest-rank selection from whole-workflow virtual durations, including stopped and unsafe workflows. It is not p95 of successful calls alone. Costs are illustrative integer microdollars assigned by the scenario; they are not live vendor pricing or LLM token charges.

The initial timeline deliberately selects the first trial where the baseline duplicates a write and the candidate finishes safely. If none exists, it selects the first improvement in safe completion; otherwise trial zero. This is an **illustrative, selected case**, not an unbiased sample. Arrow controls and a trial-number input expose every trial. Shared links preserve the selected trial. The initial selection is disclosed beside the timeline.

The browser’s **Export results** action creates a bounded bundle with all aggregates, the currently inspected pair, and the configuration needed to reproduce all trials. Trial indices in JSON are zero-based; the interface displays one-based numbers. Calling `evidenceBundle(report)` without a trial index still chooses the initial illustrative pair. Importing a bundle validates its configuration and recomputes results, starting from the initial example rather than trusting embedded metrics or trace claims. The CLI's optional full report includes every trial and may exceed the browser import limit. It is intended for machine auditing; use the configuration or bounded bundle to reopen an experiment.

## Limits

No concurrency, stochastic LLM decisions, context-window behavior, provider failover, network packet simulation, long-term idempotency expiry, or distributed transaction protocol is modeled. The seeded sampler is designed for reproducibility, not cryptographic or statistical research guarantees. Real deployment decisions need representative workloads and measured fault distributions.

Read [AWS’s idempotency guidance](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) for production API contracts and [retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) for quota and retry-budget considerations. These sources inform the design; the implementation is an explicit bounded model.
