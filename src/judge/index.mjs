import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases } from '../../tasks/cases.mjs'
import { encode } from './codec.mjs'
import { runIsolatedNode } from '../isolation/seatbelt.mjs'

const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url))
const codec = fileURLToPath(new URL('./codec.mjs', import.meta.url))

/** Never imports or executes the submitted module in this trusted process. */
export async function judge(taskId, workspace, { timeoutMs = 3000 } = {}) {
  const spec = cases[taskId]
  if (!spec) throw new Error('unknown judge task')
  const base = { protocol: 'architecture-lab-values-v1', taskId, total: spec.cases.length }
  let result
  try {
    result = await runIsolatedNode({ script: worker, args: [join(workspace, 'index.mjs')], cwd: workspace, readOnly: [codec], input: JSON.stringify({ exportName: spec.exportName, inputs: spec.cases.map(([args]) => args) }), timeoutMs })
  } catch (error) { return { ...base, pass: false, status: 'unavailable', reason: error.message } }
  if (result.error || result.signal || result.status !== 0) return { ...base, pass: false, status: 'failed', reason: result.error?.code ?? result.signal ?? 'worker_error', exitCode: result.status }
  let reply
  try { reply = JSON.parse(result.stdout) } catch { return { ...base, pass: false, status: 'failed', reason: 'missing_or_invalid_response' } }
  if (reply?.protocol !== base.protocol || !Array.isArray(reply.results) || reply.results.length !== spec.cases.length) return { ...base, pass: false, status: 'failed', reason: 'incomplete_response' }
  const failedCases = []
  for (const [index, [, expected]] of spec.cases.entries()) {
    const actual = reply.results[index]
    if (actual?.kind !== 'value' || !isDeepStrictEqual(actual.value, encode(expected))) failedCases.push(index)
  }
  return { ...base, pass: failedCases.length === 0, status: failedCases.length === 0 ? 'passed' : 'failed', passed: spec.cases.length - failedCases.length, failedCases }
}
