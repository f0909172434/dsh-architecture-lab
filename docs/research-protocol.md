# Comparison method under review (dev.9)

This is a reviewable method, not an accepted protocol or a completed study.
Paid starts remain held. `prepare` records immutable source, task, judge,
snapshot, dependency, image and price identities with review pending. The
[review attestation and evidence audit](protocol-review.md) now preserve the
decision separately; changing a JSON field does not constitute review. The
[substantive review](method-review.md) records findings and repairs; immutable
acceptance still requires the exact final source, runtime and price identities.

## Question and fixed tasks

For DeepSeek Flash/high under one shared allowance, how do fixed Engram memory
and Plan-and-Execute affect verified completion, false completion claims,
elapsed time and total model cost? A is base DSH, B adds memory, C adds planning,
and D adds both. Six synthetic tasks and three first attempts per recipe/task
give 72 planned attempts. Restore a fresh world and original memory snapshot
for each attempt, with background ingestion disabled. Every recipe sees the
same history file, containing no target patch or judge answers. This compares
the availability of retrieval over fixed seeded experience, not natural memory
accumulation. Memory tools are not forced: an unused feature is part of the
intention-to-enable treatment. Both planning and memory treatment effects include
their instructions, token overhead and auxiliary work, not just an isolated algorithm.

The agent-visible contracts in `tasks/catalog.mjs` govern these fixed tasks:

| Task | Contract and limited interpretation |
| --- | --- |
| debug-amount | Finite numeric input or decimal text, optional sign, whitespace and valid three-digit comma groups; digits before the decimal point and, if present, after it. Exponent notation, overflow, invalid/empty text and other types return null. |
| debug-ranges | Merge intersecting or endpoint-touching closed intervals; sort output by start. Inputs are valid interval pairs. |
| reuse-config | User keys override defaults, including falsy values; merge supplied nested flags without dropping untouched flags. Inputs are plain objects. |
| reuse-slug | Trim, lowercase, preserve ASCII bases of accented Latin letters, collapse runs of whitespace and hyphens. Empty text remains empty. |
| stale-fee | Nonnegative integer cents, current 8% fee, nearest integer cent. |
| stale-date | Strict YYYY-MM-DD input, valid Gregorian date, UTC-midnight milliseconds; invalid input returns null. Fixed probes cover 1900 and later, including century leap-year boundaries. |

Stale-history prompts explicitly announce that the older history may be wrong.
They measure behavior under an announced rule update, not spontaneous detection
of concept drift. The slug prompt was clarified before any eligible live trial
to cover repeated hyphens already present in the fixed judge. The dev.9 pre-study review added contract probes for overflow, decimal syntax,
falsy settings, strict date formatting and century leap years. Historical pilot
records and prior release evidence remain unchanged; no eligible model outputs
were used to select these probes. Finite cases do not prove general
correctness for all contract inputs.

## Execution and spending

Each task/repetition block executes all four recipes sequentially. Blocks rotate
through `ABDC`, `BCAD`, `CDBA`, `DACB`; task order rotates between repetitions.
Over 18 blocks, each recipe occupies each ordinal position four or five times.
This deterministic counterbalancing is not randomization and does not eliminate
provider load, cache or time trends. The provider alias is pinned by name, not
by an independently controllable model-weight revision. Stop at the budget boundary; never
selectively finish promising arms or restart the allowance in a new root.

The original NT$300 ledger is shared by all live output directories. Offline
checks use separate synthetic ledgers. Every actual main or auxiliary dispatch
reserves from the logical trial's 12-request / ten-minute allowance; resumes
do not reset it. Ten minutes is measured from the first recorded controller start,
including staging and time between resumes. The broker records a durable deadline
even before the first dispatch; uploads, in-flight responses and the guest process
share that deadline. Cleanup may finish after it. Per-attempt elapsed time runs from
controller start until provider shutdown; abrupt loss with no reliable finish
time remains unknown. Cache use is priced explicitly; incomplete usage retains its
reservation. New metered cost estimates retain full token-rate precision; only
reservations are rounded upward. The common quoted peak rates standardize the
comparison; actual discounted/off-peak provider invoices may be lower. This avoids imposing an artificial one-cent
minimum per model call. The prompt states the allowance; the broker does not enforce a
special tool-free final request.

JSON ledger updates are serialized by an OS-released SQLite writer lock; killing
a writer does not erase reservations or strand a new lock. Any legacy lock
remains an explicit audit stop because an older controller might still own it.
The installed guest supervisor source is checked against the reviewed host copy.

Historical v1 reservations can be replaced in the committed-total calculation
only by a reviewed conservative provider-day aggregate bound. Preserve original
entries and exact pre-reconciliation bytes. That bound is not a signed invoice
or verified per-request cost. Future v2 dispatches are charged separately; the
cap is never increased.

## Outcomes and reporting

`research.protocols` is the comparative analysis in exported reports. The older
`summary` is an operational diagnostic and must not be used to pool research
results across protocols. The panel renders each protocol separately.

- Include every eligible launched, terminal **first attempt**, including failure,
  exhaustion and interruption. Missing tests count as no verified pass and are
  also counted explicitly as unknown.
- Keep external correctness separate from the broker-captured completion
  declaration. False completion requires a complete declaration and a known
  failed test. Unknown declarations/tests are not false successes.
- Record resumed, offline, unlaunched, ineligible, nonterminal and malformed
  records separately. Successful resumes never replace failed first attempts.
  Eligibility is derived from preflight and sealed evidence, independent of
  patch success; an unavailable judge stays explicitly unknown.
- Pair only complete A/B/C/D quartets with identical protocol, task and repetition.
  All eligible launched arms still appear in the marginal denominators. Disclose
  incomplete/unlaunched blocks and represented tasks.
- Report B−A (memory at base planning), C−A (planning without memory), D−A
  (combined), and D−C−B+A (interaction). Average repetitions within each
  represented task, then weight tasks equally. Also retain raw block means and
  per-task values in JSON. These are conditional contrasts, not pooled
  factorial main effects.
- Any missing required cost/time keeps its full contrast unknown. Do not average
  only the cheaper or faster known subset.
- Reject analyses with duplicate first attempts, different immutable images or
  an unavailable judge incorrectly assigned a known pass/fail result.

This study is descriptive. Six selected tasks and repeated calls do not support
population-level significance claims or AGI conclusions. Partial budget-limited
coverage cannot rank architectures across the full task set. There is no
automatic winner. Retain negative and inconclusive results and failures.

## Remaining acceptance

Before spending: finish method/fixture review, record the hash-bound review
attestation, freeze the final candidate before review, and pass actual
DSH graphical acceptance under permitted access. Offline probes prove integration
only. Paid daily recipe use also remains gated by graphical acceptance.
