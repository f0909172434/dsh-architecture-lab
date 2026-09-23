# Archived v1 setup and pilot record

This document describes the historical rc.2 prototype. It is not the current installation guide. See the root README and [repair evidence](isolation-progress.md).

# DSH 架構實驗室（開發中）

本專案在獨立 DSH home 中比較四種組合：A 原生、B 原生＋Engram、C 原生＋Plan-and-Execute、D 原生＋兩者。目前完成 A/B 各一次付費 pilot；深入分析確認跨試驗讀取和外部驗收漏洞，**新的付費試驗已在程式入口暫停**，尚無有效的架構比較結論。詳見 [首輪分析](docs/pilot-analysis.md)；執行 `npm run audit:pilots` 可離線重現證據。

本插件將以 **MIT 授權在 GitHub 開源**；公開儲存庫、可重現安裝與離線測試都列入 [v0.1 完成條件](ROADMAP.md)。目前仍在本機開發，尚未公開發布。

## 版本與隔離

已驗證的宿主是 Desktop 0.15.9 / Harness 0.1.5-rc.2。實驗 profile 使用 Engram 0.7.12、Plan-and-Execute 0.5.0、GitHub 評測器 0.4.0（commit `bccfc67aa72380950fb2062e00289ab83f78b60a` 加上本專案的相容性 patch）。Harness 的 `@deepseek-ai/cordis` 是宿主內建 4.0.2；不要只單獨更新它，應隨完整 Harness 發行版升級。`next` / `alpha` 版不作為首輪穩定基線。

所有實驗資料在 `state/`，沒有複製正式 DSH 會話。Engram 的 `dbDir`、模型快取與自動攝取皆明確設定；每題有獨立初始快照，每次試驗再複製一份。但 DSH 的 `workspace-write` 僅限制寫入，**不是跨試驗的讀取隔離**；目前也會發現使用者共用的 skill 摘要。`tasks/` 的驗收程式雖在 Agent 工作區外，直接 import 候選程式仍可被其提早退出略過。因此在修正前不得將這個環境稱為已驗證隔離。`state/` 與 `upstream/` 不進 Git；評測器差異保存在 `patches/`。

## 準備與操作

在本目錄執行：

```sh
npm run evaluator
npm run profiles
npm run seed
npm run pricing
npm test
npm run lab -- doctor
npm run lab -- prepare
```

`npm run lab -- prepare` 只建立 72 個試驗身分（六題、四組、三次），不啟動模型。`npm run lab -- doctor` 顯示版本、價格資料與尚待驗收的項目。`npm run pricing` 會從 DeepSeek 官方價目與當日 USD/TWD 匯率重新讀取峰時價格，有效 24 小時；缺少或過期時模型呼叫前即停止。

啟動隔離 DSH 網頁：

```sh
DSH_HOME=<project-directory>/state/dsh-home dsh --profile lab-web --no-open
```

這是實驗管理入口。日常任務可先用 `/architecture-lab select A/B/C/D` 選配方，關閉舊服務，再執行 `npm run web`；啟動器會開啟與所選配方一致的獨立網頁 profile，並自選空閒連接埠。B/D 的日常 profile 提供 Engram 工具，背景攝取與自動画像注入關閉；要使用記憶時需明確呼叫 Engram 檢索。C/D 可使用既有 `/plan-and-execute`。批次評測的 B/D 仍保留固定快照的單 Agent 注入設定。

在該介面輸入 `/architecture-lab status`、`select A`、`report`、`export <絕對路徑>`、`start A debug-amount 1`、`batch`、`stop`，或在中斷後輸入 `resume A debug-amount 1`。`start` 每次只跑一個指定題目與重複次數，會調用對應的隔離 profile；CLI 等價指令為 `npm run lab -- run-one debug-amount 1 A`。`batch` 依交錯順序逐一執行最多 72 次，遇到預算、價格或試驗錯誤便停止，CLI 等價指令為 `npm run lab -- run-batch`。`resume` 從原始題目與記憶快照重新執行，保留舊中斷證據並標成新 run，不會接續同一段模型輸出。其 CLI 指令為 `npm run lab -- resume-one debug-amount 1 A`。目前 `select` 記錄偏好，**不會熱切換現有對話中的 Engram／規劃插件**；日常任務要使用對應配方 profile。網頁入口載入三個插件供實驗管理，不代表既有對話已切到所選配方。

