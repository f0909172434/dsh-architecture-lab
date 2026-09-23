import { createHash, randomUUID } from 'node:crypto'
import { withLedger, validatePricing } from '../budget.mjs'

const roundUp = amount => Math.ceil(amount * 100) / 100
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// A durable clock exists even when a controller dies before its first dispatch.
// A restart may shorten this clock, but can never extend it.
export async function claimTrialDeadline(root,trialId,requestedDeadline,now=Date.now()){
  if(typeof trialId!=='string'||!trialId||!Number.isSafeInteger(requestedDeadline)||requestedDeadline>now+600000)throw new Error('invalid trial deadline')
  return withLedger(root,ledger=>{
    committedTwd(ledger)
    ledger.trialDeadlines??=[]
    if(!Array.isArray(ledger.trialDeadlines))throw new Error('invalid durable deadlines')
    const clocks=ledger.trialDeadlines.filter(row=>row.trialId===trialId)
    if(clocks.length>1||clocks.some(row=>!Number.isSafeInteger(row.deadlineAt)))throw new Error('invalid durable trial deadline')
    const old=ledger.entries.filter(row=>row.trialId===trialId).map(row=>Date.parse(row.at)+600000)
    if(old.some(value=>!Number.isFinite(value)))throw new Error('invalid original dispatch time')
    const deadlineAt=Math.min(requestedDeadline,clocks[0]?.deadlineAt??Infinity,...old)
    if(deadlineAt<=now)throw new Error('trial deadline reached')
    if(clocks.length)clocks[0].deadlineAt=deadlineAt
    else ledger.trialDeadlines.push({trialId,deadlineAt})
    return deadlineAt
  })
}

/** Legacy reservations stay charged unless covered by a reviewed provider
 * aggregate bound. Verified v2 dispatches settle individually; an interrupted
 * or ambiguous dispatch keeps its bound.
 */
export function committedTwd(ledger) {
  if (ledger?.capTwd !== 300 || !Array.isArray(ledger.entries)) throw new Error('invalid budget ledger')
  const covered=new Set()
  let grouped=0
  for(const group of ledger.reconciliations??[]){
    if(group.kind!=='provider-window-upper-bound-v1'||!Array.isArray(group.coveredEntryIds)||!group.coveredEntryIds.length||!Number.isFinite(group.chargedUpperBoundTwd)||group.chargedUpperBoundTwd<=0)throw new Error('invalid historical reconciliation')
    const p=group.calculation
    if(!p||!Number.isFinite(p.displayedCny)||p.displayedCny<0||p.displayUnitCny!==.01||!Number.isFinite(p.cnyToTwd)||p.cnyToTwd<=0||p.fxMargin!==1.1||group.chargedUpperBoundTwd!==Math.ceil((p.displayedCny+p.displayUnitCny)*p.cnyToTwd*p.fxMargin))throw new Error('invalid reconciliation bound')
    const entries=group.coveredEntryIds.map(id=>{
      const matches=ledger.entries.filter(entry=>entry.id===id)
      if(matches.length!==1||covered.has(id)||matches[0].accountingVersion===2)throw new Error('invalid reconciliation coverage')
      covered.add(id);return matches[0]
    })
    if(fingerprint(entries)!==group.coveredEntriesSha256||group.chargedUpperBoundTwd>entries.reduce((sum,row)=>sum+row.reservedTwd,0)||!Array.isArray(group.evidence)||!group.evidence.length||group.evidence.some(row=>!/^([a-f0-9]{64})$/.test(row.sha256??'')))throw new Error('historical evidence changed')
    grouped+=group.chargedUpperBoundTwd
  }
  return ledger.entries.reduce((sum, entry) => {
    if (!Number.isFinite(entry.reservedTwd) || entry.reservedTwd <= 0) throw new Error('invalid reservation')
    if(covered.has(entry.id))return sum
    if (entry.accountingVersion === 2 && entry.status === 'metered') {
      if (!Number.isFinite(entry.actualTwd) || entry.actualTwd < 0) throw new Error('invalid metered cost')
      return sum + entry.actualTwd
    }
    return sum + entry.reservedTwd
  }, grouped)
}

