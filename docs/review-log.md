# Independent review and resulting changes

The implementation was reviewed by independent AI agents. This is an engineering review log, not a third-party security certification. Findings were reproduced and addressed with tests rather than accepted as prose alone.

| Review finding | Change | Regression evidence |
|---|---|---|
| String coercion admitted array-valued enums and crashed rendering | Require primitive enum strings before accepting a trace | TS strict-enum tests and hostile-import browser test |
| A malformed non-idempotent write response could be retried | Treat rejected malformed writes as ambiguous | TS malformed-write regression |
| A rate-limited attempt crossing cooldown expiry renewed it spuriously | Capture cooldown state at attempt start | Seed 219 cooldown regression |
| Nested pre-call errors could trigger a second outer write | SDK never retries a non-idempotent write automatically | Nested-write retry test |
| Async callable objects recorded coroutine creation as success | Detect async `__call__`; reject lazy sync returns | Callable-instance and lazy-return tests |
| Planned but unexecuted injection was reported as actual fault | Track injection at the current wrapper boundary | Nested provenance regression |
| Falsey exception objects became successful writes | Test `error is not None` | Falsey exception regression |
| Python 3.9 timeout classes differed | Classify asyncio and builtin timeout classes | Python 3.9 async-timeout regression |
| Python 3.9 completion/cancellation race swallowed caller cancellation | Use cancellation-preserving task waiting and draining | Exact race test; reviewer repeated it 100 times |
| Valid Unicode names differed across languages | Standardize the label-length rule | Unicode boundary tests |
| Huge JSON integers escaped as overflow | Check numeric bounds before finite conversion | Huge-integer schema regression |
| Inspector hid fault details and findings did not connect to events | Display fault/error/attempt metadata and related-event filtering | Browser trace inspection tests |
| Full report did not reopen naturally | Export a bounded evidence bundle and recompute on import | Bundle roundtrip tests |
| Results did not identify their executed scenario | Label results with the completed scenario | Browser changed-draft behavior tests |
| Imported unsafe settings retained the default policy label | Derive custom-policy labels and show effective settings | Imported-policy validation tests |

The SDK reviewer subsequently reported no remaining blockers in the reviewed scope, after running all SDK tests and checking cancellation cleanup. The engine reviewer exercised 7,200 built-in scenario combinations against timing, cost, and effect invariants. Browser tests and dependency audits are recorded separately in [verification](./verification.md).
