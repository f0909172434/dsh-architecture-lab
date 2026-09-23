import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tasks, task } from '../tasks/catalog.mjs'
import { recipe, trialOrder } from './recipes.mjs'
import { readState, writeState, markInterrupted } from './store.mjs'
import { exportReport } from './report.mjs'
import { loadPricing } from './budget.mjs'
import { hasIsolatedCredential } from './credential.mjs'
import { assertLiveReady, liveBlockers } from './readiness.mjs'
import { harness, versions } from './runtime.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = process.env.DSH_ARCH_LAB_ROOT ?? join(project, 'state')
const statePath = join(root, 'lab-state.json')
const home = join(root, 'dsh-home')
const commands = ['doctor', 'prepare', 'status', 'run-one', 'resume-one', 'run-batch', 'report', 'stop']

async function installed(profile, name) {
  try { return JSON.parse(await readFile(join(home, 'profiles', profile, 'node_modules', name, 'package.json'), 'utf8')).version } catch { return null }
}

async function doctor() {
  let pricing = 'unavailable (offline only)'
  try { const p = await loadPricing(root); pricing = `${p.checkedAt} (${p.source}; FX ${p.fxSource})` } catch (error) { pricing = `unavailable: ${error.message}` }
  let evaluator = null
  try { evaluator = JSON.parse(await readFile(join(project, 'upstream/dsh-eval-harness/package.json'), 'utf8')).version } catch (error) { if (error.code !== 'ENOENT') throw error }
  let isolatedHarness = null
  try { isolatedHarness = (await harness()).version } catch {}
  const info = {
    pinnedVersions: await versions(),
    isolatedHarness,
    profiles: { A: 'lab-a', B: 'lab-b', C: 'lab-c', D: 'lab-d' },
    engram: await installed('lab-b', '@kenz1117/dsh-engram'),
    planner: await installed('lab-c', 'dsh-plan-and-execute'),
    evaluator,
    pricing,
    isolatedCredentialAvailable: await hasIsolatedCredential(home),
    recordedTrials: (await readState(statePath)).trials.length,
    liveReady: liveBlockers.length === 0,
    liveBlockers,
    readiness: {
      A: 'scripted isolated DSH/evaluator/judge integration passes; paid run held',
      B: 'patched Engram integration passes; historical pilot remains contaminated',
      C: 'patched planner completes through isolated upstream evaluator; GUI acceptance pending',
      D: 'combined scripted integration passes; research protocol and live acceptance pending',
    },
  }
  console.log(JSON.stringify(info, null, 2))
}

async function prepare() {
  const rows = trialOrder(tasks.map((item) => item.id))
  const taskData = {}
  for (const item of tasks) {
    const fixture = await readFile(join(project, 'tasks', item.id, 'fixture', 'index.mjs'))
    const history = (await readFile(join(project, 'tasks', item.id, 'fixture', 'history.md'), 'utf8')).trim()
    const verifier = await readFile(join(project, 'tasks', item.id, 'verify.mjs'))
    const snapshot = JSON.parse(await readFile(join(root, 'snapshots', item.id, 'snapshot.json'), 'utf8'))
    taskData[item.id] = { category: item.category, fixtureSha256: createHash('sha256').update(fixture).digest('hex'), historySha256: createHash('sha256').update(history).digest('hex'), verifierSha256: createHash('sha256').update(verifier).digest('hex'), memorySnapshotSha256: snapshot.snapshotSha256 }
  }
  const manifest = { schemaVersion: 1, preparedAt: new Date().toISOString(), model: 'deepseek-official/deepseek-flash', reasoningEffort: 'high', maxRequestsPerTrial: 12, maxDurationMs: 600_000, capTwd: 300, plugins: { harness: spawnSync('dsh', ['--version'], { encoding: 'utf8' }).stdout.trim(), engram: await installed('lab-b', '@kenz1117/dsh-engram'), planner: await installed('lab-c', 'dsh-plan-and-execute'), evaluator: JSON.parse(await readFile(join(project, 'upstream/dsh-eval-harness/package.json'), 'utf8')).version }, taskData, trials: rows }
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'schedule.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Prepared ${rows.length} trial identities at ${join(root, 'schedule.json')}`)
}

