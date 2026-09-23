// Private, offline reconstruction only. No credential access or DSH invocation.
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { decodeZstdLog, scanZstdFrames } from '../upstream/dsh-eval-harness/lib/zstd.js'

const [traceArg, stateArg = 'state'] = process.argv.slice(2)
if (!traceArg) throw new Error('usage: node scripts/audit-compatibility-incident.mjs <trace> [state-directory]')
const trace = resolve(traceArg), root = resolve(stateArg)
const bytes = await readFile(trace)
if (scanZstdFrames(bytes).tornStart !== undefined) throw new Error('incomplete trace')
const events = decodeZstdLog(bytes).trim().split('\n').map(JSON.parse)
const priceBytes = await readFile(join(root, 'pricing.json'))
const pricing = JSON.parse(priceBytes)
const messages = events.filter(event => event.type === 'assistant/message')
const usages = messages.map(event => event.data.usage)
if (usages.some(usage => !['inputTokens', 'outputTokens', 'cacheReadTokens'].every(key => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0))) throw new Error('missing or invalid assistant usage')
const usageTotals = Object.fromEntries(['inputTokens', 'outputTokens', 'cacheReadTokens'].map(key => [key, usages.reduce((sum, usage) => sum + usage[key], 0)]))
const cost = (usageTotals.inputTokens * pricing.inputUsdPerMillion + usageTotals.outputTokens * pricing.outputUsdPerMillion + usageTotals.cacheReadTokens * pricing.cacheHitUsdPerMillion) / 1e6 * pricing.usdTwd
const sha256 = value => createHash('sha256').update(value).digest('hex')
const report = {
  incidentId: 'compatibility-headless-20260923', generatedAt: new Date().toISOString(),
  comparisonEligible: false, protocolViolation: 'headless positional slash text was dispatched as a model prompt outside trial accounting',
  trace, traceSha256: sha256(bytes), pricingSha256: sha256(priceBytes), pricingCheckedAt: pricing.checkedAt,
  assistantRequestsWithUsage: messages.length,
  auxiliaryTitleRequests: events.filter(event => event.type === 'session/title-llm-request').length,
  auxiliaryUsageAvailable: false, usageTotals, assistantTraceEstimateTwd: cost,
  providerInvoiceVerified: false, totalCostTwd: null,
  terminalReason: events.findLast(event => event.type === 'turn/end')?.data.reason,
  retryEvents: events.filter(event => event.type === 'llm/retry').length,
  recovery: 'unconditional plugin model hold; no remaining budget released before reconciliation',
}
await mkdir(join(root, 'analysis'), { recursive: true })
await writeFile(join(root, 'analysis/compatibility-incident.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify({ incidentId: report.incidentId, assistantRequestsWithUsage: report.assistantRequestsWithUsage, auxiliaryTitleRequests: report.auxiliaryTitleRequests, assistantTraceEstimateTwd: cost, totalCostTwd: null, comparisonEligible: false }))
