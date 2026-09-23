import { realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const quote = (value) => JSON.stringify(value)
const SYSTEM_READS = ['/System', '/usr/lib', '/usr/share']
const DEVICE_READS = ['/dev/null', '/dev/random', '/dev/urandom']

async function grant(path) {
  if (!isAbsolute(path)) throw new Error('sandbox grants must use absolute paths')
  const canonical = await realpath(path)
  // macOS aliases /var and /tmp under /private; compare canonical roots on
  // both sides so aliases or trailing separators cannot defeat this check.
  const tooBroad = await Promise.all(['/', '/Users', '/private', '/tmp', '/private/tmp', homedir(), tmpdir()]
    .map(async (p) => realpath(resolve(p))))
  if (tooBroad.includes(canonical)) throw new Error(`refusing broad sandbox grant: ${canonical}`)
  return { path: canonical, directory: (await stat(canonical)).isDirectory() }
}

const filter = ({ path, directory }) => `(${directory ? 'subpath' : 'literal'} ${quote(path)})`

/** Kernel-enforced read/write/network allow-list, inherited by descendants.
 * No fallback to unrestricted execution. macOS only until another backend
 * passes the same containment tests. Root directory enumeration is needed by
 * modern dyld; it grants names at /, not access to their contents.
 */
export async function seatbeltProfile({ readOnly = [], readWrite = [], executables = [process.execPath], subprocesses = false, loopbackPort } = {}) {
  if (process.platform !== 'darwin') throw new Error('read isolation requires the verified macOS Seatbelt backend')
  if (loopbackPort !== undefined && (!Number.isInteger(loopbackPort) || loopbackPort < 1 || loopbackPort > 65535)) throw new Error('invalid loopback port')
  const [reads, writes, programs] = await Promise.all([
    Promise.all(readOnly.map(grant)), Promise.all(readWrite.map(grant)), Promise.all(executables.map(grant)),
  ])
  if (programs.some((p) => p.directory)) throw new Error('executable grants must name files')
  const allReads = [...reads, ...writes, ...programs]
  // Node resolves module paths through ancestor metadata. Grant only those
  // ancestors, never permission to enumerate their private directory contents.
  const ancestors = new Set(['/'])
  for (const { path } of allReads) for (let dir = dirname(path); dir !== '/'; dir = dirname(dir)) ancestors.add(dir)
  return [
    '(version 1)', '(deny default)', '(allow sysctl-read)',
    '(allow file-read* (literal "/"))',
    `(allow file-read* ${SYSTEM_READS.map((path) => `(subpath ${quote(path)})`).join(' ')} ${DEVICE_READS.map((path) => `(literal ${quote(path)})`).join(' ')})`,
    `(allow file-read-metadata ${[...ancestors].map((path) => `(literal ${quote(path)})`).join(' ')})`,
    ...(allReads.length ? [`(allow file-read* ${allReads.map(filter).join(' ')})`] : []),
    '(allow file-write* (literal "/dev/null"))',
    ...(writes.length ? [`(allow file-write* ${writes.map(filter).join(' ')})`] : []),
    ...(programs.length ? [`(allow process-exec ${programs.map(filter).join(' ')})`] : []),
    ...(subprocesses ? ['(allow process-fork)', '(allow signal (target self))'] : []),
    ...(loopbackPort === undefined ? [] : [`(allow network-outbound (remote ip "localhost:${loopbackPort}"))`]),
  ].join('\n')
}

/** Synchronous runner for the pure-function judge. Forks are denied; a timeout
 * or output limit kills the sole candidate process, so no worker is left alive.
 */
export async function runIsolatedNode({ script, args = [], cwd, readOnly = [], input = '', timeoutMs = 3000, maxBuffer = 128 * 1024 }) {
  const node = await realpath(process.execPath)
  const profile = await seatbeltProfile({ readOnly: [script, cwd, ...readOnly], executables: [node] })
  return spawnSync('/usr/bin/sandbox-exec', ['-p', profile, node, '--max-old-space-size=128', script, ...args], {
    cwd, input, encoding: 'utf8', timeout: timeoutMs, maxBuffer, killSignal: 'SIGKILL',
    // Deliberately constructed environment: no provider keys, host HOME,
    // NODE_OPTIONS, injected loaders, shell startup files, or inherited FDs.
    env: { PATH: '/usr/bin:/bin', HOME: cwd, TMPDIR: cwd, TZ: 'Pacific/Honolulu', LANG: 'C.UTF-8' },
  })
}
