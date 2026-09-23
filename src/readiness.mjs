// GUI acceptance is still a product gate. Protocol acceptance is checked
// separately by loadReviewedProtocol(root) on every research launch, rather
// than a global boolean claiming every experiment directory has been reviewed.
export const liveBlockers = Object.freeze([
  'DSH 圖形介面尚未完成驗收；Linux 離線驗證不代替實際介面驗收',
])

export function assertLiveReady() {
  if (liveBlockers.length) throw new Error(`實機試驗暫停：${liveBlockers.join('；')}。見 docs/pilot-analysis.md`)
}

// Everyday tasks have a separate product gate, never an alternate route for
// benchmark trials. Both use the original shared spending allowance.
export const dailyBlockers=Object.freeze(['日常任務 DSH 圖形介面尚未完成驗收'])
export function assertDailyReady(){
  if(dailyBlockers.length)throw new Error(`日常付費任務暫停：${dailyBlockers.join('；')}`)
}
