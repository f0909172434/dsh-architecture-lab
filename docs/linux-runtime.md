# Dedicated Linux execution environment

The user selected a local container/Linux VM for formal experiments. The native
macOS backend remains useful for offline integration, but does not provide full
process-family cleanup. A detached Node child can outlive its original process
group. Native syscall restrictions on `setsid`/`setpgid` alone do not cover the
`posix_spawn` route; denying `posix_spawn` also rejects ordinary native tool
launches. No paid acceptance gate is removed on this evidence. The bounded diagnostic
`node scripts/probe-native-detachment.mjs` preserves the negative result and
explicitly stops the synthetic child (which also has its own four-second limit).

The Linux environment uses Lima with Apple's virtualization framework, not
Parallels Desktop. Its exact official archive SHA-256 is pinned in
`containers/runtime.json`. Binaries, VM disks and installation evidence stay
under ignored `state/`. Existing host applications and virtual machines are
not replaced. The initial allocation is four CPUs, 6 GiB RAM and a 24 GiB sparse
virtual disk. The VM has no shared host home/project mounts, no forwarded SSH
agent, no imported host SSH public keys, and no automatic guest-port forwarding.

```sh
npm run linux
npm run linux:supervisor
npm run check:linux
npm run linux:image
npm run check:linux-bridge
npm run check:linux-dsh
npm run check:linux-recovery
```

This explicit setup downloads Lima and an Ubuntu cloud image, verifies the
Lima release checksum, and installs Docker's stable packages from its signed
Ubuntu apt repository inside the dedicated VM. Exact installed versions are
recorded locally. Setup also pulls a digest-pinned Node image for containment
acceptance. The Python supervisor is installed as root-owned files inside the
guest, outside every candidate mount. Python 3 is required for source unit tests.

The initial containment acceptance passed eight real Docker probes on macOS
with Lima 2.2.0, Ubuntu 26.04 and Docker 29.8.1. A detached child actually wrote
to its trial workspace before normal completion, cancellation, deadline, lease
expiry, host-controller SIGKILL, and guest-supervisor SIGKILL. After each case,
the trusted receipt and a working Docker daemon confirmed container removal;
the detached writer could no longer change its file. Output exhaustion and
filesystem/network restrictions also passed. [Reviewed evidence](linux-results.json).

The guest supervisor runs as a transient systemd service with an independent
runtime deadline and ExecStopPost cleanup. A controller heartbeat expires after
five seconds. Cleanup verifies the immutable image/container identity and run
label before removal. Daemon errors or identity mismatch preserve uncertain
cleanup status. Evidence is stored outside candidate-writable mounts. These are
actual fixture tests. The default Linux backend also passes real DSH A/B/C/D
tools, the upstream evaluator and external judge with a scripted provider.
The bridge checks route, token, pinned model and 12-request enforcement. Real
Engram save/search and host-controller SIGKILL recovery pass. These are
integration checks, not research performance measurements.

The tested fixture boundary is a fresh Docker PID namespace with no network,
read-only runtime, dropped capabilities, no privilege escalation, bounded CPU,
RAM and process count, and only trial-specific writable data. A trusted guest
supervisor destroys the entire container on cancellation, deadline, or loss
of its controlling connection. A detached child must not survive namespace
termination. No Docker socket or real provider credential may enter a trial.

A manager restart must confirm container cleanup by immutable container identity before
resuming. The same original budget/request ledger remains authoritative across
attempts. Resuming with a different backend is rejected. A lost owner is marked
interrupted; request counts come from the broker ledger, and uncertain costs
remain unknown. Neither stale receipts nor dead host PIDs alone prove cleanup.
If the controller dies during unacknowledged Docker creation, even an empty
inventory retains uncertainty and blocks further runs for that experiment root.

Lima ignore rules explicitly set `guestIP: 0.0.0.0`, `guestIPMustBeZero: false`,
`proto: any` and the entire port range. The explicit flag matters: otherwise
loopback services may still be forwarded. Bootstrap checks the effective
configuration and guest filesystem mounts; it does not merely trust the YAML.

## Runtime image and data exchange

Build after contributor setup and `npm run seed`. The builder sends an explicit
source allowlist and public embedding weights; no task answers, judge, sessions,
user memory or credentials enter the image. A single accepted immutable image
is used by all four recipes. Source changes invalidate acceptance. Top-level
pins and the actual runtime/plugin transitive locks are recorded locally; a
future fresh npm resolution is not claimed to produce an identical image.

Each trial gets new workspace/home/memory directories. Regular files cross the
boundary through a bounded JSON/base64 manifest (8 MiB/file, 48 MiB total,
2,048 files). Traversal, symlinks, hardlinks and special files are rejected.
Export requires the trusted terminal cleanup receipt. The host judges the fresh
export, preserving the original seed workspace.

The no-network container receives one trial-scoped Unix broker socket. A
separate SSH connection and guest lease remove that socket when the host dies.
The real provider key stays on the host; only a temporary token enters DSH.
The broker retains all request, price and deadline enforcement, including
auxiliary memory calls. No paid call is enabled by these checks.

Protocol candidates now include the immutable image, build-input manifest,
transitive lock hash and supervisor/bridge sources. Review remains pending.
Graphical acceptance and real-budget reconciliation are outstanding. See
[reviewed integration results](linux-integration-results.json).
