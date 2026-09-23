import { createHash, randomUUID } from 'node:crypto'
import { withLedger, validatePricing } from '../budget.mjs'

const roundUp = amount => Math.ceil(amount * 100) / 100
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Full legacy reservations stay charged. Only verified v2 HTTP dispatches
 * release unused headroom; an interrupted/ambiguous dispatch keeps its bound.
 */
export function committedTwd(ledger) {
  if (ledger?.capTwd !== 300 || !Array.isArray(ledger.entries)) throw new Error('invalid budget ledger')
  return ledger.entries.reduce((sum, entry) => {
    if (!Number.isFinite(entry.reservedTwd) || entry.reservedTwd <= 0) throw new Error('invalid reservation')
    if (entry.accountingVersion === 2 && entry.status === 'metered') {
      if (!Number.isFinite(entry.actualTwd) || entry.actualTwd < 0) throw new Error('invalid metered cost')
      return sum + entry.actualTwd
    }
    return sum + entry.reservedTwd
  }, 0)
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
    entry.actualTwd = roundUp((usage.inputTokens * p.inputUsdPerMillion + usage.cacheReadTokens * p.cacheHitUsdPerMillion + usage.outputTokens * p.outputUsdPerMillion) / 1e6 * p.usdTwd)
    entry.boundExceeded = entry.actualTwd > entry.reservedTwd
    entry.status = 'metered'
    return entry
  })
}
