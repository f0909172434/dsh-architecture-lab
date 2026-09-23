import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePricing } from '../src/budget.mjs'

const source = 'https://api-docs.deepseek.com/quick_start/pricing/'
const fxSource = 'https://open.er-api.com/v6/latest/USD'
const [pricingResponse, fxResponse] = await Promise.all([fetch(source, { signal: AbortSignal.timeout(15_000) }), fetch(fxSource, { signal: AbortSignal.timeout(15_000) })])
if (!pricingResponse.ok || !fxResponse.ok) throw new Error('pricing or FX source unavailable')
const html = await pricingResponse.text()
const text = html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ')
const modelSection = text.slice(text.indexOf('MODEL deepseek-flash'), text.indexOf('Concurrency Limit'))
if (!modelSection.includes('DeepSeek-V4.1-Flash')) throw new Error('unexpected DeepSeek model version or table layout')
function peak(label) {
  const escaped = label.replace(/[()]/g, '\\$&')
  const match = modelSection.match(new RegExp(`${escaped} OFF-PEAK \\$[0-9.]+ \\$[0-9.]+ PEAK \\$([0-9.]+) \\$([0-9.]+)`))
  if (!match) throw new Error(`cannot parse ${label} peak rate`)
  return Number(match[1])
}
const fx = await fxResponse.json()
if (fx.result !== 'success' || !Number.isFinite(fx.rates?.TWD)) throw new Error('invalid FX response')
const data = validatePricing({
  provider: 'deepseek-official', model: 'deepseek-flash', modelVersion: 'DeepSeek-V4.1-Flash',
  source, fxSource, fxAsOf: fx.time_last_update_utc, checkedAt: new Date().toISOString(),
  cacheHitUsdPerMillion: peak('1M INPUT TOKENS (CACHE HIT)'),
  inputUsdPerMillion: peak('1M INPUT TOKENS (CACHE MISS)'),
  outputUsdPerMillion: peak('1M OUTPUT TOKENS'),
  usdTwd: fx.rates.TWD,
})
const root = fileURLToPath(new URL('../state/', import.meta.url))
await mkdir(root, { recursive: true })
await writeFile(join(root, 'pricing.json'), JSON.stringify(data, null, 2) + '\n')
console.log(`Verified peak DeepSeek Flash prices and USD/TWD ${data.usdTwd}; valid for 24 hours.`)
