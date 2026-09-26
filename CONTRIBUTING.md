# Contributing to DSH Architecture Lab

Thank you for your interest in contributing to DSH Architecture Lab! We welcome improvements, bug reports, and research discussions that enhance the reliability, safety, and reproducibility of autonomous agent architectures.

---

## 🛠️ Development & Environment

- **Runtime**: Node.js 24 or newer.
- **Verification**: Run local tests anytime without requiring external API keys:
  ```bash
  npm test
  npm run lab -- doctor
  ```
- **Virtualization Support**: Standard unit tests execute portably across macOS and Linux. Containerized integration tests utilize the dedicated Lima Linux VM environment.
- Refer to [Installation Guide](docs/installation.md) for full setup instructions.

---

## 🧪 Testing & Code Standards

- **Reliability First**: When submitting fixes for containment, token accounting, or execution state, please include automated regression tests covering the expected behavior.
- **Protocol Integrity**: Research tasks, pricing formulas, and baseline configurations are cryptographically tracked under research protocols to maintain empirical consistency.
- **Upstream Coordination**: When contributing patches for upstream components, ensure upstream attribution is preserved and patch hashes are recorded.

---

## 🌐 Documentation & Community

- **Multilingual Support**: Please keep changes to core documentation synchronized across English (`README.md`), Traditional Chinese (`README.zh-TW.md`), and Simplified Chinese (`README.zh-CN.md`).
- **Privacy & Security**: Keep credentials, personal environment paths, and local session traces safe and local. If you identify sensitive security issues, please share details responsibly with the project maintainers.

---

We appreciate your collaborative efforts to make autonomous AI agent architectures safer, faster, and more reproducible!