async function runOne(id, repetition, recipeId = 'A', resume = false) {
  assertLiveReady()
  const { runEval } = await import('../upstream/dsh-eval-harness/lib/runner.js')
  const selected = recipe(recipeId)
  const item = task(id)
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > 3) throw new Error('repetition must be 1, 2, or 3')
  // This check is local and read-only. The middleware repeats it before every
  // model call, so a long run cannot continue on stale pricing.
  await loadPricing(root)
  if (!await hasIsolatedCredential(home)) throw new Error('isolated DeepSeek credential is missing; no paid call started')
  const trialId = `${id}-${recipeId}-${repetition}`
  const state = await markInterrupted(statePath)
  if (state.run?.status === 'running') throw new Error(`another trial is running (pid ${state.run.pid})`)
  const previousRuns = state.trials.filter((trial) => trial.trialId === trialId)
  if (!resume && previousRuns.length) throw new Error(`trial ${trialId} already exists; preserve its evidence`)
  if (resume && previousRuns.at(-1)?.status !== 'interrupted') throw new Error(`trial ${trialId} has no interrupted run to resume`)
  const runId = resume ? `${trialId}-resume-${previousRuns.length}` : trialId
  const outputDir = join(root, 'runs', runId)
  const casesDir = join(outputDir, 'case')
  await mkdir(casesDir, { recursive: true })
  await writeFile(join(casesDir, 'task.yml'), `name: ${id}\nprompt: ${JSON.stringify(item.prompt)}\nassert:\n  turn_end: completed\n`)
  const fixture = join(project, 'tasks', id, 'fixture')
  const memorySnapshotDir = selected.memory ? join(root, 'snapshots', id) : undefined
  if (memorySnapshotDir) await readFile(join(memorySnapshotDir, 'snapshot.json'))
  const fixtureBytes = await readFile(join(fixture, 'index.mjs'))
  const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex')
  const manifest = JSON.parse(await readFile(join(root, 'schedule.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.model !== 'deepseek-official/deepseek-flash' || manifest.capTwd !== 300) throw new Error('trial manifest is incompatible')
  if (manifest.plugins?.harness !== spawnSync('dsh', ['--version'], { encoding: 'utf8' }).stdout.trim() || manifest.plugins?.engram !== await installed('lab-b', '@kenz1117/dsh-engram') || manifest.plugins?.planner !== await installed('lab-c', 'dsh-plan-and-execute') || manifest.plugins?.evaluator !== JSON.parse(await readFile(join(project, 'upstream/dsh-eval-harness/package.json'), 'utf8')).version) throw new Error('plugin or Harness version changed after schedule was prepared')
  if (manifest.taskData?.[id]?.fixtureSha256 !== fixtureSha256) throw new Error('task fixture changed after schedule was prepared')
  const history = (await readFile(join(fixture, 'history.md'), 'utf8')).trim()
  if (manifest.taskData?.[id]?.historySha256 !== createHash('sha256').update(history).digest('hex')) throw new Error('task history changed after schedule was prepared')
  if (manifest.taskData?.[id]?.verifierSha256 !== createHash('sha256').update(await readFile(join(project, 'tasks', id, 'verify.mjs'))).digest('hex')) throw new Error('external verifier changed after schedule was prepared')
  if (memorySnapshotDir) {
    const db = await readFile(join(memorySnapshotDir, 'user.db'))
    if (manifest.taskData?.[id]?.memorySnapshotSha256 !== createHash('sha256').update(db).digest('hex')) throw new Error('memory snapshot changed after schedule was prepared')
  }
  state.run = { status: 'running', trialId, runId, pid: process.pid, startedAt: new Date().toISOString() }
  await writeState(statePath, state)
  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_ARCH_LAB_ROOT: process.env.DSH_ARCH_LAB_ROOT, DSH_ARCH_TRIAL_ID: process.env.DSH_ARCH_TRIAL_ID, DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE }
  Object.assign(process.env, { DSH_HOME: home, DSH_ARCH_LAB_ROOT: root, DSH_ARCH_TRIAL_ID: trialId, DSH_PERMISSION_MODE: 'workspace-write' })
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  let record
  try {
    const report = await runEval({ casesDir, outputDir, profile: `lab-${recipeId.toLowerCase()}`, seedDir: fixture, memorySnapshotDir, timeoutMs: 550_000, retries: 0, trials: 1, signal: controller.signal })
    const upstream = report.cases[0]
    const workspace = join(outputDir, '.workspace', `000-${id}`)
    let planningPhase = null
    if (selected.planning) {
      try {
        const directories = await readdir(join(workspace, '.pae'))
        const state = JSON.parse(await readFile(join(workspace, '.pae', directories[0], 'orchestrator.json'), 'utf8'))
        planningPhase = state.phase
      } catch {}
    }
    const verified = spawnSync(process.execPath, [join(project, 'tasks', id, 'verify.mjs'), workspace], { cwd: project, encoding: 'utf8', timeout: 30_000, env: { ...process.env, TZ: 'Pacific/Honolulu' } })
    let ledger
    try { ledger = JSON.parse(await readFile(join(root, 'budget.json'), 'utf8')) } catch { ledger = { entries: [] } }
    const entries = ledger.entries.filter((entry) => entry.trialId === trialId)
    const unavailable = (entries.length === 0 && upstream.status === 'error') || /budget would be exceeded|request limit reached|price or exchange rate is stale|output-token limit exceeds/.test(upstream.error ?? '')
    record = {
      trialId, runId, taskId: id, category: item.category, recipe: recipeId, repetition,
      status: controller.signal.aborted ? 'interrupted' : unavailable ? 'unavailable' : 'completed', fixtureSha256, model: 'deepseek-official/deepseek-flash',
      agentCompleted: upstream.turnEnd === 'completed',
      planningPhase,
      test: { pass: verified.status === 0, exitCode: verified.status, stderr: verified.stderr?.slice(-2000) ?? '' },
      upstreamStatus: upstream.status, error: upstream.error ?? null,
      requests: entries.length, costTwd: entries.every((entry) => entry.status === 'metered') ? entries.reduce((sum, entry) => sum + entry.actualTwd, 0) : null,
      reservedTwd: entries.reduce((sum, entry) => sum + entry.reservedTwd, 0),
      durationMs: upstream.durationMs, evidence: { rawReport: join(outputDir, 'report.json'), sessionRoot: join(outputDir, '.sessions'), workspace },
    }
  } catch (error) {
    record = { trialId, runId, taskId: id, category: item.category, recipe: recipeId, repetition, status: 'interrupted', fixtureSha256, error: String(error), evidence: { outputDir } }
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value
  }
  const latest = await readState(statePath)
  latest.trials.push(record)
  latest.run = { status: record.status, trialId, finishedAt: new Date().toISOString() }
  await writeState(statePath, latest)
  console.log(JSON.stringify(record, null, 2))
  if (record.status !== 'completed') process.exitCode = 1
  return record
}

const [command, ...args] = process.argv.slice(2)
try {
  if (command === 'doctor') await doctor()
  else if (command === 'prepare') await prepare()
  else if (command === 'status') console.log(JSON.stringify(await markInterrupted(statePath), null, 2))
  else if (command === 'run-one') await runOne(args[0], Number(args[1]), args[2] ?? 'A')
  else if (command === 'resume-one') await runOne(args[0], Number(args[1]), args[2] ?? 'A', true)
  else if (command === 'run-batch') {
    assertLiveReady()
    const rows = trialOrder(tasks.map((item) => item.id))
    for (const row of rows) {
      const state = await markInterrupted(statePath)
      const trialId = `${row.taskId}-${row.recipe}-${row.repetition}`
      const prior = state.trials.filter((trial) => trial.trialId === trialId)
      if (prior.some((trial) => trial.status === 'completed')) continue
      if (prior.length) throw new Error(`${trialId} has interrupted or unavailable evidence; review before resuming batch`)
      const result = await runOne(row.taskId, row.repetition, row.recipe)
      if (result.status !== 'completed') break
    }
  }
  else if (command === 'report') console.log(JSON.stringify(await exportReport(statePath, resolve(args[0] ?? join(root, 'comparison.json'))).then((report) => report.summary), null, 2))
  else if (command === 'stop') {
    const state = await readState(statePath)
    if (state.run?.status !== 'running') throw new Error('no active run')
    const pid = state.run.pid
    if (!Number.isInteger(pid)) throw new Error('active run has no process id')
    const commandLine = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout?.trim() ?? ''
    const cwdLine = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout ?? ''
    if (!commandLine.includes('src/cli.mjs') || !['run-one', 'resume-one', 'run-batch'].some((label) => commandLine.includes(label)) || !cwdLine.includes(`n${project.replace(/\/$/, '')}`)) throw new Error('runner process identity could not be verified')
    process.kill(pid, 'SIGINT')
    console.log(`Cancellation requested for ${state.run.trialId}; partial evidence will be retained.`)
  } else throw new Error(`usage: npm run lab -- ${commands.join(' | ')}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
