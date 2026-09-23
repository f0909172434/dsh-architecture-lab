# DSH 架構實驗室

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

比較記憶與規劃效果的本機 DSH 插件，重用 DSH、
[Engram](https://github.com/kenz1117/dsh-engram)、
[Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute)
及 [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness)。

**目前為開發預覽，付費實驗仍暫停。** 四組已透過真實 DSH 工具、上游評測器、
獨立費用代理與隔離裁判，通過不使用憑證的整合驗證。模型回應為預先編寫的模擬資料，
只能證明整合可運作，不能用來比較架構效果。v1 試驗仍不合格；目前沒有有效的
勝負結論或穩定版。[驗證摘要](docs/integration-results.json) · [里程碑](ROADMAP.md)。

| 配方 | 記憶 | 規劃 |
| --- | --- | --- |
| A | 原生 DSH | 原生 DSH |
| B | Engram | 原生 DSH |
| C | 原生 DSH | Plan-and-Execute |
| D | Engram | Plan-and-Execute |

目標為六個合成程式任務、四種配方、各三次獨立執行，共 72 次目標試驗。實際
次數受累計 NT$300、每次 12 次模型請求及 10 分鐘限制；模型固定 DeepSeek
Flash／high。客觀正確性、模型宣稱完成、終止原因、證據有效性、耗時及成本分開
呈現。這些試驗不能證明 AGI 或持續學習已實現。

## 離線試用

在原始碼目錄使用 Node.js 24 以上版本：

```sh
npm test
npm run lab -- doctor
```

不需 API 金鑰、供應商帳號、安裝依賴或上游專案。核心隔離測試需要 macOS；其他
系統執行可攜式測試，明確顯示隔離後端不受支援，不會退回無隔離執行。`doctor`
不會呼叫模型。

## 開發者安裝

```sh
npm run runtime
npm run evaluator
npm run engram
npm run planner
npm run profiles
```

安裝會下載套件到專案獨立目錄，不更新全域 DSH，也不複製憑證。詳見
[安裝與回復](docs/installation.md)。[版本紀錄](versions.json)中，Harness latest
通道 0.1.5-rc.3 已放入 v2 獨立副本，舊試驗使用 rc.2；Engram 0.7.12、規劃插件
0.5.0、評測器 0.4.0。Desktop 是否為最新版尚未重新確認。

Engram 修補了人類訊息來源辨識，並對齊本機嵌入依賴。規劃插件修補了 rc.3
會話替換介面、系統訊息保留與會話快照更新；建置腳本會驗證固定來源與測試。
瀏覽器型別檢查及真實圖形介面驗收仍未完成，詳見[修補證據](docs/isolation-progress.md)。

DSH `/architecture-lab` 介面提供 `status`、`select`、`report`、`export`、`start`、
`resume`、`batch`、`stop`。目前所有模型呼叫與開始試驗均會被暫停機制拒絕。
選配方只記錄偏好，實際切換需另開對應 profile。**無介面 DSH 的位置參數即使
長得像斜線指令，也可能被當成模型提示。** 終端機查狀態請用不經模型的
`npm run lab -- status` 或 `doctor`。

## 證據與限制

- [首輪分析](docs/pilot-analysis.md)：兩次不合格 pilot、確認的答案污染與驗收
  漏洞；不宣稱某種架構成功率較高。
- [隔離與記帳修補](docs/isolation-progress.md)：已測邊界、假供應商測試、相容性
  檢查意外呼叫事件及尚未通過的驗收項目。
- 原始會話、憑證、私人記憶、快取及費用帳本保留在本機忽略目錄。公開內容
  只有程式碼、合成任務、必要修補及經檢查的研究摘要。

採 [MIT 授權](LICENSE)，上游保留各自授權。貢獻時須保留預算上限、遇到不確定
狀態即停止的行為與負面結果；離線測試不等於實機介面驗收。
