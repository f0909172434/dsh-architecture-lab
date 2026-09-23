import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, readdir, cp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderProfile } from '../src/runtime.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
test('profile paths survive spaces, quotes and replacement metacharacters', async () => {
  const projectRoot = '/tmp/Other user/"quoted"/$&/project'
  const stateRoot = '/tmp/Other user/"quoted"/$&/state'
  for (const entry of await readdir(join(project, 'profiles'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const source = await readFile(join(project, 'profiles', entry.name, 'package.json'), 'utf8')
    const value = JSON.parse(renderProfile(source, { projectRoot, stateRoot }))
    assert.equal(value.dependencies['dsh-architecture-lab'], `link:${projectRoot}`)
    const yaml = renderProfile(await readFile(join(project, 'profiles', entry.name, 'cordis.patch.yml'), 'utf8'), { projectRoot, stateRoot })
    for (const match of yaml.matchAll(/(?:dbDir|modelCacheDir): (.+)/g)) assert.ok(JSON.parse(match[1]).startsWith(stateRoot + '/'))
    assert.doesNotMatch(source + yaml, /\/Users\/wangzhikai/)
  }
})

test('doctor and live hold work from a clean source copy without upstream or runtime packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'architecture-clean-'))
  try {
    for (const path of ['src', 'tasks', 'versions.json', 'package.json']) await cp(join(project, path), join(root, path), { recursive: true })
    const env = { PATH: process.env.PATH, DSH_ARCH_LAB_ROOT: join(root, 'empty-state') }
    const doctor = spawnSync(process.execPath, ['src/cli.mjs', 'doctor'], { cwd: root, env, encoding: 'utf8' })
    assert.equal(doctor.status, 0, doctor.stderr)
    const status = JSON.parse(doctor.stdout)
    assert.equal(status.liveReady, false)
    assert.equal(status.isolatedHarness, null)
    assert.equal(status.evaluator, null)
    const trial = spawnSync(process.execPath, ['src/cli.mjs', 'run-one', 'debug-amount', '1', 'A'], { cwd: root, env, encoding: 'utf8' })
    assert.equal(trial.status, 1)
    assert.match(trial.stderr, /實機試驗暫停/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
