export const tasks = [
  { id: 'debug-amount', category: 'general-debug', prompt: '修正 index.mjs 的 normalizeAmount。接受有限數字或十進位數字字串；字串可有正負號、小數點、首尾空白，以及合法三位一組的千分位逗號。整數部分須有數字，若有小數點，其後須有數字；不接受科學記號。空字串、不合法逗號分組、轉換後非有限值或其他型別回傳 null；有效值回傳數字。執行測試並說明結果。' },
  { id: 'debug-ranges', category: 'general-debug', prompt: '修正 index.mjs 的 mergeRanges。閉區間只要相交或端點相接就必須合併；輸出按起點排序。執行測試並說明結果。' },
  { id: 'reuse-config', category: 'cross-session-reuse', prompt: '修正 index.mjs 的 resolveConfig。使用者設定覆蓋預設值，巢狀 flags 只覆蓋提供的鍵。請閱讀 history.md，但自行確認目前規格。' },
  { id: 'reuse-slug', category: 'cross-session-reuse', prompt: '修正 index.mjs 的 slugify。移除首尾空白並轉小寫；連續空白（含定位字元與換行）及連字號需合併成單一連字號；重音拉丁字母應保留可搜尋的 ASCII 基底；空字串回傳空字串。請閱讀 history.md，但自行驗證實作。' },
  { id: 'stale-fee', category: 'stale-experience', prompt: '現行規則：serviceFee 使用 8%，金額以分為整數計算，結果四捨五入到整分。修正 index.mjs。history.md 可能描述舊規則，請以這段現行規則為準。' },
  { id: 'stale-date', category: 'stale-experience', prompt: '現行規則：parseDay 接受 YYYY-MM-DD，回傳 UTC 午夜的毫秒時間；不合法日期回傳 null。修正 index.mjs。history.md 可能描述舊規則，請以這段現行規則為準。' },
]

export function task(id) {
  const found = tasks.find((item) => item.id === id)
  if (!found) throw new Error(`unknown task ${id}`)
  return found
}
