// Offline only. Reads sealed session traces; runs harmless, authored verifier
// probes in disposable directories. Never loads credentials or invokes DSH.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeZstdLog, scanZstdFrames } from '../upstream/dsh-eval-harness/lib/zstd.js'
import { tasks } from '../tasks/catalog.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = join(project, 'state')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const round = (n) => Math.round(n * 10000) / 10000
const stateBytes = await readFile(join(root, 'lab-state.json'))
const ledgerBytes = await readFile(join(root, 'budget.json'))
const pricingBytes = await readFile(join(root, 'pricing.json'))
const state = JSON.parse(stateBytes)
const ledger = JSON.parse(ledgerBytes)
const pricing = JSON.parse(pricingBytes)
const estimates = (u) => ((u.inputTokens ?? 0) * pricing.inputUsdPerMillion + (u.cacheReadTokens ?? 0) * pricing.cacheHitUsdPerMillion + (u.outputTokens ?? 0) * pricing.outputUsdPerMillion) / 1e6 * pricing.usdTwd
const pilots = []

for (const id of ['debug-amount-A-1', 'debug-amount-B-1']) {
  const trial = state.trials.find((row) => row.runId === id)
  if (!trial) throw new Error(`Missing pilot ${id}`)
  const sessionRoot = join(root, 'runs', id, '.sessions')
  const files = (await readdir(sessionRoot, { recursive: true })).filter((path) => path.endsWith('session.v3.jsonl.zstd'))
  if (files.length !== 1) throw new Error(`${id}: expected exactly one trace`)
  const tracePath = join(sessionRoot, files[0])
  const bytes = await readFile(tracePath)
  if (scanZstdFrames(bytes).tornStart !== undefined) throw new Error(`${id}: incomplete trace`)
  const events = decodeZstdLog(bytes).trim().split('\n').map((line) => JSON.parse(line))
  const messages = events.filter((event) => event.type === 'assistant/message')
  const finishReasons = {}
  const toolCounts = {}
  const calls = new Map()
  const crossTrialReads = []
  const successfulSelfTestSteps = []
  for (const event of events) {
    const data = event.data ?? {}
    if (event.type === 'assistant/message') for (const entry of data.stream ?? []) {
      if (entry.chunk?.type === 'finish') {
        const kind = entry.chunk.reason.kind
        finishReasons[kind] = (finishReasons[kind] ?? 0) + 1
      }
    }
    if (event.type === 'tool/call') {
      calls.set(data.callId, data)
      toolCounts[data.name] = (toolCounts[data.name] ?? 0) + 1
    }
    if (event.type !== 'tool/result') continue
    const message = data.message ?? {}
    const call = calls.get(message.source?.callId)
    if (!call) continue
    const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments)
    const blocks = message.content ?? []
    const text = blocks.flatMap((block) => block.content ?? []).map((block) => block.text ?? '').join('\n')
    const isError = blocks.some((block) => block.isError)
    if (args.includes('node --test') && !isError && /fail 0/.test(text)) successfulSelfTestSteps.push(data.step)
    for (const other of state.trials.filter((row) => row.runId !== id)) {
      if (!args.includes(`/runs/${other.runId}`)) continue
      crossTrialReads.push({ seq: event.seq, step: data.step, tool: call.name, targetRunId: other.runId, isError, resultBytes: Buffer.byteLength(text), resultSha256: digest(text), answerCodePresent: text.includes('Normalize an amount into a finite number'), testCodePresent: text.includes("from 'node:test'"), reportPresent: text.includes('dsh-eval-harness') })
    }
  }
  const usage = messages.map((event) => event.data.usage).filter(Boolean)
  const entries = ledger.entries.filter((entry) => entry.trialId === trial.trialId)
  if (usage.length !== entries.length) throw new Error(`${id}: usage and ledger counts differ`)
  const human = events.find((event) => event.type === 'user/message' && event.data?.source?.kind === 'user')?.data?.content?.map((block) => block.text ?? '').join('\n')
  const context = events.filter((event) => event.type === 'user/message').flatMap((event) => event.data.content ?? []).map((block) => block.text ?? '')
  const memory = context.find((text) => text.includes('<engram_memory_context'))
  pilots.push({
    runId: id, trace: relative(project, tracePath), traceSha256: digest(bytes),
    originalStatus: trial.status, originalExternalTestPass: trial.test?.pass, agentCompleted: trial.agentCompleted,
    assistantMessages: messages.length, maxOutputTokensObserved: Math.max(...usage.map((u) => u.outputTokens)), finishReasons,
    retryEvents: events.filter((event) => event.type === 'llm/retry').length,
    terminalReason: events.findLast((event) => event.type === 'turn/end')?.data.reason,
    toolCounts, successfulSelfTestSteps, crossTrialReads,
    globalSkillCatalogPresent: context.some((text) => text.includes('autonomous-research-paper')),
    memoryPacketPresent: Boolean(memory), memoryPacketContainsActualUserRequest: memory ? Boolean(human && memory.includes(human)) : null,
    memoryPacketWrapsSkillCatalog: memory ? memory.includes('<current_user_request>\n<system-reminder>') : null,
    requests: entries.length, usageTotals: Object.fromEntries(['inputTokens', 'cacheReadTokens', 'outputTokens', 'reasoningTokens'].map((key) => [key, usage.reduce((sum, u) => sum + (u[key] ?? 0), 0)])),
    tracePriceEstimateTwd: round(usage.reduce((sum, u) => sum + estimates(u), 0)),
    roundedPerRequestEstimateTwd: round(usage.reduce((sum, u) => sum + Math.ceil(estimates(u) * 100) / 100, 0)),
    reservedTwd: round(entries.reduce((sum, entry) => sum + entry.reservedTwd, 0)),
    providerInvoiceVerified: false,
  })
}

