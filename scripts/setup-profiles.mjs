import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { harness, renderProfile } from '../src/runtime.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = resolve(process.env.DSH_ARCH_LAB_ROOT ?? join(project, 'state'))
const home = join(root, 'dsh-home')
const runtime = await harness()
await mkdir(home, { recursive: true })
const desiredSettings = await readFile(join(project, 'profiles', 'settings.yaml'), 'utf8')
try {
  const currentSettings = await readFile(join(home, 'settings.yaml'), 'utf8')
  if (currentSettings !== desiredSettings) throw new Error('isolated settings.yaml differs from pinned DeepSeek Flash/high selection')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await copyFile(join(project, 'profiles', 'settings.yaml'), join(home, 'settings.yaml'))
}
const launcher = spawnSync(process.execPath, [runtime.bin, '--version'], { encoding: 'utf8' })
if (launcher.status !== 0 || launcher.stdout.trim() !== runtime.version) throw new Error('pinned isolated Harness cannot start')

for (const name of ['lab-a', 'lab-b', 'lab-c', 'lab-d']) {
  const source = join(project, 'profiles', name)
  const target = join(home, 'profiles', name)
  await mkdir(target, { recursive: true })
  const render = async file => renderProfile(await readFile(join(source, file), 'utf8'), { projectRoot: project.replace(/\/$/, ''), stateRoot: root })
  for (const file of ['package.json', 'cordis.yml', 'cordis.patch.yml']) await writeFile(join(target, file), await render(file))
  await copyFile(join(project, 'profiles', 'pnpm-workspace.yaml'), join(target, 'pnpm-workspace.yaml'))
  const config = JSON.parse(await render('package.json'))
  const packages = Object.keys(config.dependencies)
  const installSpecs = Object.entries(config.dependencies).map(([dependency, version]) => version.startsWith('link:') ? version.slice(5) : `${dependency}@${version}`)
  const install = spawnSync(process.execPath, [runtime.bin, 'plugin', '--profile', name, 'add', ...installSpecs], { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', timeout: 180_000 })
  // pnpm 11 reports ignored optional native build scripts as a nonzero exit,
  // even when the package and its JavaScript entrypoint installed successfully.
  for (const dependency of packages) {
    const packagePath = join(target, 'node_modules', dependency, 'package.json')
    try { await stat(packagePath) } catch { throw new Error(`${name}: ${dependency} installation failed: ${install.stderr.slice(-1200)}`) }
  }
  const diagnostic = `${install.stdout ?? ''}\n${install.stderr ?? ''}`
  if (install.status !== 0 && !diagnostic.includes('ERR_PNPM_IGNORED_BUILDS')) throw new Error(`${name}: installer failed: ${diagnostic.slice(-1200)}`)
  await writeFile(join(target, 'package.json'), await render('package.json'))
  await writeFile(join(target, 'cordis.patch.yml'), await render('cordis.patch.yml'))
  const composed = spawnSync(process.execPath, [runtime.bin, '--profile', name, '--dump-config'], { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', timeout: 30_000 })
  if (composed.status !== 0 || !composed.stdout.includes('id: dsh-architecture-lab')) throw new Error(`${name}: config composition failed`)
  console.log(`${name}: ${packages.join(', ')} ready`)
}
