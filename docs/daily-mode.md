# Daily task mode (development preview)

Daily tasks use their own project copies, jobs, attempts and adopted Engram
memory. They never enter research comparisons. The panel provides project import,
recipe selection, task drafts, stop/resume, output preview, explicit adoption and
export. **Paid daily tasks remain held pending product and graphical acceptance.**
The fixed offline example uses scripted responses; it does not solve arbitrary
user prompts. No paid calls were used to validate this version.

## Workspace and memory

- Import one small local code or plain-text project, or leave the source empty
  for a blank project. The original directory is never automatically updated.
- Import accepts at most 1,024 regular files, 8 MiB per file and 24 MiB total.
  Links and special files are rejected. Common credentials, VCS data, dependency
  caches and private runtime directories are excluded. This is a filename filter,
  not a content-based secret detector: choose only appropriate input files.
- Only file contents are copied. Empty directories, executable modes and other
  filesystem metadata are not preserved. The container has no general network
  access; arbitrary package installation is not part of this preview.
- Each attempt gets fresh container data. A completed attempt is **not** adopted
  automatically. Review the output and choose adoption to change the project's
  next starting point. Stale branches cannot silently replace newer results.
- Engram starts empty for a new project. Only adopted completed B/D results can
  supply future memory. An adopted A/C result keeps the last adopted memory.
  Research history and frozen research snapshots are not used in daily mode.
- Preview distinguishes added/modified/deleted files, truncates large text and
  labels binary files. Export writes a new directory and refuses an existing one.
  Generated content, including notes and program output, must be reviewed before
  sharing. No external benchmark judge certifies a general daily task.

## Terminal entry points

Use Node.js 24+ after the contributor installation and accepted Linux image.
The examples below describe JSON input files; the paths are placeholders.

`project.json`:

```json
{"source":"/path/to/small-project","label":"My project"}
```

```sh
npm run lab -- daily-import project.json
npm run lab -- daily-status
```

Copy the returned project ID into `task.json`:

```json
{"projectId":"returned-project-id","recipe":"D","prompt":"Describe the requested change and how to check it."}
```

```sh
npm run lab -- daily-task task.json
npm run lab -- daily-run returned-job-id        # held while paid acceptance is pending
npm run lab -- daily-check A                   # new fixed offline sample
npm run lab -- daily-stop
npm run lab -- daily-resume-check sample-job-id # explicit offline resume
npm run lab -- daily-resume user-job-id         # held paid resume
npm run lab -- daily-preview returned-run-id
npm run lab -- daily-adopt returned-run-id
npm run lab -- daily-export returned-run-id /path/to/new-output-directory
```

The authenticated DSH panel exposes the same operations without entering JSON.
Management sessions themselves cannot call a model.

## Recovery and spending

Daily live tasks share the **original** NT$300 ledger with research. A job has
one request identity across attempts: at most 12 total model dispatches and ten
minutes from its first start, including staging and time between resumes. An
expired task can be inspected but cannot resume with a fresh allowance. A new
task remains subject to the same total spending cap.

Research and daily starts acquire the same transaction before claiming a run;
active work or uncertain cleanup prevents either mode from starting. Cancellation
retains exported partial files. After controller death, recovery confirms guest
cleanup and attempts a bounded export into a new directory. A failed or interrupted
recovery export is recorded as incomplete, with the original guest evidence left
intact; it is not overwritten by automatic retries. Unknown costs retain their
reservations. Explicit resume uses saved partial files and the project's last
adopted memory. Partial memory is never adopted implicitly.

## Evidence

`npm run check:daily` exercises actual DSH tools with scripted providers: A/B/C/D,
adoption/export, inherited files, real Engram save/search and auxiliary accounting,
cross-project isolation, cancellation, host SIGKILL, recovered partial files and
explicit resumes. `npm run check:web` exercises these controls through the real
DSH HTTP server. Source checks also cover authentication, size limits, links,
tampering, stale branches, competing mode starts and expired resumes.

See [dev.9 checks](dev9-validation.json). These checks establish neither graphical
usability nor model quality. The existing administrative browser restriction has
not been bypassed; graphical acceptance and paid daily use remain incomplete.
