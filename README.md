# DSH Architecture Lab

> A DSH plugin and CLI for running controlled comparisons of DeepSeek agent architectures on the same coding tasks.

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [GitHub Source](https://github.com/Chih-Kai-Wang/dsh-architecture-lab) · MIT License

## About the project

**DSH Architecture Lab** is a headless DSH plugin and CLI. It runs different **AI agent architectures** on the same software-engineering tasks and compares success, time and cost.

Agent comparisons are distorted by prompt drift, shared context between trials and unmetered spending. Here each trial runs in an isolated sandbox, a budget proxy meters every request, and a separate judge scores the result with external tests.

The current version, `0.1.0-dev.9`, is a development preview. So far one live comparison of all four recipes has been run.

## Key features

- **Sandbox isolation.** Trials run in isolated Lima Linux VM containers or macOS Seatbelt sandboxes, each with its own memory, filesystem and processes.
- **Budget metering.** A billing proxy with SQLite transaction locks meters every API dispatch in real time and enforces a budget ceiling, by default NT$300.
- **External judge.** External tests run in a separate subprocess, so the score does not depend on the agent's own report.
- **Four matched recipes.** Native conversation, long-term memory, multi-step planning and a hybrid run under the same conditions.
- **Headless plugin and CLI.** There is no web frontend. The tool is built for CLI runs, batches and structured reports.

## Architecture recipes

The lab defines four controlled recipes:

| Recipe | Memory Mechanism | Planning Mechanism | Profile Characteristics |
| :---: | :---: | :---: | :--- |
| **A** | Native DSH Context | Native DSH Direct Execution | **Baseline**: Minimalist single-agent conversational reasoning |
| **B** | **Engram Long-term Memory** | Native DSH Direct Execution | **Memory-Augmented**: Vector embeddings retrieve historical context |
| **C** | Native DSH Context | **Plan-and-Execute** | **Planning-Augmented**: Explicit step decomposition and sequential verification |
| **D** | **Engram Long-term Memory** | **Plan-and-Execute** | **Full Hybrid**: Combines historical experience retrieval with structured execution |

## Live results (DeepSeek-V4.1-Flash)

Under the frozen research protocol, the lab ran one live quartet (one trial per recipe) with **DeepSeek-V4.1-Flash** on task `stale-fee`, a fee-calculation repair:

| Recipe | External Tests | Requests | Wall Time | Cost (TWD) | Performance Summary |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Recipe A** (Baseline) | **7 / 7 Passed** | 6 | 16.2s | NT$ 0.1513 | Fast and steady baseline repair |
| **Recipe B** (Engram Memory) | **7 / 7 Passed** | 5 | **11.0s** | **NT$ 0.1441** | 🚀 **Fastest & most cost-effective** (Highest ROI) |
| **Recipe C** (Plan-and-Execute) | **7 / 7 Passed** | 12 | 44.0s | NT$ 0.3110 | Generated 100% correct code with detailed step verification |
| **Recipe D** (Full Hybrid) | **7 / 7 Passed** | 11 | 32.4s | NT$ 0.4201 | Successfully combined memory and structured plan execution |

All four recipes passed all 7 external tests. Recipe B, with Engram memory, used the fewest requests, the least time and the least money. This is one run of one task, so it does not yet rank the architectures in general.

## Quick start

### 1. Requirements

- **Node.js**: v24 or later
- **Python**: 3.10 or later
- **Virtualization**: macOS native Seatbelt or Lima Linux VM (Docker)

### 2. Run tests and diagnostics

Clone the repository and run the checks locally without an API key.

```bash
# Run all 85 unit and integration tests (~1.7s execution time)
npm test

# Check system environment, VM, Docker image, and pricing status
npm run lab -- doctor
```

### 3. Check lab status

This shows the selected recipe, the remaining budget and the trial history:

```bash
npm run lab -- status
```

## CLI command guide

### Research trial management

```bash
npm run lab -- select B               # Select active recipe (A/B/C/D)
npm run lab -- check-one              # Run offline compliance check
npm run lab -- run-one stale-fee 1 B  # Execute a live trial under protocol protection
npm run lab -- report                 # Generate comparative report (comparison-v2.json)
npm run lab -- stop                   # Gracefully terminate an active trial
```

### Daily workspace tasks

```bash
npm run lab -- daily-import project.json   # Safely snapshot and import a project
npm run lab -- daily-task task.json       # Draft a daily task
npm run lab -- daily-preview <runId>      # Preview generated code diffs
npm run lab -- daily-adopt <runId>        # Adopt changes into project workspace
npm run lab -- daily-export <runId> <dir> # Export verified results to a new directory
```

## Project architecture

```text
├── src/                # Core engines (Broker proxy, Judge sandbox, Manager coordinator)
├── tasks/              # Controlled task specifications (fee calculation, date boundaries, etc.)
├── test/               # 85 automated test suites with high coverage
├── state/              # Durable experiment ledger (SQLite registry, budget ledger, protocol)
├── docs/               # Architecture specifications and empirical research reports
├── containers/         # Linux VM Docker configuration and process supervisor
└── package.json        # Project metadata and execution scripts
```

## What the results do not show

- The plan has six tasks and three attempts per recipe on each task, 72 attempts in all. Only the first quartet has run. The other 17 are defined in the frozen protocol but not yet run. See the [acceptance status](docs/acceptance-status.md).
- The report is written to `state/comparison-v2.json`, which is not committed, so the numbers above cannot be checked from this repository alone.
- Two earlier pilots are excluded. The [pilot analysis](docs/pilot-analysis.md) found that one trial read another's answers and that the judge of that time could be bypassed.
- Paid [daily-mode](docs/daily-mode.md) tasks are held until product smoke acceptance.
- v0.1 still needs an independent final review and stable product acceptance. No architecture is required to win, and no AGI or continual-learning claim follows.

## License

This project is licensed under the [MIT License](LICENSE).
