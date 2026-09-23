import { copyFile, cp, mkdir, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harness, project } from '../runtime.mjs'
import { spawnSync } from 'node:child_process'
import { runIsolatedProcess } from './process.mjs'
import { verifyDependencyBuild } from '../dependency-build.mjs'

/** One fresh runtime world. The caller owns fixtures, broker lifetime and the
 * trusted ledger; none of those parent directories are granted to the child.
 */
export async function prepareDshWorld(root, broker, { recipe = 'A', memorySnapshot, memoryCache, workspace: suppliedWorkspace } = {}) {
  if (!['A','B','C','D'].includes(recipe)) throw new Error('unknown trial recipe')
  const memory = recipe==='B'||recipe==='D', planning=recipe==='C'||recipe==='D'
  if(memory)await verifyDependencyBuild('engram')
  if(planning)await verifyDependencyBuild('planner')
  const runtime = await harness()
  const home = join(root, 'home'), workspace = suppliedWorkspace ?? join(root, 'workspace')
  const profile = join(home, 'profiles', 'trial')
  const extraReads=[],extraWrites=[],bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless']
  await mkdir(home)
  if(suppliedWorkspace) { if(!(await stat(workspace)).isDirectory()) throw new Error('evaluator workspace is missing') }
  else await mkdir(workspace)
  await mkdir(profile, { recursive: true })
  // Stop native repository-root discovery at the synthetic workspace rather
  // than traversing toward the lab's private source/evidence parent.
  const template = join(home,'empty-git-template'); await mkdir(template)
  const init = spawnSync('git',['init','--quiet','--initial-branch=trial',`--template=${template}`,workspace],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:home,GIT_CONFIG_NOSYSTEM:'1'}})
  if (init.status !== 0) throw new Error('could not initialize the synthetic trial repository')
  await writeFile(join(home, 'settings.yaml'), 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n  reasoningEffort: high\n')
  await mkdir(join(profile,'node_modules'))
  let memoryDir
  if(memory){
    if(!memorySnapshot||!memoryCache)throw new Error('memory recipe requires a frozen snapshot and local model cache')
    const engram=join(project,'upstream/dsh-engram')
    await stat(join(engram,'lib/index.js'));await stat(memoryCache)
    memoryDir=join(root,'memory');await mkdir(memoryDir);await copyFile(memorySnapshot,join(memoryDir,'user.db'))
    await mkdir(join(profile,'node_modules/@kenz1117'))
    await symlink(engram,join(profile,'node_modules/@kenz1117/dsh-engram'))
    bundles.push('@kenz1117/dsh-engram');extraReads.push(engram,memoryCache);extraWrites.push(memoryDir)
  }
  if(planning){
    const planner=join(project,'upstream/dsh-plan-and-execute');await stat(join(planner,'lib/index.js'))
    // An installed package's original profile fallback is outside this world.
    // Copy it into a read-only trial module tree and bind its host peers to the
    // exact same runtime as the new DSH process, instead of granting old homes.
    const isolatedModules=join(root,'modules','node_modules');await mkdir(isolatedModules,{recursive:true})
    const isolatedPlanner=join(isolatedModules,'dsh-plan-and-execute');await mkdir(isolatedPlanner)
    for(const file of ['lib','package.json','cordis.patch.yml']) await cp(join(planner,file),join(isolatedPlanner,file),{recursive:true})
    await symlink(join(runtime.root,'node_modules/@deepseek-ai'),join(isolatedModules,'@deepseek-ai'))
    await symlink(join(isolatedModules,'dsh-plan-and-execute'),join(profile,'node_modules/dsh-plan-and-execute'))
    bundles.push('dsh-plan-and-execute');extraReads.push(join(root,'modules'))
  }
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'architecture-trial-world', private: true, dsh: { profile: { bundles, patchReload: 'startup' } } }))
  await writeFile(join(profile, 'cordis.yml'), '[]\n')
  const disabled = ['session-title-llm', 'skill-filesystem', 'tool-subagent', 'tool-subagent-fork', 'tool-workflow', 'tool-ralph', 'tool-web']
  const patch = [
    ...disabled.map(id => `- id: ${id}\n  disabled: true`),
    '- id: settings\n  config:\n    watch: false',
    '- id: credentials\n  config:\n    watch: false',
    '- id: tools\n  config:\n    mode: native',
    ...(memory ? [`- id: dsh-engram\n  config:\n    dbDir: ${JSON.stringify(memoryDir)}\n    modelCacheDir: ${JSON.stringify(memoryCache)}\n    ingest: off\n    legacyMigration: conservative`] : []),
    ...(planning ? ['- id: headless-runner\n  disabled: true',`- insert:\n    - id: architecture-planner-runner\n      name: ${JSON.stringify(join(project,'src/planner-runner.mjs'))}`] : []),
    `- insert:\n    - id: architecture-trial-agent\n      name: ${JSON.stringify(join(project,'src/trial-agent.mjs'))}`,
  ].join('\n')+'\n'
  await writeFile(join(profile, 'cordis.patch.yml'), patch)
  return {
    root, home, workspace,
    run: (prompt, { signal, timeoutMs = 600_000 } = {}) => runIsolatedProcess({
      args: [runtime.bin, '--profile', 'trial', prompt], cwd: workspace, home,
      readOnly: [join(runtime.root, 'node_modules'), join(project, 'src'), join(project, 'package.json'),...extraReads],
      readWrite: [home, workspace,...extraWrites], executables: ['/bin/bash', '/bin/cat', '/bin/ls', '/usr/bin/env'],
      loopbackPort: broker.port, timeoutMs, signal,
      env: { DSH_HOME: home, DSH_PERMISSION_MODE: 'danger-full-access', DEEPSEEK_BASE_URL: broker.baseURL, DEEPSEEK_API_KEY: broker.token },
    }),
  }
}
