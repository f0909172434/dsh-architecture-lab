# Isolation and accounting repair evidence

This is a development milestone, not acceptance of the full architecture lab.
The live hold remains active. `src/evaluator.mjs` now connects the new modules
to the upstream evaluator through a contained-process adapter. The management
CLI still uses the held v1 entry; its old results remain ineligible.

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

The new case catalog is intended for protocol v2. Its hash has not yet been
frozen into a live schedule. It must not be silently substituted into v1 pilot
results. The fixed small test suite measures only the specified examples and
edge cases, not general program correctness or resistance to kernel exploits.

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

Legacy reservations remain fully charged and unchanged. Only v2 reservations
with verified usage release unused headroom. Bound violations stop subsequent
dispatches. The current broker buffers a bounded response before delivery;
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
allowed. Dedicated cross-run mutation/leakage acceptance remains to be done.

Planner 0.5.0 is pinned to its npm git revision. The patch uses `startSeq/endSeq`,
preserves the host's system head, and reads current event snapshots. A regression
test exercises the real rc.3 Session API. The 88 selected adapter/orchestrator
checks pass. The full suite has 201 passing tests and one suite that cannot load
an unpublished host browser primitive. The runtime client bundle and its wrapper
check pass; browser declarations and real rendering are **not** accepted.

Build records bind the host version, patch, lockfile and host bundle hashes;
a changed dependency requires rebuilding before use. Source-only tests currently
report 33 pass, zero fail and one platform-specific skip on macOS.

## Remaining gates

- Replace the held management runner with the new contained evaluator path and
  verify cancellation, restart, explicit resume and all memory mutation probes.
- Freeze protocol v2, classify claimed completion, and audit evidence provenance.
- Reconcile historical and incident costs without resetting the NT$300 cap.
  Current reservations consume the full allowance; actual charges are not NT$300.
- Validate the real DSH interface. Prior administrative browser access rejection
  remains unresolved and has not been bypassed.
- Verify public clean-checkout CI. Publish development work with explicit limits;
  a stable v0.1 requires the outstanding product and research acceptance gates.

## Preview CI follow-up

A subsequent dev.1 macOS run failed when timeout cleanup and the process exit
callback both signalled the same group. A later tag-triggered run passed, so
that passing rerun alone was not accepted as resolution. In dev.2 successful
group termination is idempotent. The added regression fails against the old
source and passes against the fix; other containment checks remain required.
