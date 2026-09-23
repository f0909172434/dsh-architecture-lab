# Management preview (dev.9)

The native `/architecture-lab` command and the CLI now share one controller and
a transactional SQLite registry. Each attempt gets a new directory and isolated
DSH world. Legacy JSON records and original billing entries are preserved; reviewed
aggregate reconciliation is stored alongside the original entries. This release is an offline installation preview, not a research
comparison or a stable graphical product.

## Use after isolated setup

Node.js 24+, the pinned evaluator and accepted Lima/Linux runtime image
are required for default checks; see [Linux setup](linux-runtime.md). B/D also need synthetic snapshots from
`npm run seed`. In the repository:

```sh
npm run lab -- select B
npm run lab -- check-one B 1
npm run lab -- status
npm run lab -- report "state/my comparison.json"
```

In an actual DSH command input, use `/architecture-lab check B 1`, `status`,
`stop`, `resume-check B 1`, or `export "path with spaces.json"`. `check` submits
a background process; `status` confirms whether it started and reports the
result. Repeating a completed identity is rejected; use another repetition
(1–3) or a fresh experiment root. A resumed attempt retains the first attempt's
record, uses a fresh world, and shares its cumulative 12-request allowance and
original ten-minute deadline, including time between attempts.
There is no automatic retry and no best-of scoring.

`run-one`, `resume-one`, `run-batch`, and DSH `start`, `resume`, `batch` remain
held before credentials or paid evidence are touched. Management-session model
streams are independently disabled even if the trial hold is later removed.
Daily project copies, drafts, offline examples, adoption and export are available
in the panel and CLI; [paid daily use](daily-mode.md) remains held. The dedicated
panel has native HTTP/module integration acceptance; graphical acceptance is
still pending. See [panel details](web-panel.md).

Never pass slash-looking command text as a positional argument to headless DSH:
that is a model prompt, not command dispatch.

## Accepted offline behavior

The reproducible scripts and [reviewed summary](management-results.json) cover:

- Actual A/B/C/D tools, planning where enabled, upstream evaluation and the
  external isolated judge. Synthetic responses repair a fixed small fixture.
- Cancellation after observing a provider dispatch, duplicate-start rejection,
  explicit resume, unchanged prior evidence, shared request limits, and a
  status read from a new CLI process.
- Native Cordis command registration and execution: selection, held paid start,
  offline check, report, and an export path containing spaces. This is backend
  command acceptance, not graphical rendering acceptance.
- Real Engram save/search: B writes and retrieves a unique synthetic marker;
  fresh B/D worlds from the original snapshot cannot retrieve it and contain
  no marker node. The original snapshot hash is unchanged. The writer uses
  seven requests, fresh B six, and fresh D ten, each including one metered
  auxiliary rewrite call.

The first memory-probe attempt used the wrong output tag in its assertion.
After correcting that check, the next attempt exposed an omitted reasoning
effort in Engram's rewrite client: the adapter rejected it and Engram silently
fell back to single-query retrieval. The lab now pins that known auxiliary
request to Flash/high, rejects conflicting explicit routes, and verifies actual
broker dispatch. Both failed probe artifacts remain local; only the final
successful probe is recorded as accepted. This change does not enable paid
calls or alter formal user memories.

## Claims, costs and evidence

An explicit final declaration (`ARCHITECTURE_LAB_RESULT=complete|blocked|continue`)
is read from broker-owned provider bytes. Missing, ambiguous, truncated or
intermediate declarations are unknown. The declaration is separate from the
external test result; agent-writable session text is not the authority. Raw
upstream reports are retained; the managed record adds the trusted declaration.

Reports separate synthetic installation costs, paid attempts, and ineligible
legacy trials. Only eligible launched first live attempts enter a research
success denominator, including failures, limits and interruptions. Successful
resumes never substitute for first attempts. All current installation checks
have `evidenceValid: false`; their reported research success rate is null.

The offline controller uses a separate synthetic ledger. All live output roots
share the original NT$300 ledger. Historical usage is now covered by a reviewed
conservative provider-day bound with the original entries preserved; per-request
costs remain unknown. There were zero paid requests in these new probes.

The report's `research.protocols` separates protocols, checks matched quartets,
keeps missing coverage visible and weights represented tasks equally. The old
`summary` field remains operational diagnostics only. See the
[candidate comparison method](research-protocol.md).

## Remaining acceptance

Linux cancellation, host-controller SIGKILL and explicit recovery now pass with
a root-owned terminal receipt and a fresh Docker absence check. A confirmed
dead controller is marked interrupted; missing cleanup proof blocks both resume
and new trials. An unreachable control endpoint with a live PID is not proof of
death. Recovered usage comes from the durable ledger; uncertain reservations
stay unchanged. The evidence panel can read the recovered registry record even
when abrupt death prevented writing the final artifact. Graphical acceptance,
real-model comparison, paid daily use and independent final review remain
outstanding. A substantive single-agent method review and one exact dev.9
protocol receipt are recorded; these do not remove the live gate or accept other
protocols. See [method review](method-review.md),
[review and qualification](protocol-review.md) and the
[current acceptance map](acceptance-status.md).

`prepare` writes an immutable protocol candidate with source, task, snapshot,
build and pricing hashes; its review status is pending. It does not certify a
protocol or remove any hold. Review is recorded separately with `review-protocol`.
Reports verify sealed evidence rather than trusting a registry eligibility flag.
Do not edit the registry or budget to bypass gates.