使用者已授權從正式 DSH 憑證庫**只複製 DeepSeek 金鑰**到隔離 `state/dsh-home/.credentials.yaml`；檔案權限為 `600`，不進 Git。實驗入口僅檢查隔離檔案有無金鑰，DSH 自行解析憑證，金鑰不會放進子程序環境變數。輪替正式金鑰時需另行同步隔離副本。每次試驗的 12 次模型請求上限和累計 NT$300 上限由 `llm/stream` 呼叫前的持久預留控制；缺少價格、匯率、明確輸出 token 上限、未知模型或非文字輸入會拒絕呼叫。內部重試採六倍費用預留且保留到人工稽核，因此可能提早停用預算。Harness 的 `inputTokens`（快取未命中）與 `cacheReadTokens`（快取命中）為分離計數；未知用量保留預留額、不推算為零。每次 DSH 子程序上限 9 分 10 秒，外部測試另有 30 秒上限，保留時間供啟動和報告落盤。

## 證據與限制

每次執行留下上游 `report.json`、會話軌跡、工作區、外部測試結果與費用紀錄。`npm run lab -- report` 匯出比較 JSON，並附上 `comparisonReadiness` 阻擋原因。舊摘要只對 `completed` 計算成功率，將額度耗盡排除出分母有偏差，需在新協定改為分開記錄客觀測試、正常收尾、終止原因及證據有效性；現有值保留作診斷，不能當成有效成功率。摘要另外列出所有試驗的外部測試通過次數、已觀測成本、未計量試驗、保守預留和總耗時。正常 `start` 拒絕覆寫既有試驗；`resume` 僅在最後一筆為中斷時允許，並保留原始證據。強制終止程序後的完整恢復仍須另行驗證。

已通過離線測試：六題原始缺陷都能被外部測試抓到；評測器重建題目與記憶、辨識現行 DSH `session.v3.jsonl.zstd`，取消時停止子程序並保存中斷報告；四個 profile 能組合；C/D 的真實 `/plan-and-execute` 命令會進入 `planning`；Engram 六題快照各有一筆記憶。付費小試驗 `debug-amount-A-1` 與 `debug-amount-B-1` 的外部測試都通過，但 Agent 修正後仍繼續推理，兩者均達到 12 次請求上限而以 `unavailable` 結束，**其舊狀態保留作診斷，不能當成有效架構比較**。A 組帳本保守預留 NT$78.02，其中多筆快取用量因初版計價程式誤認為重疊計數而標記 `unmetered`；程式已修正，舊紀錄保留原貌，並另存會話軌跡用量核對報告。B 組 12 次請求全部計量，模型用量約 NT$0.68，保守預留 NT$157.27。兩組累計預留 NT$235.29。尚未核對供應商實際帳單，也尚未驗證規劃審閱卡於付費模型下完成整個流程，或在瀏覽器畫面確認實驗室指令與結果面板。瀏覽器工具因管理員安全檢查無法存取本機網頁，故不將伺服器啟動等同於 UI 驗收。

曾有一次隔離試載入在設定 `dbDir` 前，Engram 0.7.12 使用其預設 `~/.dsh/engram`，正式 `user.db` 修改時間因此更新。未覆寫或回復該資料庫；之後所有 profile 均明確指定實驗資料目錄，重新載入只寫入該目錄。要回復本實驗的安裝，停止實驗網頁／試驗程序，移走 `state/dsh-home/profiles/lab-*` 與 `state/engram` 即可；正式 profile 未安裝本插件。保留 `state/runs`、`state/snapshots`、`state/budget.json` 可供稽核。

後續先修正讀取隔離、可信裁判與計量，再依 [首輪分析](docs/pilot-analysis.md) 固定新協定、修正收尾與分類，最後完成 C/D 小試驗及實機 UI 驗收。先前把兩次停止歸因於模型不會結束並不準確；兩組均由第 13 次請求前的本機限額終止，沒有觀察到無限循環。B 證實新快取計量有紀錄，但其答案已受到 A 組污染。測試模型固定 DeepSeek Flash／high；Codex 例行實作用 GPT-6 Sol／Medium，實驗方法與結果判讀用 GPT-6 Astra／High。
