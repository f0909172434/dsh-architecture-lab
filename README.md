# DSH Architecture Lab

> A controlled evaluation and experimentation plugin for DeepSeek agent architectures.

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [GitHub Source](https://github.com/f0909172434/dsh-architecture-lab) · MIT License

---

## 💡 About the Project

**DSH Architecture Lab** is a lightweight, pure-headless DSH plugin and CLI toolkit designed to scientifically, objectively, and safely evaluate and compare different **AI Agent architectures** on realistic software engineering tasks.

Benchmarking AI agents often suffers from prompt drift, context contamination, or unmetered costs. DSH Architecture Lab provides a rigorous, reproducible evaluation environment powered by **isolated container sandboxes**, **micro-cent budget guards**, and **objective external judges**.

---

## 🌟 Key Highlights

- **🛡️ Strong Sandbox Isolation**:
  Executes agent trials inside isolated Lima Linux VM containers or macOS Seatbelt sandboxes with complete memory, filesystem, and process separation.

- **💰 Micro-Cent Accounting & Budget Guard**:
  Features an embedded billing proxy with SQLite transaction locks that meters every API dispatch in real-time, enforcing strict budget ceilings (default NT$300 allowance).

- **⚖️ Objective External Judge**:
  Evaluation runs through decoupled external test cases in an isolated sub-process, ensuring unbiased scoring free from agent self-reporting artifacts.

- **📊 4 Balanced Recipes**:
  Systematically compares native conversation, long-term memory, multi-step planning, and hybrid architectures under matched experimental conditions.

- **⚡ Pure Headless Plugin & CLI**:
  Streamlined architecture with zero frontend bloat, purpose-built for fast CLI execution, automated batching, and structured reporting.

---

## 🔬 Architecture Recipes

The lab defines four controlled recipes:

| Recipe | Memory Mechanism | Planning Mechanism | Profile Characteristics |
| :---: | :---: | :---: | :--- |
| **A** | Native DSH Context | Native DSH Direct Execution | **Baseline**: Minimalist single-agent conversational reasoning |
| **B** | **Engram Long-term Memory** | Native DSH Direct Execution | **Memory-Augmented**: Vector embeddings retrieve historical context |
| **C** | Native DSH Context | **Plan-and-Execute** | **Planning-Augmented**: Explicit step decomposition and sequential verification |
| **D** | **Engram Long-term Memory** | **Plan-and-Execute** | **Full Hybrid**: Combines historical experience retrieval with structured execution |

---

## 📈 Live Empirical Results (DeepSeek-V4.1-Flash)

Under the frozen research protocol, the lab executed a live quartet trial using **DeepSeek-V4.1-Flash** on task `stale-fee` (fee calculation business logic repair):

| Recipe | External Tests | Requests | Wall Time | Cost (TWD) | Performance Summary |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Recipe A** (Baseline) | **7 / 7 Passed** | 6 | 16.2s | NT$ 0.1513 | Fast and steady baseline repair |
| **Recipe B** (Engram Memory) | **7 / 7 Passed** | 5 | **11.0s** | **NT$ 0.1441** | 🚀 **Fastest & most cost-effective** (Highest ROI) |
| **Recipe C** (Plan-and-Execute) | **7 / 7 Passed** | 12 | 44.0s | NT$ 0.3110 | Generated 100% correct code with detailed step verification |
| **Recipe D** (Full Hybrid) | **7 / 7 Passed** | 11 | 32.4s | NT$ 0.4201 | Successfully combined memory and structured plan execution |

> **Key Takeaway**: In focused code repair tasks, **Recipe B (Engram Memory)** demonstrated superior convergence speed, achieving 100% pass rates with the fewest requests and lowest cost.

---

## 🚀 Quick Start

### 1. Requirements
- **Node.js**: v24 or later
- **Python**: 3.10 or later
- **Virtualization**: macOS native Seatbelt or Lima Linux VM (Docker)

### 2. Run Tests & Diagnostics
Clone the repository and run verification locally without requiring an API key:

```bash
# Run all 85 unit and integration tests (~1.7s execution time)
npm test

# Check system environment, VM, Docker image, and pricing status
npm run lab -- doctor
```

### 3. Check Lab Status
Query current recipe selection, remaining budget, and recorded trial history:

```bash
npm run lab -- status
```

---

## 🛠️ CLI Command Guide

### 🧪 Research Trial Management
```bash
npm run lab -- select B               # Select active recipe (A/B/C/D)
npm run lab -- check-one              # Run offline compliance check
npm run lab -- run-one stale-fee 1 B  # Execute a live trial under protocol protection
npm run lab -- report                 # Generate comparative report (comparison-v2.json)
npm run lab -- stop                   # Gracefully terminate an active trial
```

### 💼 Daily Workspace Tasks
```bash
npm run lab -- daily-import project.json   # Safely snapshot and import a project
npm run lab -- daily-task task.json       # Draft a daily task
npm run lab -- daily-preview <runId>      # Preview generated code diffs
npm run lab -- daily-adopt <runId>        # Adopt changes into project workspace
npm run lab -- daily-export <runId> <dir> # Export verified results to a new directory
```

---

## 📂 Project Architecture

```text
├── src/                # Core engines (Broker proxy, Judge sandbox, Manager coordinator)
├── tasks/              # Controlled task specifications (fee calculation, date boundaries, etc.)
├── test/               # 85 automated test suites with high coverage
├── state/              # Durable experiment ledger (SQLite registry, budget ledger, protocol)
├── docs/               # Architecture specifications and empirical research reports
├── containers/         # Linux VM Docker configuration and process supervisor
└── package.json        # Project metadata and execution scripts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
