import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { trialOrder } from '../src/recipes.mjs'
import { compare } from '../src/report.mjs'
import { readRegistry } from '../src/registry.mjs'
import { markInterrupted, readState, writeState } from '../src/store.mjs'
import { requestUpperBound, reserve, settle, validatePricing } from '../src/budget.mjs'
import { tasks } from '../tasks/catalog.mjs'

const pricing = { provider: 'deepseek-official', model: 'deepseek-flash', source: 'https://api-docs.deepseek.com/quick_start/pricing/', fxSource: 'https://open.er-api.com/v6/latest/USD', checkedAt: new Date().toISOString(), inputUsdPerMillion: 0.3, cacheHitUsdPerMillion: 0.006, outputUsdPerMillion: 1.2, usdTwd: 31.7 }

test('schedule is 72 independent trial identities with rotated recipe order', () => {
  const rows = trialOrder(tasks.map((task) => task.id))
  assert.equal(rows.length, 72)
  assert.equal(new Set(rows.map((row) => `${row.taskId}:${row.recipe}:${row.repetition}`)).size, 72)
  assert.deepEqual(rows.slice(0, 4).map((row) => row.recipe), ['A', 'B', 'C', 'D'])
  assert.deepEqual(rows.slice(24, 28).map((row) => row.recipe), ['B', 'C', 'D', 'A'])
})

test('price gate rejects stale data and unknown routes before dispatch', () => {
  assert.throws(() => validatePricing({ ...pricing, checkedAt: '2020-01-01' }), /stale/)
  assert.throws(() => requestUpperBound({ provider: 'other', model: 'x', maxTokens: 100, messages: [] }, pricing), /unpriced/)
  assert.throws(() => requestUpperBound({ provider: pricing.provider, model: pricing.model, reasoningEffort: 'high', messages: [] }, pricing), /limit/)
  assert.ok(requestUpperBound({ provider: pricing.provider, model: pricing.model, reasoningEffort: 'high', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] }, pricing) > 0)
})

test('budget reserves worst-case cost, keeps it charged after settlement, and blocks the thirteenth request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lab-budget-'))
  try {
    for (let i = 0; i < 12; i++) {
      const id = await reserve(root, 'trial-1', 1)
      if (i === 0) await settle(root, id, { inputTokens: 100, outputTokens: 10, cacheReadTokens: 200 }, pricing)
    }
    await assert.rejects(reserve(root, 'trial-1', 1), /request limit/)
    await assert.rejects(reserve(root, 'trial-2', 300), /budget/)
    const ledger = JSON.parse(await readFile(join(root, 'budget.json'), 'utf8'))
    assert.equal(ledger.entries.length, 12)
    assert.equal(ledger.entries[0].usage.cacheReadTokens, 200)
    assert.equal(ledger.entries[0].status, 'metered')
    assert.equal(ledger.entries[0].actualTwd, 0.01)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('restart marks only the active run interrupted and preserves completed trials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lab-state-'))
  try {
    const path = join(root, 'state.json')
    await writeState(path, { selectedRecipe: 'B', trials: [{ recipe: 'B', status: 'completed', test: { pass: false } }], run: { status: 'running' } })
    const state = await markInterrupted(path)
    assert.equal(state.run.status, 'interrupted')
    assert.equal((await readState(path)).trials.length, 1)
    assert.equal(compare(state.trials).B.successRate, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('comparison exposes costs and external passes from unavailable runs without counting success', () => {
  const row = compare([{ recipe: 'B', status: 'unavailable', test: { pass: true }, requests: 12, costTwd: 0.68, reservedTwd: 157.27, durationMs: 35115 }]).B
  assert.equal(row.successRate, null)
  assert.equal(row.passed, 0)
  assert.equal(row.externalPasses, 1)
  assert.equal(row.observedCostTwd, 0.68)
  assert.equal(row.reservedTwd, 157.27)
  assert.equal(row.unmeteredTrials, 0)
})

test('every task fixture fails its external test before the agent changes it', () => {
  const project = new URL('../tasks/', import.meta.url).pathname
  for (const task of tasks) {
    assert.throws(() => execFileSync(process.execPath, [join(project, task.id, 'verify.mjs'), join(project, task.id, 'fixture')], { stdio: 'pipe' }), task.id)
  }
})

test('DSH slash-command entry selects a recipe and explains the audit hold', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-lab-command-'))
  const prior = process.env.DSH_ARCH_LAB_ROOT
  process.env.DSH_ARCH_LAB_ROOT = root
  try {
    const { apply } = await import(`../src/plugin.mjs?test=${Date.now()}`)
    let command
    apply({ on: () => {}, inject: (services, callback) => services.includes('commands') && callback({ commands: { register: (definition) => { command = definition } } }) })
    assert.equal(command.name, 'architecture-lab')
    const selected = await command.handler({ rawInput: 'select C' })
    assert.equal(selected.kind, 'success')
    assert.equal(readRegistry(root).selectedRecipe, 'C')
    const denied = await command.handler({ rawInput: 'start C debug-amount 1' })
    assert.equal(denied.kind, 'error')
    assert.match(denied.text, /實機試驗暫停/)
  } finally {
    prior === undefined ? delete process.env.DSH_ARCH_LAB_ROOT : process.env.DSH_ARCH_LAB_ROOT = prior
    await rm(root, { recursive: true, force: true })
  }
})
