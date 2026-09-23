# Contributor installation and recovery

All lab-profile model calls are held during repair. Read the
[remaining gates](isolation-progress.md); do not remove the hold to start a run.

## Source checks

Node.js 24+ is sufficient for `npm test` and `npm run lab -- doctor`. Installing
DSH peer dependencies at the repository root is not required. macOS kernel
tests use `/usr/bin/sandbox-exec`; other platforms have no accepted backend.
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
  their focused regressions. Planner browser-only declaration checking is
  unavailable with the published host packages.
- `profiles` renders portable templates, installs four trial and five management
  or daily profiles under `state/dsh-home`, and checks configuration composition.
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
readback have passed. Graphical acceptance and abrupt process-death cleanup
remain incomplete. See [management usage and evidence](management.md).

Keep `state/`, credentials, raw sessions and personal memory private. The broker
retains the provider key in a trusted parent and gives the jailed DSH only a
temporary token. Its integration passes scripted tests; paid starts remain held.

Never reset `state/budget.json`. Historical reservations remain charged. The
compatibility incident holds the remaining allowance pending reconciliation;
this does not mean the provider charged NT$300. Unknown usage is never zero.

## Credential-free integration

After runtime/evaluator/patch setup, macOS can run:

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
