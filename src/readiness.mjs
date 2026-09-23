// Confirmed by the 2026-09-23 offline audit. This is a code-level hold, not a
// user approval gate: remove it only alongside verified isolation and judging
// fixes. Existing evidence and reports remain readable while trials are held.
export const liveBlockers = Object.freeze([
  'v2 研究協定尚未完成審查與凍結',
  '異常退出後的子程序清理與 DSH 圖形介面尚未完成驗收',
  '歷史與意外呼叫費用尚待核對，NT$300 預留額度維持不變',
])

export function assertLiveReady() {
  if (liveBlockers.length) throw new Error(`實機試驗暫停：${liveBlockers.join('；')}。見 docs/pilot-analysis.md`)
}
