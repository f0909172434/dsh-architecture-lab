# 0.1.0-dev.4 development preview

A dedicated Architecture Lab sidebar panel now serves through DSH's client
module graph and web server. Recipe selection, offline start, authenticated
stop, explicit resume, evidence viewing and JSON export share the existing
controller. Real native HTTP/module acceptance passed; graphical interaction
is still unverified. [Panel evidence](web-results.json).

The new Lima/Linux fixture supervisor passed eight real Docker probes, including
detached descendants, cancellation, deadline, expired heartbeat, host-controller
SIGKILL, guest-supervisor SIGKILL, output limits and restricted filesystem/network
access. systemd cleanup and independent Docker readback confirm container removal.
The digest-pinned fixture image contains no credentials or judge answers.
[Containment evidence](linux-results.json).

The clean source suite has 52 passing tests and one macOS-specific skip, with
five additional Python supervisor cases inside one source test. Desktop 0.16.0
and its recommended Harness rc.3 were checked locally. This is still a preview:
the full Linux DSH image, controlled broker bridge, manager recovery integration,
graphical acceptance, daily recipe use, research protocol and cost reconciliation
remain outstanding. No new paid model calls or valid research winner are claimed.

## Historical dev.3 snapshot

The native DSH commands and CLI now share an isolated evaluator controller,
transactional run registry, authenticated stop control and explicit resume.
Offline A/B/C/D execution, cancellation after dispatch, preserved prior records,
restart readback, report export and actual Engram cross-trial mutation/retrieval
all pass. Auxiliary query rewriting uses the pinned model/effort and is metered.
Completion claims come from broker-owned provider streams and remain separate
from correctness.

The source-only suite has 46 passing tests and one platform-specific skip on
macOS. A clean public checkout also passes without credentials or installed
DSH. All new integration probes use scripted local providers: zero paid calls,
no comparative research result. English, Traditional Chinese and Simplified
Chinese READMEs describe the current behavior.

See [management usage and limitations](management.md) and the
[reviewed acceptance summary](management-results.json). Abrupt process-death
cleanup, detached children, graphical results, daily recipe use, research
protocol review and historical billing reconciliation remain incomplete.
Paid starts stay held; the original NT$300 ledger is not reset.

## Historical dev.2 snapshot

This snapshot exposes the architecture-lab implementation and reproducible
offline checks. It is not a stable v0.1 release or a completed architecture study.

- Four recipes execute real Harness rc.3 tools through the upstream evaluator,
  a local model broker and a kernel-isolated correctness worker.
- Patched Engram restores human-message attribution; patched Plan-and-Execute
  supports rc.3 session replacement and current event snapshots.
- The broker meters each actual dispatch, persists request limits, and retains
  reservations for uncertain usage. Paid startup stays disabled.
- English, Traditional Chinese and Simplified Chinese READMEs are included.

Local validation: 33 source tests pass with one platform-specific skip; the
planner adapter/orchestrator suite passes 88 tests, Engram security passes 28,
and the evaluator runner passes 60. Scripted A/B/C/D probes pass with seven,
seven, eight and eight fake-provider dispatches respectively. No paid call is
made by these checks. The full planner test run also exposes one unavailable
browser suite; it is not reported as a full pass.

Known limits: macOS-only accepted containment; management runner migration,
memory mutation probes, full cancellation/restart, GUI acceptance, research
protocol freeze and historical billing reconciliation remain incomplete.
Candidate-controlled session logs are not tamper-proof. There is no accepted
real-model comparison and no architecture winner.

The original pilots and the compatibility-call incident remain documented.
Full private evidence stays local; public summaries include no raw sessions,
credentials, personal memory or billing ledgers.

### Change from dev.1

A macOS CI run exposed a repeated SIGKILL on an already terminated process
group. The exit cleanup now avoids signalling the same group after a successful
stop. A deterministic regression reproduces the EPERM with the old source and
passes with the fix. The failed dev.1 run remains available:
https://github.com/f0909172434/dsh-architecture-lab/actions/runs/35885507674
This does not expand the cancellation claim to detached process groups.
