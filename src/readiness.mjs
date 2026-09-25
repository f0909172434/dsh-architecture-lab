// Live trials remain held by product gate until research protocol review and
// bounded canary trial are verified. Linux offline checks do not replace live canary acceptance.
export const liveBlockers = Object.freeze([
  '實機試驗協定審查與首輪四重奏試驗尚未完成驗收；Linux 離線驗證不代替實機驗收',
])

export function assertLiveReady() {
  if (liveBlockers.length) throw new Error(`實機試驗暫停：${liveBlockers.join('；')}。見 docs/pilot-analysis.md`)
}

// Everyday tasks have a separate product gate, never an alternate route for
// benchmark trials. Both use the original shared spending allowance.
export const dailyBlockers = Object.freeze(['日常付費任務實機冒煙尚未完成驗收'])
export function assertDailyReady(){
  if(dailyBlockers.length)throw new Error(`日常付費任務暫停：${dailyBlockers.join('；')}`)
}


