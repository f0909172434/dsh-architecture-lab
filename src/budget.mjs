import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CAP_TWD = 300
const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function validatePricing(data, now = Date.now()) {
  if (data?.provider !== 'deepseek-official' || data?.model !== 'deepseek-flash') throw new Error('price sheet does not match the pinned model')
  if (typeof data.source !== 'string' || !data.source.startsWith('https://')) throw new Error('price source is missing')
  if (typeof data.fxSource !== 'string' || !data.fxSource.startsWith('https://')) throw new Error('exchange-rate source is missing')
  const age = now - Date.parse(data.checkedAt)
  if (!Number.isFinite(age) || age < 0 || age > PRICE_MAX_AGE_MS) throw new Error('price or exchange rate is stale')
  for (const field of ['inputUsdPerMillion', 'cacheHitUsdPerMillion', 'outputUsdPerMillion', 'usdTwd']) {
    if (!Number.isFinite(data[field]) || data[field] <= 0) throw new Error(`invalid ${field}`)
  }
  if (data.inputUsdPerMillion < 0.3 || data.outputUsdPerMillion < 1.2) throw new Error('price below validated floor; recheck before spending')
  if (data.cacheHitUsdPerMillion > data.inputUsdPerMillion) throw new Error('cache price exceeds ordinary input price')
  return data
}

export function requestUpperBound(options, pricing) {
  if (options.provider !== pricing.provider || options.model !== pricing.model) throw new Error('unpriced model route')
  if (options.reasoningEffort !== 'high') throw new Error('trial model effort is not pinned to high')
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1) throw new Error('missing explicit output-token limit')
  if (options.maxTokens > 4096) throw new Error('trial output-token limit exceeds 4096')
  const payload = JSON.stringify({ messages: options.messages, system: options.system, tools: options.tools })
  const messagePayload = JSON.stringify(options.messages)
  if (!payload || /"type"\s*:\s*"(image|file|audio|video)"/.test(messagePayload)) throw new Error('non-text request requires separate pricing')
  const inputTokensUpper = Buffer.byteLength(payload, 'utf8') * 2
  const retriesUpper = 6
  return Math.ceil(retriesUpper * (inputTokensUpper * pricing.inputUsdPerMillion + options.maxTokens * pricing.outputUsdPerMillion) / 1_000_000 * pricing.usdTwd * 100) / 100
}

export async function withLedger(root, fn) {
  await mkdir(root, { recursive: true })
  const lockPath = join(root, 'budget.lock')
  let lock
  try { lock = await open(lockPath, 'wx') } catch (error) {
    if (error.code === 'EEXIST') throw new Error('budget ledger is locked; no call dispatched')
    throw error
  }
  try {
    const path = join(root, 'budget.json')
    let ledger
    try { ledger = JSON.parse(await readFile(path, 'utf8')) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      ledger = { capTwd: CAP_TWD, entries: [] }
    }
    const result = await fn(ledger)
    const temp = `${path}.${process.pid}.tmp`
    await writeFile(temp, JSON.stringify(ledger, null, 2) + '\n')
    await rename(temp, path)
    return result
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

export async function reserve(root, trialId, amountTwd) {
  if (!trialId || !Number.isFinite(amountTwd) || amountTwd <= 0) throw new Error('invalid budget reservation')
  return withLedger(root, async (ledger) => {
    if (ledger.capTwd !== CAP_TWD) throw new Error('budget cap changed')
    const committed = ledger.entries.reduce((sum, entry) => sum + entry.reservedTwd, 0)
    const calls = ledger.entries.filter((entry) => entry.trialId === trialId).length
    if (calls >= 12) throw new Error('trial request limit reached')
    if (committed + amountTwd > CAP_TWD) throw new Error('NT$300 budget would be exceeded')
    const id = `${Date.now()}-${process.pid}-${calls}`
    ledger.entries.push({ id, trialId, reservedTwd: amountTwd, status: 'reserved', at: new Date().toISOString() })
    return id
  })
}

export async function settle(root, id, usage, pricing) {
  return withLedger(root, async (ledger) => {
    const entry = ledger.entries.find((row) => row.id === id)
    if (!entry || entry.status !== 'reserved') throw new Error('unknown or settled reservation')
    const input = usage?.inputTokens
    const output = usage?.outputTokens
    const cacheRead = usage?.cacheReadTokens ?? 0
    // Harness TokenUsage reports cache misses and cache reads as disjoint
    // counts. DeepSeek's raw prompt_tokens includes both, but the adapter
    // subtracts cache hits before emitting inputTokens.
    if (![input, output, cacheRead].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      entry.status = 'unmetered'
      return entry
    }
    const actual = (input * pricing.inputUsdPerMillion + cacheRead * pricing.cacheHitUsdPerMillion + output * pricing.outputUsdPerMillion) / 1_000_000 * pricing.usdTwd
    entry.actualTwd = Math.ceil(actual * 100) / 100
    entry.usage = { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead }
    entry.status = 'metered'
    // Reservations remain charged until the run is audited. This prevents missing
    // usage or retries inside an adapter from releasing budget prematurely.
    return entry
  })
}

export async function loadPricing(root) {
  return validatePricing(JSON.parse(await readFile(join(root, 'pricing.json'), 'utf8')))
}

export function budgetRoot() {
  const root = process.env.DSH_ARCH_LAB_ROOT
  if (!root) throw new Error('DSH_ARCH_LAB_ROOT is required for isolated trials')
  return root
}
