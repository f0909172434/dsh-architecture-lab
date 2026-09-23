import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegistry } from '../src/registry.mjs'
import { harness } from '../src/runtime.mjs'
import { recipe } from '../src/recipes.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = process.env.DSH_ARCH_LAB_ROOT ?? join(project, 'state')
const runtime = await harness()
const selected = recipe(readRegistry(root).selectedRecipe)
const profile = `lab-web-${selected.id.toLowerCase()}`
const manifest = JSON.parse(await readFile(join(root, 'dsh-home', 'profiles', profile, 'package.json'), 'utf8'))
const bundles = manifest.dsh.profile.bundles
if (bundles.includes('@kenz1117/dsh-engram') !== selected.memory || bundles.includes('dsh-plan-and-execute') !== selected.planning) throw new Error(`profile ${profile} does not match recipe ${selected.id}`)
console.log(`Opening ${selected.id} ${selected.label} in isolated DSH profile ${profile}`)
const child = spawn(process.execPath, [runtime.bin,'--profile', profile, '--port', '0', ...(process.argv.includes('--no-open') ? ['--no-open'] : [])], { cwd: project, env: { ...process.env, DSH_HOME: join(root, 'dsh-home') }, stdio: 'inherit' })
child.on('exit', (code, signal) => { process.exitCode = signal ? 130 : code ?? 1 })