const probeRoot = await mkdtemp(join(tmpdir(), 'dsh-lab-audit-'))
const verifierProbes = []
try {
  const candidate = join(probeRoot, 'candidate')
  await mkdir(candidate)
  await writeFile(join(candidate, 'index.mjs'), 'process.exit(0)\n')
  for (const task of tasks) {
    const verifier = join(project, 'tasks', task.id, 'verify.mjs')
    const result = spawnSync(process.execPath, [verifier, candidate], { encoding: 'utf8', timeout: 10_000, env: { PATH: process.env.PATH, TZ: 'Pacific/Honolulu' } })
    verifierProbes.push({ taskId: task.id, verifierSha256: digest(await readFile(verifier)), candidateExportsRequiredFunction: false, exitCode: result.status, acceptedByCurrentCli: result.status === 0 })
  }
  const marker = join(probeRoot, 'outside-candidate-marker')
  await writeFile(join(candidate, 'index.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'offline proof'); process.exit(0)\n`)
  spawnSync(process.execPath, [join(project, 'tasks/debug-amount/verify.mjs'), candidate], { encoding: 'utf8', timeout: 10_000, env: { PATH: process.env.PATH } })
  let outsideWrite = false
  try { await access(marker); outsideWrite = true } catch {}
  verifierProbes.push({ probe: 'write outside candidate during verifier import', outsideWrite, note: 'Only a disposable marker in the audit temporary directory was written.' })
} finally { await rm(probeRoot, { recursive: true, force: true }) }

const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), offlineOnly: true, newModelCalls: 0,
  comparisonEligible: false,
  ineligibleForArchitectureComparison: pilots.map((row) => ({ runId: row.runId, reasons: row.crossTrialReads.some((read) => !read.isError) ? ['confirmed cross-trial answer contamination', 'verifier integrity not established'] : ['read isolation not enforced', 'verifier integrity not established'] })),
  evidence: { labStateSha256: digest(stateBytes), budgetSha256: digest(ledgerBytes), pricingSha256: digest(pricingBytes), pricingCheckedAt: pricing.checkedAt },
  pilots, verifierProbes,
  reservationTotalTwd: round(ledger.entries.reduce((sum, entry) => sum + entry.reservedTwd, 0)),
  rawEvidenceUnchanged: (await readFile(join(root, 'lab-state.json'))).equals(stateBytes) && (await readFile(join(root, 'budget.json'))).equals(ledgerBytes),
  limitations: ['Trace prices are reconstructed using the recorded price sheet, not a supplier invoice.', 'No proof of infinite looping; both pilots were cut off before request 13.', 'B has confirmed cross-trial contamination; A lacks an enforced read boundary.', 'Probe fixtures were authored for this audit, not observed cheating by either pilot.'],
}
await mkdir(join(root, 'analysis'), { recursive: true })
const output = join(root, 'analysis/pilot-audit.json')
await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, pilots: pilots.map((row) => ({ id: row.runId, finishReasons: row.finishReasons, successfulCrossTrialReads: row.crossTrialReads.filter((read) => !read.isError).length })), verifierFalsePasses: verifierProbes.filter((row) => row.acceptedByCurrentCli).length, rawEvidenceUnchanged: report.rawEvidenceUnchanged, newModelCalls: 0 }, null, 2))
