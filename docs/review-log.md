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

## Interface and workflow review — 1.1.0

A second review cycle addressed the interface, language, and browser workflows. Three independent AI reviewers acted as visual, product/copy, and implementation judges. Their design scores are subjective assessments, not measured user satisfaction or a certification.

| Rubric | Original interface | Revised interface |
|---|---:|---:|
| Visual craft | 3/5 | 4/5 |
| Information hierarchy | 2.5/5 | 4/5 |
| Product clarity | 3/5 | 4/5 |
| Credibility of the presentation | 4/5 | 4/5 |

The visual review covered desktop/mobile screenshots of the simulator, inspector, and documentation. The product review checked whether the language followed the model and provided runnable instructions. The implementation review reproduced browser failures and revisited the fixes.

| Finding | Resolution | Verification |
|---|---|---|
| Slogans obscured the purpose and made simulation percentages resemble agent scores | Direct headings, scope before results, a baseline/candidate/difference table, and metric definitions | Product re-review and screenshot inspection |
| Result text attributed improvements to an unproven cause | Exact safe/unsafe/stopped counts and call totals, without causal claims | Product re-review and source inspection |
| Selected example could be mistaken for an unbiased sample | Selection rule beside the timeline; all-trial aggregates explicitly labeled | Product re-review |
| Export/share lost the inspected trial | Bounded reports preserve the current pair; links include a validated trial number | Report index tests, browser roundtrip, independent endpoint/bounds checks |
| Late example response overwrote a later import or a cleared view | A shared request generation invalidates stale work | Delayed-response browser regression and independent recheck |
| Backoff length used a clamped call-bar width | Wait spans use the complete timeline scale independently | Rendered-geometry regression and independent recheck |
| Long valid tool names expanded the mobile page | Constrained flex children and wrapped user-controlled labels | 160-character trace regression and independent recheck |
| Desktop tabs had a vertical visual layout but horizontal keyboard behavior | Horizontal navigation at every viewport | Keyboard regression |
| Collapsed mobile settings became inaccessible after resizing | Closed disclosures keep an accessible summary | Resize regression and independent recheck |
| Fault count omitted manual events with an OK status and a recorded fault | Count either a non-OK status or a recorded fault | Manual-trace regression and independent recheck |
| Small timeline bars were difficult to tap | Mobile call selector preserves chart geometry and opens the same evidence | Mobile selection regression |
| Important mobile definitions were too small | Readable expandable definitions beside the comparison | Screenshot review and accessibility scan |
| Guide had an undefined sandbox object | Executable checkout and installation commands, copy controls, explicit shell guidance | Browser clipboard success/failure checks; checkout example |

The final focused implementation review found no remaining issues in the reviewed changes. Existing engine semantics and Python SDK behavior remain unchanged. Accessibility checks are automated and supplemented with keyboard/screenshot review; they do not replace assistive-technology or representative-user testing.


Live validation also separated Cloudflare challenge traffic from application upload attempts. The regression permits only the documented same-origin challenge namespace and adds offline import/filter tests. This corrects a test boundary; application trace processing was already local.