export function dispatchBound(body, pricing) {
  validatePricing(pricing)
  if (body.model !== 'deepseek-flash' || body.reasoning_effort !== 'high' || body.thinking?.type !== 'enabled') throw new Error('unpinned model or reasoning')
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 4096) throw new Error('invalid output limit')
  // UTF-8 byte count bounds text tokenization; an extra framing allowance
  // covers role/tool protocol tokens. No hidden SDK retry multiplier: the
  // broker performs exactly one fetch per durable reservation.
  const inputBound = Buffer.byteLength(JSON.stringify(body)) * 2 + 4096
  return roundUp((inputBound * pricing.inputUsdPerMillion + body.max_tokens * pricing.outputUsdPerMillion) / 1e6 * pricing.usdTwd)
}

export async function reserveDispatch(root, trialId, body, pricing, now = Date.now()) {
  if (typeof trialId !== 'string' || !trialId.length) throw new Error('missing trial identity')
  const reservedTwd = dispatchBound(body, pricing)
  return withLedger(root, ledger => {
    const committed = committedTwd(ledger)
    if (ledger.entries.some(entry => entry.boundExceeded)) throw new Error('reservation bound exceeded; audit required')
    const prior = ledger.entries.filter(entry => entry.trialId === trialId)
    const clocks=(ledger.trialDeadlines??[]).filter(row=>row.trialId===trialId)
    if(clocks.length>1||clocks.some(row=>!Number.isSafeInteger(row.deadlineAt)||now>=row.deadlineAt))throw new Error('trial deadline reached')
    if (prior.length >= 12) throw new Error('trial request limit reached')
    if (prior.some(entry => !Number.isFinite(Date.parse(entry.at)) || now >= Date.parse(entry.at) + 600_000)) throw new Error('trial deadline reached')
    if (committed + reservedTwd > 300) throw new Error('NT$300 budget would be exceeded')
    const entry = { id: randomUUID(), trialId, accountingVersion: 2, reservedTwd, status: 'reserved', at: new Date(now).toISOString(), requestSha256: fingerprint(body), pricingSha256: fingerprint(pricing), pricing: { ...pricing } }
    ledger.entries.push(entry)
    return entry
  })
}

export function parseRawUsage(usage) {
  const input = usage?.prompt_tokens, output = usage?.completion_tokens
  const hits = usage?.prompt_cache_hit_tokens, misses = usage?.prompt_cache_miss_tokens
  if (![input, output, hits, misses].every(x => Number.isSafeInteger(x) && x >= 0) || hits + misses !== input) return null
  if (usage.total_tokens !== undefined && usage.total_tokens !== input + output) return null
  return { inputTokens: misses, cacheReadTokens: hits, outputTokens: output }
}

export async function settleDispatch(root, id, rawUsage, { complete = false, requestId = null } = {}) {
  return withLedger(root, ledger => {
    committedTwd(ledger)
    const entry = ledger.entries.find(row => row.id === id)
    if (entry?.accountingVersion !== 2 || entry.status !== 'reserved') throw new Error('unknown dispatch reservation')
    const usage = complete ? parseRawUsage(rawUsage) : null
    entry.requestId = typeof requestId === 'string' ? requestId.slice(0, 200) : null
    if (!usage) { entry.status = 'unmetered'; return entry }
    const p = entry.pricing
    entry.usage = usage
    entry.rawUsage = rawUsage
    entry.costPolicy = 'token-rates-unrounded-v1'
    entry.estimatedUsd = (usage.inputTokens * p.inputUsdPerMillion + usage.cacheReadTokens * p.cacheHitUsdPerMillion + usage.outputTokens * p.outputUsdPerMillion) / 1e6
    entry.actualTwd = entry.estimatedUsd * p.usdTwd
    entry.boundExceeded = entry.actualTwd > entry.reservedTwd
    entry.status = 'metered'
    return entry
  })
}
