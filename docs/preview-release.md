# 0.1.0-dev.1 development preview

This snapshot exposes the architecture-lab implementation and reproducible
offline checks. It is not a stable v0.1 release or a completed architecture study.

- Four recipes execute real Harness rc.3 tools through the upstream evaluator,
  a local model broker and a kernel-isolated correctness worker.
- Patched Engram restores human-message attribution; patched Plan-and-Execute
  supports rc.3 session replacement and current event snapshots.
- The broker meters each actual dispatch, persists request limits, and retains
  reservations for uncertain usage. Paid startup stays disabled.
- English, Traditional Chinese and Simplified Chinese READMEs are included.

Local validation: 32 source tests pass with one platform-specific skip; the
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
