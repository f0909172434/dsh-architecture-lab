# Protocol review and evidence qualification

Review recording and evidence qualification are implemented. The dev.9
[single-agent method review](method-review.md) documents substantive findings and
repairs; an exact study still needs its own matching receipt. Graphical acceptance,
paid daily use and independent final review are incomplete. No paid model call is
authorized merely by recording a review.

## Freeze, review, then execute

`npm run lab -- prepare` writes an immutable candidate. It includes source and
client files, the research-method document, all fixtures/judge inputs, initial
memory snapshots, runtime image/dependency locks, prices and the fixed schedule.
The embedded `reviewStatus` remains `pending`; do not edit it to `accepted`.

A substantive reviewer supplies a JSON document and records it with:

```sh
npm run lab -- review-protocol path/to/review.json
npm run lab -- review-status
```

The DSH command `/architecture-lab review-status` and the panel also expose the
status. The receipt is stored separately in `v2/protocol-review.json`. Evidence
files are copied into `v2/review-evidence/` by SHA-256. Repeated acceptance cannot
overwrite the receipt. Changed or missing copied evidence invalidates it.
Live execution rechecks the current source, snapshots, image and price sheet;
an accepted historical receipt does not make changed inputs executable.

Review document fields:

| Field | Requirement |
| --- | --- |
| `protocolId` | Exact candidate ID returned by `prepare`. |
| `decision` | Explicit `accept`; unresolved findings must be fixed before acceptance. |
| `purpose` | `research` for an actual method review, or `workflow-validation` for testing persistence. Workflow validation cannot qualify research trials. |
| `reviewer` | `name` and `kind`: `single-agent`, `independent-review`, or `human-review`. State the actual review arrangement. |
| `limitations` | A written account of unresolved limitations and scope. |
| `evidence` | A list of `path`, `sha256`, and descriptive text in `description`. Input paths are relative to the review document. Regular files only, at most 2 MiB each, at most 32 distinct files. |
| `checks` | All six keys below, each with `verdict: "pass"`, a substantive `reason`, and `evidence` containing the referenced SHA-256 strings. |

The six required checks are `method` (estimand, pairing, missing data), `fixtures`
(contracts, histories, answer leakage), `isolation` (actual boundary probes),
`accounting` (all dispatches and shared limits), `lifecycle` (cancel/recovery),
and `reporting` (eligibility, unknown costs and negative results).

This schema records an attestation. It cannot prove the reasoning in a review,
the identity of its author, or that a claimed independent review was actually
independent. Hashes establish file identity, not scientific validity or a digital
signature. Review contents must be checked substantively before use. It must
precede all live attempts in the experiment root.

## Trusted attempt evidence

Before starting the container, the controller writes `launch.json` binding the
attempt, protocol, review, image and run identity. After the broker has stopped,
it seals the final record, upstream report, judge outcome, process artifact,
root-owned guest receipt and each broker request/response. Missing artifacts
are recorded as absent, not silently dropped. Dispatch entries are retained
alongside the seal and checked against the original shared ledger.

Exports derive `evidenceValid` from this proof; editing a registry flag cannot
promote a run. The panel's evidence dialog has a qualification-audit view.
Old unsealed records stay ineligible. Workflow-only reviews and offline providers
remain excluded even when artifact integrity passes. Actual container start is
confirmed by the guest receipt, not just the controller's intention to start.

Pass/fail, unknown cost, completion claims and cleanup success do not decide
inclusion. A confirmed launched trial with valid preflight evidence can remain
eligible after failure, exhaustion or interruption. An unavailable judge has
`pass: null`, contributes no verified pass and remains in the launched
denominator; it is not coded as a known failed test or a false completion.
Unconfirmed execution and missing/broken proof remain explicitly excluded.
Resumed attempts retain evidence but never replace the primary first attempt.

On abrupt controller death, recovery can seal the interrupted record after
independent guest cleanup is confirmed. Missing cost stays unknown; reservations
remain charged. Conflicting final artifacts remain ineligible and need audit;
recovery never overwrites them to manufacture consistency.

The host and root-owned supervisor are trusted. The candidate cannot write these
artifacts from its container. Hashes detect changes but do not defend against a
malicious host administrator replacing both files and their hashes.

## Reproducible checks

```sh
npm test
npm run check:management
npm run check:linux-recovery
npm run check:review
```

The review probe uses the installed accepted image and a fresh credential-free
root. Its review is labelled **workflow-validation** and cannot enable research.
It checks wrong-protocol rejection, preserved candidate bytes, exclusive review
publication, evidence copying and tamper detection. It intentionally leaves its
test evidence invalidated; it is not the accepted scientific protocol.
