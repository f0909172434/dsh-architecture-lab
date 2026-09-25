# DSH Architecture Lab

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

[Public source](https://github.com/f0909172434/dsh-architecture-lab) · MIT · development preview

[Full delivery acceptance status](docs/acceptance-status.md): evidence and remaining requirements.

A local DSH plugin comparing memory and planning, reusing DSH,
[Engram](https://github.com/kenz1117/dsh-engram),
[Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute), and
[dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness).

**Development preview: protocol frozen & 1st live trial complete.** Candidate protocol `9a1fb...` has been frozen under review `42494f...`. The first live A/B/C/D quartet trial (`stale-fee` repetition 1) completed with DeepSeek-V4.1-Flash, achieving 7/7 external test passes across all four recipes and 100% metered billing (NT$1.03 spent of the NT$300 allowance). The v1 pilots remain ineligible.
[Linux evidence](docs/linux-integration-results.json) · [Roadmap](ROADMAP.md).


Comparison exports now separate protocol identities and show matched A/B/C/D contrasts, missing coverage and unknown costs via `npm run lab -- report`. The order is
counterbalanced across blocks. See the [candidate method](docs/research-protocol.md).
Historical costs have been reconciled using a conservative provider-day bound;
original entries are preserved, per-request costs remain unknown, and all live
experiment directories share the original NT$300 cap. The project operates as a pure headless DSH plugin and CLI command suite. Every study run requires a matching frozen protocol receipt. [Current checks](docs/dev9-validation.json).

Review receipts and sealed attempt evidence now make research eligibility inspectable. Reports derive eligibility from the pre-launch review, guest execution receipt, judge artifacts and broker ledger; a registry flag cannot promote old trials. See [review workflow](docs/protocol-review.md). The [substantive single-agent review](docs/method-review.md) is complete and an exact local protocol receipt is preserved.

| Recipe | Memory | Planning |
| --- | --- | --- |
| A | Native DSH | Native DSH |
| B | Engram | Native DSH |
| C | Native DSH | Plan-and-Execute |
| D | Engram | Plan-and-Execute |

Target: six synthetic coding tasks × four recipes × three independent runs,
subject to NT$300 total, 12 model requests and ten minutes per trial. The model
is DeepSeek Flash/high. Correctness, claimed completion, termination reason,
evidence validity, time and cost are separate outcomes. These experiments do
not establish AGI or continuous learning.

## Research-method checkpoint

The pre-study audit repaired deadlines across resumes, removed artificial
per-call cent rounding, made budget locks recoverable after process death and
verified installed supervisor source. Six reference solutions pass 54 external
cases; every original defect fails, and all six memory snapshots match only their
shared histories. Metered estimates retain small cost differences; reservations
remain conservative. The 1st live quartet trial (`stale-fee` repetition 1) provides verified empirical contrast data under DeepSeek-V4.1-Flash; remaining blocks are defined in the frozen protocol.

[Method review](docs/method-review.md) · [Acceptance status](docs/acceptance-status.md)

## Daily task preview

The headless CLI supports independent project copies, custom task drafts, recipe
selection, output preview, explicit adoption and export to a new directory (`npm run lab -- daily-*`).
Per-project Engram memory persists only after adoption. Fixed offline A/B/C/D
checks exercise real tools, cancellation and recovery after controller loss;
they do not execute arbitrary user prompts. Paid daily tasks remain held and
share the original spending cap once enabled. See [daily usage and limits](docs/daily-mode.md)
and [dev.8 validation](docs/dev9-validation.json).

## Offline checks

With Node.js 24+ and Python 3 in a source checkout:

```sh
npm test
npm run lab -- doctor
```

Source checks need no API key, provider account, dependency installation or upstream checkout. Kernel-containment tests require macOS. Other hosts run portable tests
and explicitly report the unsupported isolation backend; there is no unrestricted
fallback. `doctor` does not call a model.

## Contributor setup

```sh
npm run runtime
npm run evaluator
npm run engram
npm run planner
npm run profiles
npm run seed
npm run linux
npm run linux:supervisor
npm run linux:image
npm run check:linux-dsh
```

Installation downloads packages into isolated project directories; it does not
update global DSH or copy credentials. See [installation and recovery](docs/installation.md).
Versions are recorded in [versions.json](versions.json). Harness latest-channel
0.1.5-rc.3 is staged for v2; historical pilots used rc.2. Engram is 0.7.12,
planner 0.5.0, evaluator 0.4.0. Desktop 0.17.0 was verified against its official
release checksum and installed locally on 2026-09-24.

The Engram patch corrects human-message attribution and aligns its local
embedding dependencies. The planner patch supports rc.3 session replacement,
preserves the system head and reads fresh events. Both build scripts verify
their pinned sources and tests. Planner declaration generation and typechecking pass. See
[repair evidence](docs/isolation-progress.md).

The DSH `/architecture-lab` command provides `status`, `select`, `check`,
`resume-check`, `report`, `export`, `start`, `resume`, `batch`, and `stop`.
Offline `check` runs the contained evaluator with synthetic responses. Selection
applies to the next fresh trial. Cancellation, explicit resume with a shared
12-request allowance, restart readback and export have passed native command
checks. The project operates as a headless plugin and CLI command suite.

```sh
# After contributor setup and synthetic memory seeding (npm run seed):
npm run check:management
npm run check:commands
npm run check:memory
```

The default execution backend is the dedicated Lima Linux VM, not Parallels.
A missing or stale accepted image disables execution; there is no automatic native fallback.

Memory acceptance writes a synthetic marker using real Engram tools: the writer
retrieves it, fresh B/D trials do not, and the original snapshot stays unchanged.
Auxiliary query rewriting uses the same pinned route and shares the request
ledger. [Management evidence and usage](docs/management.md).

**A slash-looking positional argument to headless DSH is a model prompt.** Use
`npm run lab -- status` or `doctor` for model-free terminal inspection.

A dedicated [Lima/Linux environment](docs/linux-runtime.md) now passes eight
real container probes, including detached descendants, cancellation, deadline,
and host/guest controller SIGKILL. The default Linux backend now passes real DSH A/B/C/D tool execution,
authenticated broker forwarding, Engram mutation isolation and explicit recovery
after host-controller SIGKILL. Unknown reservations are retained.
[Containment](docs/linux-results.json) · [Integration](docs/linux-integration-results.json).

## Evidence and limits

- [Pilot analysis](docs/pilot-analysis.md): two ineligible pilots, confirmed
  answer contamination and a verifier bypass; no comparative success claim.
- [Isolation and accounting repair](docs/isolation-progress.md): tested
  boundaries, fake-provider tests, a compatibility-check billing incident,
  and outstanding acceptance gates.
- Raw sessions, credentials, personal memory, caches and billing ledgers remain
  in ignored local directories. Publication includes code, synthetic tasks,
  necessary patches and reviewed research summaries only.

[MIT license](LICENSE). Upstream projects retain their own licenses.
Contributions must preserve budget limits, fail-closed behavior, negative
results, and the distinction between offline tests and real-interface acceptance.

The separately installed Desktop 0.17.0 has an additional **non-commercial-only**
condition. This plugin remains MIT; its license does not override Desktop terms.
See [third-party notices](THIRD_PARTY_NOTICES.md).
