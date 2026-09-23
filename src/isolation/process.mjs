import { spawn } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import { seatbeltProfile } from './seatbelt.mjs'

/** Run a process and its descendants behind one kernel boundary. The trusted parent
 * owns the profile, output cap and deadline. Descendants never receive host env.
 */
export async function runIsolatedProcess({ executable = process.execPath, args = [], cwd, home = cwd, readOnly = [], readWrite = [], executables = [], loopbackPort, env = {}, timeoutMs = 10_000, maxOutputBytes = 1024 * 1024, signal }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error('invalid isolation deadline')
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16 * 1024 * 1024) throw new Error('invalid output cap')
  if (Object.keys(env).some(key => !['DSH_HOME', 'DSH_ARCH_LAB_ROOT', 'DSH_PERMISSION_MODE', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_API_KEY', 'DSH_OFFLINE_PROBE'].includes(key))) throw new Error('unapproved child environment field')
  const binary = await realpath(executable)
  const profile = await seatbeltProfile({ readOnly, readWrite, executables: [binary, ...executables], subprocesses: true, loopbackPort })
  if (signal?.aborted) return { status: null, signal: null, reason: 'cancelled', stdout: '', stderr: '' }
  return new Promise(resolve => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, binary, ...args], {
      cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: `${dirname(binary)}:/usr/bin:/bin`, HOME: home, TMPDIR: cwd, TZ: 'UTC', LANG: 'C.UTF-8', ...env },
    })
    let stdout = '', stderr = '', bytes = 0, reason = null
    const killTree = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } } }
    const stop = label => { reason ??= label; killTree() }
    const abort = () => stop('cancelled')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    const collect = (chunk, stream) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > maxOutputBytes) { stop('output_limit'); return }
      if (stream === 'stdout') stdout += chunk; else stderr += chunk
    }
    child.stdout.setEncoding('utf8').on('data', chunk => collect(chunk, 'stdout'))
    child.stderr.setEncoding('utf8').on('data', chunk => collect(chunk, 'stderr'))
    child.on('error', () => { reason ??= 'spawn_error' })
    child.on('exit', killTree) // terminate leftover descendants before returning
    child.on('close', (status, childSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      resolve({ status, signal: childSignal, reason, stdout, stderr })
    })
  })
}
