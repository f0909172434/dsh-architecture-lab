import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readState } from './store.mjs'
import { liveBlockers } from './readiness.mjs'

export function compare(trials) {
  const result = {}
  for (const id of ['A', 'B', 'C', 'D']) {
    const rows = trials.filter((trial) => trial.recipe === id)
    const completed = rows.filter((trial) => trial.status === 'completed')
    const passed = completed.filter((trial) => trial.test?.pass === true)
    result[id] = {
      trials: rows.length,
      completed: completed.length,
      interrupted: rows.filter((trial) => trial.status === 'interrupted').length,
      unavailable: rows.filter((trial) => trial.status === 'unavailable').length,
      passed: passed.length,
      successRate: completed.length ? passed.length / completed.length : null,
      falseCompletions: completed.filter((trial) => trial.agentCompleted && trial.test?.pass === false).length,
      durationMs: completed.reduce((sum, trial) => sum + (trial.durationMs ?? 0), 0),
      costTwd: completed.length && completed.every((trial) => Number.isFinite(trial.costTwd)) ? completed.reduce((sum, trial) => sum + trial.costTwd, 0) : null,
      // Failed or unavailable runs can still consume tokens and pass the
      // external test. Show those facts without counting them as successes.
      externalPasses: rows.filter((trial) => trial.test?.pass === true).length,
      observedCostTwd: Math.round(rows.reduce((sum, trial) => sum + (Number.isFinite(trial.costTwd) ? trial.costTwd : 0), 0) * 100) / 100,
      unmeteredTrials: rows.filter((trial) => trial.requests > 0 && !Number.isFinite(trial.costTwd)).length,
      reservedTwd: Math.round(rows.reduce((sum, trial) => sum + (trial.reservedTwd ?? 0), 0) * 100) / 100,
      totalDurationMs: rows.reduce((sum, trial) => sum + (trial.durationMs ?? 0), 0),
    }
  }
  return result
}

export async function exportReport(statePath, outputPath) {
  const state = await readState(statePath)
  let manifest = null
  try { manifest = JSON.parse(await readFile(join(dirname(statePath), 'schedule.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  let evidenceAudit = null
  try {
    const audit = JSON.parse(await readFile(join(dirname(statePath), 'analysis/pilot-audit.json'), 'utf8'))
    evidenceAudit = { source: 'analysis/pilot-audit.json', generatedAt: audit.generatedAt, comparisonEligible: audit.comparisonEligible, ineligibleForArchitectureComparison: audit.ineligibleForArchitectureComparison }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const report = { generatedAt: new Date().toISOString(), comparisonReadiness: { ready: liveBlockers.length === 0 && evidenceAudit?.comparisonEligible !== false, blockers: liveBlockers, analysis: 'docs/pilot-analysis.md' }, evidenceAudit, manifest, selectedRecipe: state.selectedRecipe, run: state.run, summary: compare(state.trials), trials: state.trials }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
  return report
}
