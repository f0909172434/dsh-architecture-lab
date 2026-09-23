# Upstream components

This project integrates the following independently maintained projects. Their
authors retain ownership and their license terms remain applicable. Installed
copies and complete dependency trees are not redistributed in this repository.

| Component | Pinned version/source | Declared license | Use |
| --- | --- | --- | --- |
| DeepSeek Harness | `@deepseek-ai/dsh` 0.1.5-rc.3 | See installed package/source terms | Host runtime; downloaded separately |
| [Engram](https://github.com/kenz1117/dsh-engram) | `@kenz1117/dsh-engram` 0.7.12 | MIT; package includes LICENSE | Memory integration; downloaded separately |
| [Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute) | 0.5.0 | MIT in package manifest | Planning integration; downloaded separately |
| [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness) | 0.4.0, revision `bccfc67aa72380950fb2062e00289ab83f78b60a` | MIT in package manifest | Evaluation adapter and tracked patch |

`patches/dsh-eval-harness-0.4.0.patch` modifies the evaluator's `src/runner.ts`;
its context lines originate in the pinned upstream revision. No standalone
LICENSE file was found in that revision or the installed planning package.
Do not invent or remove upstream copyright notices when adding further patches
or redistributing source. Engram's included LICENSE must accompany any future
redistributed copy. This project's MIT license does not replace upstream terms.

## Published patches

- Engram: `patches/dsh-engram-0.7.12-user-source.patch`, revision
  `edfd704cbeaff4190f1f9abbef9472a9374f7bfb`. Exact upstream MIT text is retained
  in `patches/dsh-engram-LICENSE` (Copyright 2026 KenZ).
- Plan-and-Execute: `patches/dsh-plan-and-execute-0.5.0-rc3.patch`, revision
  `43f61c864872e1c7ecfa621797116b9dd5db91cf`. Manifest declares MIT; no standalone
  license file was present. This patch contains limited upstream context and
  project-authored compatibility changes, not the complete upstream package.
- Evaluator: the existing patch now includes the contained-process adapter and
  its regression. The complete upstream code is fetched separately.

Build tools and downloaded embedding weights retain their own terms. Nothing
in this repository grants a license to third-party models or provider services.
