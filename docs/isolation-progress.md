# Isolation and accounting repair evidence

This is a development milestone, not acceptance of the full architecture lab.
The live hold remains active. The management CLI and panel use the v2 controller
and the isolated upstream evaluator. Legacy v1 results remain ineligible.
This page retains the earlier repair findings; use the
[current acceptance map](acceptance-status.md) and [dev.9 evidence](dev9-validation.json)
for the latest coverage and outstanding work.

## Trusted judge

`src/judge/index.mjs` owns the expected values and compares typed outputs. It
never imports a submitted module into the trusted process. The worker receives
inputs only, runs under a macOS Seatbelt allow-list, and cannot fork, contact the
network, write its workspace, read the expected values, or read sibling trials.
Missing output, early exit, nonzero exit, invalid JSON, wrong result count,
exceptions, excessive output, and timeouts fail closed.

`test/judge.test.mjs` runs six reference implementations and the six original
defects. Positive execution and negative containment probes run together;
sandbox startup failure does not qualify as successful containment. Canonical
root checks cover macOS `/var`/`/private/var` aliases and symbolic links.

The v2 case catalog is now bound into the dev.9 local candidate and its separate
single-agent review receipt. No eligible live trial has been launched. It must
not be silently substituted into v1 pilot results. The fixed small test suite
measures only the specified examples and edge cases, not general program correctness or resistance to kernel exploits.

## Native DSH backend boundary

`node scripts/check-runtime-isolation.mjs` now loads Harness 0.1.5-rc.3 inside
the outer Seatbelt boundary and calls its real filesystem and shell services.
The positive local read/shell checks pass; reads of a sibling trial, a symbolic
link to it, and the expected-value catalog fail. The script uses synthetic
markers, no credentials, no positional model prompt, and no network allowance.
Private evidence is retained in the generated `state/runtime-boundary-*` folder.

Credential/settings watchers are disabled through their public configuration,
as is ambient skill discovery. DSH's inner shell policy defers to the outer
kernel boundary, avoiding unsupported nested Seatbelt application. Its policy
label alone must never be taken as evidence of containment.

Process tests also verify hard-link denial, exact local broker port access,
and cancellation/timeouts of a normal child process group. Deliberately detached
process groups are not covered by that cancellation check. This does not yet
prove real-model performance, all memory mutations, or restoration after an
interrupted experiment. Registered-tool dispatch is now covered below.

## External model broker

`src/broker/` keeps credentials and the durable budget outside the future DSH
jail. The offline implementation has a random trial token, one concurrent
dispatch, a maximum of 12 persistent request reservations, a ten-minute deadline,
pinned text-only model/effort/output limits, no redirect following, and no HTTP
retry loop. Reliable complete SSE usage settles the actual cache-hit, cache-miss,
and output cost; malformed or interrupted usage retains its reservation.

Original legacy entries remain unchanged. A reviewed conservative provider-day
reconciliation now bounds their aggregate charge; individual historical costs
remain unknown. New v2 reservations release unused headroom only with verified
usage. Bound violations stop subsequent dispatches. The current broker buffers a bounded response before delivery;
live streaming responsiveness has not been validated. Paid broker startup is
still held. Tests use a loopback fake provider and dummy credentials only.

## Compatibility-check incident

On 2026-09-23, testing Harness 0.1.5-rc.3 exposed an additional gap: positional
`/architecture-lab status` text in the headless CLI is a model prompt, not a
command dispatch. The original plugin hold only applied when a trial environment
variable was present. The compatibility check therefore made unaccounted model
requests before it was noticed; the process had already finished when a stop
was attempted.

The trace contains 11 assistant messages with usage and one auxiliary title
request without recorded usage. The assistant-only estimate is approximately
NT$0.5960 at the recorded prices. The full provider charge is unknown. This is
an incident, not another architecture trial, and contributes no research result.
Private evidence is reconstructed by `scripts/audit-compatibility-incident.mjs`.

The plugin now applies the live hold to **all** model requests, including
unlabelled headless/daily sessions. A regression test covers this missing-variable
path. Future compatibility checks must use `--dump-config` or an explicit
credential-free fake-provider environment; a positional prompt is never an
offline check. Raw traces and private billing evidence are excluded from Git.

## Scripted A/B/C/D integration

`npm run check:integration -- A` (or B/C/D) runs actual Harness rc.3, registered
native tools, the patched upstream evaluator, an external fake-provider broker
and the trusted judge. All four recipes passed. A/B dispatch seven requests;
C/D dispatch eight including plan submission and step reporting. All requests
are metered against synthetic ledgers and no paid API is contacted. A/B also
try and fail to read another trial and the expected-value catalog. The C/D
probe focuses on planning and does not repeat those read probes.

The candidate is a scripted fee repair, not a model discovery. Correctness is
7/7 in each probe; these numbers must not be reported as architecture success
rates. The evaluator retains the original report; `outcome.json` separately
records correctness, final text, terminal status and explicit research
ineligibility. Claimed completion remains unclassified (`null`). Session logs
are copied by the parent after exit; symbolic links are rejected. Logs written
by an agent are not themselves tamper-proof research evidence.

Engram 0.7.12 is pinned to its npm git revision. Its patch accepts only human
user-source messages as the current request, and updates Transformers to 4.3.0
to align the native image dependency with the host. Its 28 security tests pass.
Every memory world receives its own copied database; no background ingestion is
allowed. Dedicated cross-run mutation/retrieval acceptance subsequently passed; see
[management evidence](management.md).

Planner 0.5.0 is pinned to its npm git revision. The patch uses `startSeq/endSeq`,
preserves the host's system head, and reads current event snapshots. A regression
test exercises the real rc.3 Session API. The patched development dependencies
pin the published rc.3 browser store/slots/primitives types, so `tsc --noEmit`,
server/client declaration generation and the 88 selected adapter/orchestrator
checks pass. The runtime client bundle and its wrapper check pass. Real browser
rendering is still **not** accepted.

Build records bind the host version, patch, lockfile and host bundle hashes;
a changed dependency requires rebuilding before use. The dev.2 source-only suite reported 33 pass and one platform-specific skip;
subsequent management and memory changes add focused regressions.

## Remaining gates

- Linux containment and real DSH integration now pass detached descendants,
  abrupt controller death, explicit resume and cross-trial memory mutation.
  Native macOS process-group cleanup remains insufficient; the default is Linux.
  Unacknowledged container creation retains uncertainty and blocks restarting.
- One exact dev.9 protocol has a substantive single-agent review receipt. Each
  live launch must still match its reviewed sources, image, snapshots and fresh
  prices. Independent final review remains outstanding. Completion markers come
  from broker-owned provider streams, separately from correctness.
- Historical and incident costs were reconciled in dev.6 using a conservative
  provider-day aggregate bound. Original entries and the NT$300 cap remain intact;
  individual historical request costs are still unknown.
- Validate the real DSH interface. Prior administrative browser access rejection
  remains unresolved and has not been bypassed.
- Public dev.9 clean-checkout tests and macOS/Linux CI passed. A stable v0.1
  still requires graphical acceptance, real-model trials, daily-use acceptance
  and independent final review; another preview is not a substitute.

## Preview CI follow-up

A subsequent dev.1 macOS run failed when timeout cleanup and the process exit
callback both signalled the same group. A later tag-triggered run passed, so
that passing rerun alone was not accepted as resolution. In dev.2 successful
group termination is idempotent. The added regression fails against the old
source and passes against the fix; other containment checks remain required.
