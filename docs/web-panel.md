# Architecture Lab panel

The plugin contributes a dedicated “架構實驗室” sidebar entry and matching main
panel through the DSH client slot API. Its page is served by the existing DSH
web server at `/architecture-lab`; no second UI server is installed. The panel
uses the same controller as the slash command and CLI.

It offers recipe selection, labelled offline checks, held formal trial controls,
stop, explicit resume, run filtering, separate correctness and completion-claim
columns, evidence inspection and JSON report download. Reservations are labelled
as occupied budget, not invoice charges. Unknown cost is not displayed as zero.
Missing runtime/plugin/snapshot prerequisites are shown as unavailable.

The page uses a per-server capability, exact loopback Host checks, same-origin
JSON writes, a restrictive content security policy and text-only rendering of
untrusted results. Evidence requests accept only fixed artifact kinds inside
one attempt; they do not accept arbitrary file paths.

`npm run check:web` starts an empty, credential-free native DSH web profile with
browser opening disabled. It verifies the real client-module graph and advertised
bundle URL, serves the panel, selects a recipe, rejects paid startup, completes
an actual isolated offline trial and reads back its report/evidence. See
[backend evidence](web-results.json). Source tests also reject cross-origin
writes, missing capabilities, traversal and evidence symlinks outside the attempt.

This is native HTTP/module acceptance only. Browser rendering, keyboard use,
visual layout and interactive navigation have not been accepted. The prior
administrative browser restriction remains unresolved and has not been bypassed.
A panel source file or passing HTTP probe does not prove graphical completion.

The dev.6 comparison panel groups results by immutable protocol, displays
complete/incomplete block coverage and task-balanced memory/planning contrasts,
and retains unknown cost/time differences. It never pools protocols or declares
a winner. Text-tree tests verify report content only; they do not establish
visual layout or graphical acceptance.

The dev.8 daily section has independent projects/jobs/attempts, custom prompt
forms, a clearly labelled fixed offline sample, preview/adoption and new-directory
export. Daily action bodies are bounded to 64 KiB; other writes retain their
4 KiB limit. Both endpoints retain the same capability, Host and origin checks.
The native HTTP probe now covers the daily flow and confirms it does not enter
research reports. [Daily mode](daily-mode.md) · [Current checks](dev8-validation.json).
