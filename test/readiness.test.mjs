import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportReport } from '../src/report.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))

test('headless and daily model requests are held even without a trial environment variable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-held-unlabelled-'))
  const previous = { DSH_ARCH_LAB_ROOT: process.env.DSH_ARCH_LAB_ROOT, DSH_ARCH_TRIAL_ID: process.env.DSH_ARCH_TRIAL_ID }
  process.env.DSH_ARCH_LAB_ROOT = root; delete process.env.DSH_ARCH_TRIAL_ID
  try {
    const { apply } = await import(`../src/plugin.mjs?unlabelled=${Date.now()}`)
    let listener
    apply({ on: (event, callback) => { if (event === 'llm/stream') listener = callback }, inject: () => {} })
    let dispatched = false
    assert.throws(() => listener({}, () => { dispatched = true }), /實機試驗暫停/)
    assert.equal(dispatched, false)
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value
    await rm(root, { recursive: true, force: true })
  }
})

test('export retains historical contamination audit without rewriting original trial records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-held-report-'))
  try {
    const original = JSON.stringify({ selectedRecipe: 'B', trials: [{ runId: 'B-pilot', recipe: 'B', status: 'unavailable', test: { pass: true } }] })
    const statePath = join(root, 'lab-state.json')
    await writeFile(statePath, original)
    await mkdir(join(root, 'analysis'))
    const ineligible = [{ runId: 'B-pilot', reasons: ['confirmed cross-trial answer contamination'] }]
    await writeFile(join(root, 'analysis/pilot-audit.json'), JSON.stringify({ comparisonEligible: false, ineligibleForArchitectureComparison: ineligible }))
    const report = await exportReport(statePath, join(root, 'report.json'))
    assert.equal(report.comparisonReadiness.ready, false)
    assert.deepEqual(report.evidenceAudit.ineligibleForArchitectureComparison, ineligible)
    assert.equal(report.trials[0].test.pass, true)
    assert.equal(await readFile(statePath, 'utf8'), original)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('CLI trial, resume, and batch are held before creating evidence or spending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-held-cli-'))
  try {
    for (const command of ['run-one', 'resume-one', 'run-batch']) {
      const result = spawnSync(process.execPath, [join(project, 'src/cli.mjs'), command, 'debug-amount', '1', 'A'], { cwd: project, env: { PATH: process.env.PATH, DSH_ARCH_LAB_ROOT: root }, encoding: 'utf8', timeout: 10_000 })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /實機試驗暫停/)
    }
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('direct DSH model stream and slash command cannot bypass the audit hold', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-held-plugin-'))
  const previous = { DSH_ARCH_LAB_ROOT: process.env.DSH_ARCH_LAB_ROOT, DSH_ARCH_TRIAL_ID: process.env.DSH_ARCH_TRIAL_ID }
  Object.assign(process.env, { DSH_ARCH_LAB_ROOT: root, DSH_ARCH_TRIAL_ID: 'offline-hold-test' })
  try {
    const { apply } = await import(`../src/plugin.mjs?hold-test=${Date.now()}`)
    const listeners = new Map()
    let command
    apply({ on: (event, callback) => listeners.set(event, callback), inject: (services, callback) => services.includes('commands') && callback({ commands: { register: (entry) => { command = entry } } }) })
    let dispatched = false
    await assert.rejects(async () => {
      const stream = listeners.get('llm/stream')({}, () => { dispatched = true; return (async function* () {})() })
      for await (const _chunk of stream) { /* No provider chunk is allowed. */ }
    }, /實機試驗暫停/)
    assert.equal(dispatched, false)
    for (const rawInput of ['start A debug-amount 1', 'resume A debug-amount 1', 'batch']) {
      const result = await command.handler({ rawInput })
      assert.equal(result.kind, 'error')
      assert.match(result.text, /實機試驗暫停/)
    }
    assert.deepEqual(await readdir(root), [])
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value
    await rm(root, { recursive: true, force: true })
  }
})
