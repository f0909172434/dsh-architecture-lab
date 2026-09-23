import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { project, versions, harness } from '../src/runtime.mjs'

const pinned = await versions()
const root = join(project, 'state', 'runtime', pinned.harness)
await mkdir(root, { recursive: true })
// Install only into this project's ignored runtime. Never replace the user's
// global DSH executable or modify their formal profile/credential directory.
const install = spawnSync('npm', ['install', '--prefix', root, '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', `@deepseek-ai/dsh@${pinned.harness}`], { stdio: 'inherit', timeout: 180_000 })
if (install.status !== 0) throw new Error('isolated Harness install failed')
const installed = await harness()
const check = spawnSync(process.execPath, [installed.bin, '--version'], { encoding: 'utf8', timeout: 10_000 })
if (check.status !== 0 || check.stdout.trim() !== pinned.harness) throw new Error('isolated Harness version check failed')
console.log(`Isolated Harness ${pinned.harness} ready; native tool execution remains subject to compatibility acceptance.`)
