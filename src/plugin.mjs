import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { writeState, markInterrupted } from './store.mjs'
import { recipe, recipes } from './recipes.mjs'
import { compare, exportReport } from './report.mjs'
import { task } from '../tasks/catalog.mjs'
import { budgetRoot, loadPricing, requestUpperBound, reserve, settle } from './budget.mjs'
import { hasIsolatedCredential } from './credential.mjs'
import { assertLiveReady, liveBlockers } from './readiness.mjs'

export const name = 'dsh-architecture-lab'
export const inject = []

const defaultRoot = fileURLToPath(new URL('../state/', import.meta.url))
const labRoot = process.env.DSH_ARCH_LAB_ROOT ?? defaultRoot
const statePath = join(labRoot, 'lab-state.json')
const cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url))

export function apply(ctx) {
  void markInterrupted(statePath)
  // Headless positional text is a prompt, not a slash-command dispatch. Apply
  // the audit hold to every model call, even outside a labelled trial.
  ctx.on('llm/stream', (options, next) => {
    assertLiveReady()
    return next()
  }, { global: true })
  // Every model route in an experiment, including title/compaction calls, passes
  // through this host waterfall. Missing pricing fails closed before dispatch.
  if (process.env.DSH_ARCH_TRIAL_ID) {
    ctx.on('agent/request', async (_payload, next) => ({ ...(await next()), maxTokens: 4096 }), { global: true })
    ctx.on('llm/stream', (options, next) => (async function* () {
      assertLiveReady()
      const root = budgetRoot()
      const pricing = await loadPricing(root)
      const amount = requestUpperBound(options, pricing)
      const id = await reserve(root, process.env.DSH_ARCH_TRIAL_ID, amount)
      let usage
      try {
        for await (const chunk of next()) {
          if (chunk.type === 'usage') usage = chunk.usage
          yield chunk
        }
      } finally {
        await settle(root, id, usage, pricing)
      }
    })(), { global: true })
  }
  ctx.inject(['commands'], ({ commands }) => {
    commands.register({
      name: 'architecture-lab',
      description: '架構實驗室：查看配方、選擇日常配方及匯出實驗證據',
      input: { hint: 'status | select A/B/C/D | start/resume <配方> <題目> <次數> | batch | stop | report | export <路徑>' },
      handler: async ({ rawInput }) => {
        const [action = 'status', arg, arg2, arg3] = rawInput.trim().split(/\s+/)
        const state = await markInterrupted(statePath)
        if (action === 'status') {
          return { kind: 'success', text: `目前配方：${state.selectedRecipe} ${recipe(state.selectedRecipe).label}\n${Object.entries(recipes).map(([id, item]) => `${id} ${item.label}`).join('\n')}\n實驗紀錄：${state.trials.length}；執行狀態：${state.run?.status ?? '未開始'}\n${liveBlockers.length ? `實機試驗暫停：${liveBlockers.join('；')}` : '實機試驗就緒'}` }
        }
        if (action === 'select') {
          try { recipe(arg) } catch (error) { return { kind: 'error', text: error.message } }
          state.selectedRecipe = arg
          await writeState(statePath, state)
          return { kind: 'success', text: `已選擇 ${arg} ${recipe(arg).label}。關閉目前實驗網頁服務後執行 npm run web，才會以對應隔離 profile 開啟新會話。` }
        }
        if (action === 'export') {
          if (!arg) return { kind: 'error', text: '請提供匯出路徑' }
          await exportReport(statePath, arg)
          return { kind: 'success', text: `報告已匯出：${arg}` }
        }
        if (action === 'report') return { kind: 'success', text: JSON.stringify({ comparisonReady: liveBlockers.length === 0, blockers: liveBlockers, summary: compare(state.trials) }, null, 2) }
        if (action === 'batch') {
          try { assertLiveReady() } catch (error) { return { kind: 'error', text: error.message } }
          try { await loadPricing(labRoot) } catch (error) { return { kind: 'error', text: `價格資料不可用：${error.message}` } }
          if (!await hasIsolatedCredential(join(labRoot, 'dsh-home'))) return { kind: 'error', text: '隔離試驗尚未設定 DeepSeek 憑證，未啟動付費試驗' }
          if (state.run?.status === 'running') return { kind: 'error', text: `已有進行中的試驗：${state.run.trialId}` }
          const logDir = join(labRoot, 'runs', `batch-${Date.now()}`)
          await mkdir(logDir, { recursive: true })
          const log = await open(join(logDir, 'launcher.log'), 'a')
          const child = spawn(process.execPath, [cliPath, 'run-batch'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DSH_ARCH_LAB_ROOT: labRoot }, stdio: ['ignore', log.fd, log.fd], detached: true })
          child.unref()
          await log.close()
          return { kind: 'success', text: `已送出批次，程序 ${child.pid}。使用 /architecture-lab status 查看進度；日誌位於 ${logDir}` }
        }
        if (action === 'start' || action === 'resume') {
          try { assertLiveReady() } catch (error) { return { kind: 'error', text: error.message } }
          try { recipe(arg); task(arg2) } catch (error) { return { kind: 'error', text: error.message } }
          const repetition = Number(arg3)
          if (!Number.isInteger(repetition) || repetition < 1 || repetition > 3) return { kind: 'error', text: '次數須為 1、2 或 3' }
          try { await loadPricing(labRoot) } catch (error) { return { kind: 'error', text: `價格資料不可用：${error.message}` } }
          if (!await hasIsolatedCredential(join(labRoot, 'dsh-home'))) return { kind: 'error', text: '隔離試驗尚未設定 DeepSeek 憑證，未啟動付費試驗' }
          if (state.run?.status === 'running') return { kind: 'error', text: `已有進行中的試驗：${state.run.trialId}` }
          const trialId = `${arg2}-${arg}-${repetition}`
          const prior = state.trials.filter((trial) => trial.trialId === trialId)
          if (action === 'resume' && prior.at(-1)?.status !== 'interrupted') return { kind: 'error', text: '此試驗沒有可接續的中斷紀錄' }
          const runId = action === 'resume' ? `${trialId}-resume-${prior.length}` : trialId
          const logDir = join(labRoot, 'runs', runId)
          await mkdir(logDir, { recursive: true })
          const log = await open(join(logDir, 'launcher.log'), 'a')
          const child = spawn(process.execPath, [cliPath, action === 'resume' ? 'resume-one' : 'run-one', arg2, String(repetition), arg], {
            cwd: fileURLToPath(new URL('../', import.meta.url)),
            env: { ...process.env, DSH_ARCH_LAB_ROOT: labRoot },
            stdio: ['ignore', log.fd, log.fd],
            detached: true,
          })
          child.unref()
          await log.close()
          return { kind: 'success', text: `已送出 ${runId}，程序 ${child.pid}。使用 /architecture-lab status 查看進度；紀錄位於 ${logDir}` }
        }
        if (action === 'stop') {
          const stop = spawnSync(process.execPath, [cliPath, 'stop'], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' })
          return { kind: stop.status === 0 ? 'success' : 'error', text: (stop.status === 0 ? stop.stdout : stop.stderr).trim() }
        }
        return { kind: 'error', text: '可用操作：status、select、start、resume、batch、stop、report、export' }
      },
    })
  })
}
