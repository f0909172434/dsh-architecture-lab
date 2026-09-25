# Contributor installation and recovery

All lab-profile model calls are held during repair. Read the
[remaining gates](isolation-progress.md); do not remove the hold to start a run.

## Source checks

Node.js 24+ and Python 3 are sufficient for `npm test` and `npm run lab -- doctor`. Installing
DSH peer dependencies at the repository root is not required. macOS kernel
tests use `/usr/bin/sandbox-exec`; portable source tests also run on Linux; the packaged VM launcher targets macOS.
If a launcher sandbox prohibits applying Seatbelt, positive execution tests
fail. This is not successful containment; do not bypass administrative limits.

## Isolated setup

Install Node.js, npm, Git, and pnpm. From the project directory:

```sh
npm run runtime
npm run evaluator
npm run engram
npm run planner
npm run profiles
```

- `runtime` installs the exact Harness version from `versions.json` under
  `state/runtime/`, with install scripts disabled, and verifies its CLI version.
  Native tool execution remains a separate compatibility gate.
- `evaluator` clones the pinned upstream Git revision under `upstream/`, applies
  the tracked patch, installs its lockfile and builds it.
- `engram` and `planner` reproduce the pinned source patches, build and run
  their focused regressions. Planner also pins the published rc.3 browser type
  packages, runs a full TypeScript check and emits both server and client
  declarations.
- `profiles` renders portable templates, installs four trial profiles (`lab-a`, `lab-b`, `lab-c`, `lab-d`)
  under `state/dsh-home`, and checks configuration composition.
  It neither invokes models nor establishes a verified read boundary.

Use a fresh credential-free compatibility directory to check updates:

```sh
DSH_ARCH_LAB_ROOT="$PWD/state/compat-check" npm run profiles
DSH_ARCH_LAB_ROOT="$PWD/state/compat-check" npm run lab -- doctor
```

The scripts do not copy keys or replace global DSH. Use `--dump-config` for DSH
inspection; positional headless text is a prompt even when it begins with `/`.

## Versions and data

Pin exact versions, test updates in a new directory, and freeze version/patch
hashes into each new protocol. Never relabel historical trial versions or reuse
an identity after changing the judge. `next` and `alpha` are not default channels.

The management commands now use the isolated v2 evaluator. `prepare` creates an
immutable candidate manifest with review pending; it does not enable paid runs.
Native offline A/B/C/D, memory separation, cancellation/resume and restart
readback have passed. The default Linux backend also passes abrupt controller-death cleanup and
explicit recovery. See [management usage and evidence](management.md).

Keep `state/`, credentials, raw sessions and personal memory private. The broker
retains the provider key in a trusted parent and gives the jailed DSH only a
temporary token. Its integration passes scripted tests; paid starts remain held.

Never reset `state/budget.json`. All live experiment directories share this
original ledger. A reviewed conservative provider-day bound now covers the old
reservations without deleting or rewriting the original entries. Its exact
before-image is preserved. Per-request historical costs remain unknown; this is
not an invoice. New v2 dispatches are added separately under the same NT$300 cap.
Offline probes retain separate synthetic ledgers.

Desktop 0.17.0 was separately installed after explicit acceptance of its MIT plus
non-commercial condition. This plugin's MIT license does not override Desktop's
restriction. See [upstream terms](../THIRD_PARTY_NOTICES.md). Desktop is not
bundled with the plugin; the latest recommended Harness remains 0.1.5-rc.3.

## Credential-free integration

After runtime/evaluator/patch setup, run `npm run seed`, then follow
[Linux setup and image acceptance](linux-runtime.md). The commands below include
legacy native diagnostics; managed and memory checks use Linux by default.

```sh
npm run check:isolation
npm run check:integration -- A
npm run check:integration -- C
npm run seed
npm run check:integration -- B
npm run check:integration -- D
npm run check:management
npm run check:commands
npm run check:memory
npm run check:linux-recovery
```

Seeding uses a fresh credential-free home, a local Engram save tool, and only
synthetic `history.md` files. It may download public embedding weights on first
use. It forbids LLM calls and does not copy the formal DSH home. Existing
snapshots are preserved; use a new experiment root for a new protocol.
Integration probes use fake loopback providers, random trial tokens and their
own synthetic ledgers. They cannot spend the real budget. Results live under
ignored `state/brokered-dsh-*`; they are not research outcomes.

## Recovery and publication

Stop lab processes and preserve the budget, runs, analysis and memory snapshots
for audit. Move experiment profiles and the isolated runtime aside to remove
the installation. These scripts do not replace the user's global DSH.

An interrupted run must preserve evidence and require explicit resume from the
lab. Retried attempts must not overwrite results or inflate single-run success.

Before public release, scan a clean source snapshot and its metadata, retain
upstream notices, test a fresh checkout, and read back the public GitHub state.
Raw private evidence must not enter the public snapshot or its history.

Before upgrading the lab, stop its active controllers. Do not share one budget
ledger between mixed code versions. New writer locks release on process death;
an existing legacy `budget.lock` remains an audit stop and is never silently
removed. The original JSON entries and cap remain authoritative.
