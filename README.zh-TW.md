# DSH 架構實驗室

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

[公開原始碼](https://github.com/f0909172434/dsh-architecture-lab) · MIT · 開發預覽

[完整交付驗收對照表](docs/acceptance-status.md)：各項證據與尚未完成的要求。

比較記憶與規劃效果的本機 DSH 插件，重用 DSH、
[Engram](https://github.com/kenz1117/dsh-engram)、
[Plan-and-Execute](https://github.com/jimmyzhang219/dsh-plan-and-execute)
及 [dsh-eval-harness](https://github.com/BiBoyang/dsh-eval-harness)。

**目前為開發預覽，付費實驗仍暫停。** 四組已透過真實 DSH 工具、上游評測器、
獨立費用代理與隔離裁判，通過不使用憑證的整合驗證。模型回應為預先編寫的模擬資料，
只能證明整合可運作，不能用來比較架構效果。v1 試驗仍不合格；目前沒有有效的
勝負結論或穩定版。[Linux 驗證摘要](docs/linux-integration-results.json) · [里程碑](ROADMAP.md)。


比較報告與面板已按協定分開呈現四組配對差異、未完成組數與未知成本，並平衡
各組的執行位置。詳見[研究方法](docs/research-protocol.md)。歷史費用已用
供應商單日資料的保守上界核對；原始紀錄保留，逐筆費用仍未知。所有正式
實驗目錄共用原 NT$300 上限。圖形介面驗收仍阻擋付費開始；各實驗也必須有符合現況的協定收據。
[本版驗證](docs/dev9-validation.json)。

協定審查收據與試驗證據封存已實作。報告會核對啟動前審查、容器執行證明、外部測試及費用紀錄，不會只依資料庫中的合格旗標納入研究。詳見[審查流程](docs/protocol-review.md)；dev.9 的[實質單一代理方法審查](docs/method-review.md)已完成，並保留一份綁定確切輸入的本機收據；這不等於獨立最終審查或付費許可。

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

## 研究方法檢查點

本輪修正跨恢復截止時間、逐次呼叫的分位取整偏差、程序終止後的帳本鎖恢復，並核對
實際安裝的監管程式。六份參考解通過 54 個外部案例，六份原始缺陷均未通過；六份
初始記憶都只含共用歷史。費用估計保留小額差異，預留金額仍採保守上界。
目前仍沒有合格的真實模型比較結果。

[方法審查](docs/method-review.md) · [圖形驗收檢查表](docs/gui-acceptance.md)

## 日常任務預覽

面板已支援建立專案副本、自訂任務草稿、選擇配方、預覽變更、明確採用成果，以及
匯出至新資料夾。Engram 記憶按專案隔離，只有採用成果後才延續。固定離線 A/B/C/D
範例已驗證真實工具、取消及控制程序中斷後的恢復；不會代替模型執行自訂任務。
日常付費入口仍待驗收，開放後共用原有預算上限。
[操作與限制](docs/daily-mode.md) · [本版驗證](docs/dev9-validation.json)。

## 離線試用

在原始碼目錄使用 Node.js 24 以上版本及 Python 3：

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
npm run seed
npm run linux
npm run linux:supervisor
npm run linux:image
npm run check:linux-dsh
```

安裝會下載套件到專案獨立目錄，不更新全域 DSH，也不複製憑證。詳見
[安裝與回復](docs/installation.md)。[版本紀錄](versions.json)中，Harness latest
通道 0.1.5-rc.3 已放入 v2 獨立副本，舊試驗使用 rc.2；Engram 0.7.12、規劃插件
0.5.0、評測器 0.4.0。Desktop 0.17.0 已於 2026-09-24 核對官方校驗碼並安裝。

Engram 修補了人類訊息來源辨識，並對齊本機嵌入依賴。規劃插件修補了 rc.3
會話替換介面、系統訊息保留與會話快照更新；建置腳本會驗證固定來源與測試。
瀏覽器型別檢查與 declaration 產生已通過；真實圖形介面驗收仍未完成，詳見
[修補證據](docs/isolation-progress.md)。

DSH `/architecture-lab` 提供 `status`、`select`、`check`、`resume-check`、
`report`、`export`、`start`、`resume`、`batch`、`stop`。離線 `check` 使用模擬回應，
透過隔離評測器執行。配方選擇套用於下一次新試驗；取消、明確恢復、重新啟動後
讀回與匯出已通過原生指令驗證，恢復前後共用 12 次請求額度。日常模型會話與
付費開始仍暫停。專用側邊欄面板已通過原生 HTTP／模組接線測試，
畫面顯示與操作仍待驗收，詳見[面板說明](docs/web-panel.md)。

```sh
# 完成開發者安裝與合成記憶初始化（npm run seed）後：
npm run check:management
npm run check:commands
npm run check:memory
npm run check:web
```

預設使用獨立 Lima Linux 虛擬機，不使用 Parallels。映像缺少或來源變動時會停止，
不會自動改用原生執行。

記憶驗收已確認：透過真實 Engram 工具新增的合成標記可在本次找回，但全新的
B／D 試驗找不到，原始快照不變。輔助查詢改寫採相同模型與思考強度，也計入
請求帳本。[管理入口用法與證據](docs/management.md)。

**無介面 DSH 的位置參數即使長得像斜線指令，也可能被當成模型提示。**
終端機請用不經模型的 `npm run lab -- status` 或 `doctor` 查狀態。

專用 [Lima／Linux 虛擬環境](docs/linux-runtime.md)已通過八項真實容器測試，包含
脫離的子程序、取消、逾時，以及主機或虛擬機控制程式被強制終止。四組 DSH 配方、
受控模型通道、跨試驗記憶隔離，以及主控程式被強制終止後的明確恢復均已通過。
未知費用的預留不會被釋放。[容器驗證](docs/linux-results.json) · [整合驗證](docs/linux-integration-results.json)。

## 證據與限制

- [首輪分析](docs/pilot-analysis.md)：兩次不合格 pilot、確認的答案污染與驗收
  漏洞；不宣稱某種架構成功率較高。
- [隔離與記帳修補](docs/isolation-progress.md)：已測邊界、假供應商測試、相容性
  檢查意外呼叫事件及尚未通過的驗收項目。
- 原始會話、憑證、私人記憶、快取及費用帳本保留在本機忽略目錄。公開內容
  只有程式碼、合成任務、必要修補及經檢查的研究摘要。

採 [MIT 授權](LICENSE)，上游保留各自授權。貢獻時須保留預算上限、遇到不確定
狀態即停止的行為與負面結果；離線測試不等於實機介面驗收。

另行安裝的 Desktop 0.17.0 附有**僅限非商業用途**條件。本插件原始碼仍採 MIT，
不取代 Desktop 的限制；詳見[上游授權](THIRD_PARTY_NOTICES.md)。
