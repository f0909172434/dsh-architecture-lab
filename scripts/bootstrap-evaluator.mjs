import { spawnSync } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const checkout = join(project, 'upstream', 'dsh-eval-harness')
const patch = join(project, 'patches', 'dsh-eval-harness-0.4.0.patch')
const revision = 'bccfc67aa72380950fb2062e00289ab83f78b60a'
function run(bin, args, cwd = project) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 180_000 })
  if (result.status !== 0) throw new Error(`${bin} ${args.slice(0, 3).join(' ')} failed: ${(result.stderr || result.stdout).slice(-1500)}`)
  return result.stdout.trim()
}
try { await stat(checkout) } catch {
  run('git', ['clone', '--filter=blob:none', 'https://github.com/BiBoyang/dsh-eval-harness.git', checkout])
  run('git', ['fetch', '--depth', '1', 'origin', revision], checkout)
  run('git', ['checkout', '--detach', revision], checkout)
}
if (run('git', ['rev-parse', 'HEAD'], checkout) !== revision) throw new Error('evaluator checkout is not the pinned 0.4.0 source')
const reverse = spawnSync('git', ['apply', '--reverse', '--check', patch], { cwd: checkout, encoding: 'utf8' })
if (reverse.status !== 0) run('git', ['apply', patch], checkout)
run('pnpm', ['install', '--frozen-lockfile'], checkout)
run('pnpm', ['build'], checkout)
console.log('Pinned evaluator 0.4.0 and architecture-lab compatibility patch are ready.')
