// Confirmed by the 2026-09-23 offline audit. This is a code-level hold, not a
// user approval gate: remove it only alongside verified isolation and judging
// fixes. Existing evidence and reports remain readable while trials are held.
export const liveBlockers = Object.freeze([
  'v2 研究協定尚未完成審查與凍結',
  'DSH 圖形介面尚未完成驗收；Linux 離線驗證不代替實際介面驗收',
])

export function assertLiveReady() {
  if (liveBlockers.length) throw new Error(`實機試驗暫停：${liveBlockers.join('；')}。見 docs/pilot-analysis.md`)
}

// Everyday tasks have a separate product gate, never an alternate route for
// benchmark trials. Both use the original shared spending allowance.
export const dailyBlockers=Object.freeze(['日常任務流程與 DSH 圖形介面尚未完成驗收'])
export function assertDailyReady(){
  if(dailyBlockers.length)throw new Error(`日常付費任務暫停：${dailyBlockers.join('；')}`)
}
