# DSH Architecture Lab

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

[Public source](https://github.com/f0909172434/dsh-architecture-lab) · MIT · development preview

A local DSH plugin comparing memory and planning, reusing DSH,
[Engram](https://github.com/kenz1117/dsh-engram),
[Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute), and
[dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness).

**Development preview: paid experiments remain held.** All four recipes now
pass a credential-free integration probe using real DSH tools, the upstream
evaluator, an external billing broker and the isolated judge. Responses are
scripted: this is integration evidence, not architecture-performance research.
The v1 pilots remain ineligible. There is no valid winner or stable release.
[Evidence](docs/integration-results.json) · [Roadmap](ROADMAP.md).

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

## Offline checks

With Node.js 24+ in a source checkout:

```sh
npm test
npm run lab -- doctor
```

No API key, provider account, dependency installation or upstream checkout is
required. Kernel-containment tests require macOS. Other hosts run portable tests
and explicitly report the unsupported isolation backend; there is no unrestricted
fallback. `doctor` does not call a model.

## Contributor setup

```sh
npm run runtime
npm run evaluator
npm run engram
npm run planner
npm run profiles
```

Installation downloads packages into isolated project directories; it does not
update global DSH or copy credentials. See [installation and recovery](docs/installation.md).
Versions are recorded in [versions.json](versions.json). Harness latest-channel
0.1.5-rc.3 is staged for v2; historical pilots used rc.2. Engram is 0.7.12,
planner 0.5.0, evaluator 0.4.0. Desktop update status has not been reverified.

The Engram patch corrects human-message attribution and aligns its local
embedding dependencies. The planner patch supports rc.3 session replacement,
preserves the system head and reads fresh events. Both build scripts verify
their pinned sources and tests. Browser declaration checking and real GUI
acceptance are incomplete; see [repair evidence](docs/isolation-progress.md).

The DSH `/architecture-lab` command provides `status`, `select`, `check`,
`resume-check`, `report`, `export`, `start`, `resume`, `batch`, and `stop`.
Offline `check` runs the contained evaluator with synthetic responses. Selection
applies to the next fresh trial. Cancellation, explicit resume with a shared
12-request allowance, restart readback and export have passed native command
checks. Daily model sessions and paid starts remain held. A dedicated graphical
results panel is not yet implemented.

```sh
# After contributor setup and synthetic memory seeding (npm run seed):
npm run check:management
npm run check:commands
npm run check:memory
```

Memory acceptance writes a synthetic marker using real Engram tools: the writer
retrieves it, fresh B/D trials do not, and the original snapshot stays unchanged.
Auxiliary query rewriting uses the same pinned route and shares the request
ledger. [Management evidence and usage](docs/management.md).

**A slash-looking positional argument to headless DSH is a model prompt.** Use
`npm run lab -- status` or `doctor` for model-free terminal inspection.

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
