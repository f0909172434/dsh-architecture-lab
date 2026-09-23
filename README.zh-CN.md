# DSH 架构实验室

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

[公开源码](https://github.com/f0909172434/dsh-architecture-lab) · MIT · 开发预览

比较记忆与规划效果的本地 DSH 插件，复用 DSH、
[Engram](https://github.com/kenz1117/dsh-engram)、
[Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute)
及 [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness)。

**目前为开发预览，付费实验仍暂停。** 四组已通过真实 DSH 工具、上游评测器、
独立费用代理和隔离评判器，完成不使用凭证的集成验证。模型回复为预先编写的模拟数据，
只能证明集成可运行，不能用于比较架构效果。v1 试验仍不合格；目前没有有效的
胜负结论或稳定版。[验证摘要](docs/integration-results.json) · [里程碑](ROADMAP.md)。

| 配方 | 记忆 | 规划 |
| --- | --- | --- |
| A | 原生 DSH | 原生 DSH |
| B | Engram | 原生 DSH |
| C | 原生 DSH | Plan-and-Execute |
| D | Engram | Plan-and-Execute |

目标为六个合成编程任务、四种配方、各三次独立运行，共 72 次目标试验。实际
次数受累计 NT$300、每次 12 次模型请求及 10 分钟限制；模型固定 DeepSeek
Flash／high。客观正确性、模型宣称完成、终止原因、证据有效性、耗时及成本分别
展示。这些实验不能证明 AGI 或持续学习已经实现。

## 离线试用

在源码目录使用 Node.js 24 以上版本：

```sh
npm test
npm run lab -- doctor
```

不需要 API 密钥、供应商账号、安装依赖或上游项目。内核隔离测试需要 macOS；其他
系统运行可移植测试，明确显示隔离后端不受支持，不会退回无隔离执行。`doctor`
不会调用模型。

## 开发者安装

```sh
npm run runtime
npm run evaluator
npm run engram
npm run planner
npm run profiles
```

安装会下载软件包到项目独立目录，不更新全局 DSH，也不复制凭证。详见
[安装与恢复](docs/installation.md)。[版本记录](versions.json)中，Harness latest
通道 0.1.5-rc.3 已放入 v2 独立副本，旧试验使用 rc.2；Engram 0.7.12、规划插件
0.5.0、评测器 0.4.0。Desktop 是否为最新版尚未重新确认。

Engram 修复了人类消息来源识别，并对齐本地嵌入依赖。规划插件修复了 rc.3
会话替换接口、系统消息保留与会话快照更新；构建脚本会验证固定来源与测试。
浏览器类型检查及真实图形界面验收仍未完成，详见[修复证据](docs/isolation-progress.md)。

DSH `/architecture-lab` 界面提供 `status`、`select`、`report`、`export`、`start`、
`resume`、`batch`、`stop`。目前所有模型调用与启动试验均会被暂停机制拒绝。
选择配方只记录偏好，实际切换需另开对应 profile。**无界面 DSH 的位置参数即使
看起来像斜线命令，也可能被当作模型提示。** 终端中查询状态请用不经过模型的
`npm run lab -- status` 或 `doctor`。

## 证据与限制

- [首轮分析](docs/pilot-analysis.md)：两次不合格 pilot、确认的答案污染与验收
  漏洞；不宣称某种架构成功率更高。
- [隔离与记账修补](docs/isolation-progress.md)：已测边界、假供应商测试、兼容性
  检查意外调用事件及尚未通过的验收项目。
- 原始会话、凭证、私人记忆、缓存及费用账本保留在本地忽略目录。计划公开内容
  只有源码、合成任务、必要补丁及经过检查的研究摘要。

采用 [MIT 许可证](LICENSE)，上游保留各自许可证。贡献时须保留预算上限、遇到
不确定状态即停止的行为与负面结果；离线测试不等于实际界面验收。
