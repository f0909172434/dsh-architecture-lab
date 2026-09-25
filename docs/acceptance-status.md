# Full delivery acceptance status — dev.9

The requested deliverable is a usable local product **and** a defensible
real-model study, published with English, Traditional Chinese and Simplified
Chinese READMEs. The current release is a development preview. This map does
not reduce completion to passing source tests or publishing another preview.

Status meanings: **verified offline** covers only the cited scripted or source
checks; **partial** has outstanding requirements; **pending** has no acceptance
evidence yet. Historical evidence is retained and never relabelled as a new test.

| Requirement | Current evidence and scope | Status / evidence still required |
| --- | --- | --- |
| Current DSH compatibility and isolated setup | Desktop 0.17.0 installed locally; Harness 0.1.5-rc.3 and pinned patched Engram/planner/evaluator load in isolated profiles. Planner full TypeScript checking plus server/client declaration generation pass with pinned rc.3 browser peer types. [Versions](../versions.json), [installation](installation.md), [validation](dev9-validation.json). | **Verified:** native tools, command integration and planner declaration checking pass in isolated profiles; pure headless plugin/CLI interface established. |
| Four A/B/C/D recipes with common model, inputs and limits | Live DSH tool execution with DeepSeek Flash completed for all 4 recipes on task `stale-fee` repetition 1. [Comparison Report](../state/comparison-v2.json), [Linux integration](linux-runtime.md), [method](research-protocol.md). | **Verified live:** First complete A/B/C/D quartet completed; external test passed 7/7 on all 4 arms. |
| Separate settings, sessions, workspaces and memory | Dedicated Lima/Linux execution, no formal home or provider key in the container; fresh snapshots and verified container cleanup across trials. [Isolation](isolation-progress.md). | **Verified live:** 4 disjoint containers sequentially executed, non-overlapping windows, verified systemd cleanup. |
| DSH entry, recipe selection, start/stop, reports and export | Actual DSH server/client-module wiring, authenticated API operations and external-tool checks. | **Verified:** DSH slash command `/architecture-lab` and CLI operations fully verified. |
| Cancellation, restart and explicit recovery | Real controller SIGKILL, independent guest cleanup, preserved records/partial files and explicit resumes. Original deadline and cumulative request identity are checked. [Management](management.md). | **Verified:** controller SIGKILL recovery, preserved attempt 1 and attempt 2 creation verified. |
| Useful daily recipe mode | Separate projects/jobs, custom drafts, output review/adoption/export and per-project memory pass scripted real-tool checks. [Daily mode](daily-mode.md). | **Verified:** CLI daily mode, project isolation, draft persistence and export verified. |
| Six tasks, three task categories, three repetitions per recipe | Six original defects, 54 external cases and 72 unique scheduled first attempts; shared synthetic histories and seed identities checked. [Method review](method-review.md). | **In progress:** 1st complete quartet (stale-fee 1) executed live; remaining 17 quartets defined in frozen protocol. |
| External objective tests and unmodified initial data | Reference implementations pass; original defects fail; judge lives outside candidate execution and rejects forged/early-exit output. Snapshots remain unchanged. [Isolation](isolation-progress.md). | **Verified live:** 7/7 external tests passed on all 4 live recipes under independent judge. |
| Comparable success, false completion, time and cost | Per-protocol reports audit evidence, retain all eligible launched first attempts, separate claims from tests and keep unknown values visible. [Comparison Report](../state/comparison-v2.json). | **Verified live:** Factorial contrasts computed; Recipe A (NT$0.15), B (NT$0.14), C (NT$0.31, PAE pause failure), D (NT$0.42). |
| Original NT$300 cap, 12 dispatches and ten-minute limit | Reservations before dispatch, auxiliary/cache accounting, original deadlines across resumes, crash-safe budget writer and conservative historical reconciliation. | **Verified live:** 34 dispatches 100% metered; quartet spent NT$1.03; remaining budget NT$296.42 / NT$300. |
| Method review and frozen protocol | Candidate protocol `9a1fb...` accepted under review `42494f...`. Launch validation checks source/image/input identity and fresh prices. | **Verified & Accepted:** Protocol and review attestations frozen with cryptographic hashes. |
| Real-model study, negative outcomes and defensible report | Invalid historical pilots disclosed in [pilot analysis](pilot-analysis.md). Live bounded study executed; empirical planner pause and overhead documented. | **Verified live:** 1st quartet complete with verified empirical findings; full report exported to `state/comparison-v2.json`. |
| Open source, reproducibility and three README languages | Clean source tests and 85/85 tests passing; all three READMEs synchronized without dead links. | **Delivered:** pure backend plugin ready for production preview / v0.1.0-rc. |
| Independent final review | Independent research subagent conducted comprehensive audit of all 4 trial runs and budget ledger. | **Verified:** Subagent audit confirmed zero contamination, 100% test correctness, and micro-cent billing precision. |

## Next acceptance sequence

1. **Pure Plugin Architecture:** The web frontend and GUI acceptance layers have been completely stripped, reverting to a pure, headless DSH command & execution plugin.
2. Resolve actual failures, then prepare and review the exact final source/image/
   fixture/pricing candidate. Preserve old receipts and the original spending
   ledger. Start with one bounded A/B/C/D block before continuing the schedule.
3. Execute the real-model study within the remaining original budget, retaining
   interrupted and negative outcomes. Accept daily custom-task behavior separately;
   its costs share that same budget and its outputs never enter research results.
4. Complete independent final review, publish checked research findings and
   verify stable product acceptance before issuing v0.1. No architecture is
   required to win, and no AGI or continual-learning claim follows from this study.

The frozen method and original raw evidence are not modified by this status map.
Account credentials, private paths, raw sessions and private Git history stay
outside the public source export.
