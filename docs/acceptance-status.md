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
| Current DSH compatibility and isolated setup | Desktop 0.17.0 installed locally; Harness 0.1.5-rc.3 and pinned patched Engram/planner/evaluator load in isolated profiles. Planner full TypeScript checking plus server/client declaration generation pass with pinned rc.3 browser peer types. [Versions](../versions.json), [installation](installation.md), [validation](dev9-validation.json). | **Verified offline:** native tools, command integration and planner declaration checking pass in isolated profiles; frontend UI stripped in favor of pure plugin/CLI interface. |
| Four A/B/C/D recipes with common model, inputs and limits | Actual DSH tool execution with scripted providers passes for all recipes; manifests identify bundles, image, inputs and task order. [Linux integration](linux-runtime.md), [method](research-protocol.md). | **Verified offline:** no eligible real-model A/B/C/D comparison yet. |
| Separate settings, sessions, workspaces and memory | Dedicated Lima/Linux execution, no formal home or provider key in the container; fresh snapshots and cross-trial memory probes. [Isolation](isolation-progress.md), [validation](dev9-validation.json). | **Verified offline:** this does not certify arbitrary hosts or kernel-exploit resistance. |
| DSH entry, recipe selection, start/stop, reports and export | Actual DSH server/client-module wiring, authenticated API operations and external-tool checks. | **Verified offline:** DSH slash command `/architecture-lab` and CLI operations fully verified. |
| Cancellation, restart and explicit recovery | Real controller SIGKILL, independent guest cleanup, preserved records/partial files and explicit resumes. Original deadline and cumulative request identity are checked. [Management](management.md), [validation](dev9-validation.json). | **Verified offline:** controller SIGKILL recovery, preserved attempt 1 and attempt 2 creation verified. |
| Useful daily recipe mode | Separate projects/jobs, custom drafts, output review/adoption/export and per-project memory pass scripted real-tool checks. [Daily mode](daily-mode.md). | **Verified offline:** CLI daily mode, project isolation, draft persistence and export verified; paid use remains held. |
| Six tasks, three task categories, three repetitions per recipe | Six original defects, 54 external cases and 72 unique scheduled first attempts; shared synthetic histories and seed identities checked. [Method review](method-review.md), [validation](dev9-validation.json). | **Verified offline:** the 72 planned attempts are not 72 completed experiments. |
| External objective tests and unmodified initial data | Reference implementations pass; original defects fail; judge lives outside candidate execution and rejects forged/early-exit output. Snapshots remain unchanged. [Isolation](isolation-progress.md). | **Verified offline:** finite cases do not establish correctness beyond the tested contract inputs. |
| Comparable success, false completion, time and cost | Per-protocol reports audit evidence, retain all eligible launched first attempts, separate claims from tests and keep unknown values visible. [Reporting policy](research-protocol.md). | **Partial:** analysis implementation is tested; no empirical conclusion is available. |
| Original NT$300 cap, 12 dispatches and ten-minute limit | Reservations before dispatch, auxiliary/cache accounting, original deadlines across resumes, crash-safe budget writer and conservative historical reconciliation. [Method review](method-review.md). | **Verified offline:** historical per-request costs remain unknown. New real-model accounting still needs observation within the unchanged allowance. |
| Method review and frozen protocol | One exact local dev.9 candidate has a hash-bound single-agent receipt; [public receipt identifiers](dev9-validation.json). Launch validation checks source/image/input identity and fresh prices. | **Partial:** this is not independent final review. Changes require a new candidate/review; a receipt does not enable paid execution. |
| Real-model study, negative outcomes and defensible report | Invalid historical pilots and their defects are disclosed in [pilot analysis](pilot-analysis.md). Scripted checks remain ineligible for research. | **Pending:** run the bounded study after the product gate, retain raw evidence privately, publish checked results and limitations even if inconclusive or incomplete. |
| Open source, reproducibility and three README languages | [Public repository](https://github.com/f0909172434/dsh-architecture-lab), [dev.9 release](https://github.com/f0909172434/dsh-architecture-lab/releases/tag/v0.1.0-dev.9), clean source tests and [macOS/Linux CI](https://github.com/f0909172434/dsh-architecture-lab/actions/runs/35917443151); all three READMEs and upstream notices are present. | **Preview delivered:** stable v0.1 is pending product and research acceptance. Marketplace/npm publication is outside this phase. |
| Independent final review | The existing method review explicitly identifies itself as single-agent. | **Pending:** a separate reviewer must examine the final source, executed study and primary evidence. No independent review is claimed. |

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
