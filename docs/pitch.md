# Agent Rehearsal: the pitch

## One sentence

Agent Rehearsal helps developers reproduce agent tool failures, inspect recovery behavior, and prevent the same mistake from shipping twice.

## The problem

A tool error is not a complete account of what happened. A payment can commit before timing out. A revoked credential cannot be repaired by retrying. A malformed response can move a workflow forward while making its final answer wrong. Agent development often emphasizes the happy path; failure handling needs equally inspectable evidence.

## The product

The browser lab makes failure semantics tangible in a minute. A Python wrapper brings the same vocabulary to a developer's own tools. A portable trace and evidence bundle make the result reviewable. A CLI and behavioral regression turn the investigation into a repeatable gate.

The distinctive wedge is small and useful: a local-first developer workflow that requires no provider key, hosted trace store, or framework migration. It does not attempt to replace agent frameworks or established observability platforms.

## A two-minute demo

1. Open the checkout scenario. Point to **safe completion** and **duplicate writes** as separate outcomes.
2. Click the first failed payment attempt. It committed a write before losing its response.
3. Inspect the corresponding guarded attempt: the stable operation key avoids a second charge.
4. Set fault probability to zero and rerun. Both policies pass, demonstrating a real happy-path control.
5. Run `python3 examples/checkout.py`. The broken control charges twice; the correction charges once.
6. Import `trace.json`. Inspect the precise failure metadata locally.
7. Open `docs/architecture.md` and the regression tests to discuss boundaries and tradeoffs.

## Why it is relevant engineering evidence

- **Python:** decorators, asyncio lifecycle management, thread-safe bounded recording, atomic exports, installable packaging.
- **TypeScript:** strict input contracts, a deterministic state machine, paired policy comparison, bounded UI state.
- **Algorithms:** keyed randomness, explicit time/state transitions, nearest-rank quantiles, linear complexity analysis.
- **Debugging:** reproducible pre/post-write errors, nested-operation safety, asynchronous cancellation races.
- **Feature implementation:** useful import/export/share workflows with error handling and browser validation.
- **Refactoring and performance:** separation of pure models from side-effecting instrumentation, benchmarkable local engine.
- **Communication:** explicit guarantees, threat model, model assumptions, related work, review log, and executable evidence.

This project is evidence of Python/TypeScript engineering. It does not pretend to demonstrate Java or Rust expertise by adding superficial ports. RepoGauntlet provides complementary polyglot environment work.

## Portfolio blurb

Built Agent Rehearsal, an open-source chaos testing workbench for agent tool orchestration. Designed a deterministic paired simulator and zero-dependency Python instrumentation SDK, modeled ambiguous writes and idempotent recovery, and shipped local trace analysis with regression gates and documented semantics. The implementation includes adversarial review fixes, Python cancellation tests, and desktop/mobile browser checks.

## Honest scope

The default figures are simulations of a published model. There are no claimed production customers or measured improvements for named LLMs. The project is AI-assisted; the useful contribution is the explicit design, executable evidence, reviewed implementation, and documented limitations.
