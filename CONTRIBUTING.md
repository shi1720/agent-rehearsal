# Contributing

A good contribution makes a specific failure reproducible and the resulting claim easier to inspect.

1. Fork and clone the repository. Use Node 22.13+ and Python 3.9+.
2. Run `npm ci`, `npm run check`, and `npm run test:golden`.
3. Add a small behavioral regression for the change. Include the failing seed, policy, trace, or sandbox behavior.
4. Run affected tests and browser tests when interactions change. `npm run build` must pass.
5. Explain the observed bug, resulting behavior, and validation in the pull request.

## Scenarios

Add a scenario in `lib/rehearsal/scenarios.ts` with stable unique step IDs, read/write kinds, integer latency/cost, a supported fault class, and an explicit idempotency capability. Add a happy-path control, a failure case, and at least one test that rejects a plausible unsafe recovery policy. Update the supported scenario enum in the experiment schema. Changing fault semantics or random sampling requires a version decision and an explicit golden-fixture review.

## SDK

Keep runtime dependencies at zero unless a concrete requirement justifies a change. Do not capture function contents by default. Preserve cancellation and exception identity. Never infer that an outer write is safe to retry from a nested tool's exception. An integration example must use a sandbox or test double and disclose all side effects.

## UI

Use the installed accessible primitives for their corresponding controls. Keep displayed results tied to the configuration that actually produced them. Show errors without discarding the last valid experiment. Do not claim a simulated result is a measured LLM result. Verify desktop, mobile, keyboard interaction, and reduced motion.

## Formatting and review

`npm run format` uses Oxfmt. `npm run lint` checks first-party source; generated/vendor primitives remain upstream. Python follows readable standard-library code and unittest. Do not add synthetic stars, badges with invented passing results, fabricated users, or benchmark claims without reproducible evidence.

The repository includes a Sites demo identifier. Do not publish to that project or change its audience from a fork. Use your own deployment configuration as described in `docs/self-hosting.md`.
