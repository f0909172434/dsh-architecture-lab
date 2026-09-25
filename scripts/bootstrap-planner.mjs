import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harness, project } from '../src/runtime.mjs'

const revision='43f61c864872e1c7ecfa621797116b9dd5db91cf'
const checkout=join(project,'upstream/dsh-plan-and-execute')
const patch=join(project,'patches/dsh-plan-and-execute-0.5.0-rc3.patch')
const runtime=await harness()
function run(binary,args,cwd=checkout,extraEnv={}){
  const result=spawnSync(binary,args,{cwd,encoding:'utf8',timeout:180000,env:{...process.env,...extraEnv}})
  if(result.status!==0)throw new Error(`${binary} failed: ${(result.stderr||result.stdout).slice(-1800)}`)
  return result.stdout.trim()
}
await mkdir(join(project,'upstream'),{recursive:true})
try{await stat(checkout)}catch(error){
  if(error.code!=='ENOENT')throw error
  run('git',['clone','--filter=blob:none','--no-checkout','https://github.com/jimmyzhang219/dsh-plan-and-execute.git',checkout],project)
  run('git',['checkout','--detach',revision])
}
if(run('git',['rev-parse','HEAD'])!==revision)throw new Error('planner source is not the pinned revision')
if(spawnSync('git',['apply','--unidiff-zero','--reverse','--check',patch],{cwd:checkout}).status!==0)run('git',['apply','--unidiff-zero',patch])
run('pnpm',['install','--frozen-lockfile','--ignore-scripts','--config.auto-install-peers=false'])
const scope=join(checkout,'node_modules/@deepseek-ai')
await mkdir(scope,{recursive:true})
const hostScope=join(runtime.root,'node_modules/@deepseek-ai')
for(const name of await readdir(hostScope)){
  const target=join(hostScope,name),link=join(scope,name)
  try{
    const existing=await lstat(link)
    if(await realpath(link).catch(()=>null)===await realpath(target))continue
    if(!existing.isSymbolicLink())throw new Error(`planner peer ${name} is not a replaceable link`)
    await unlink(link)
  }catch(error){if(error.code!=='ENOENT')throw error}
  await symlink(target,link)
}
// The plugin's browser peer types are pinned in its patched devDependencies.
// Validate the whole TypeScript program before producing server/client declarations.
console.log(run(join(checkout,'node_modules/.bin/tsc'),['--noEmit']))
run(join(checkout,'node_modules/.bin/tsup'),[])
console.log(run(process.execPath,['scripts/assert-client-wrapper.mjs']))
console.log(run(join(checkout,'node_modules/.bin/vitest'),['run','test/host-adapter.spec.ts','test/index.spec.ts','test/orchestrator.spec.ts']))
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex')
await mkdir(join(project,'state/patches'),{recursive:true})
await writeFile(join(project,'state/patches/planner-build.json'),JSON.stringify({revision,version:'0.5.0',harness:runtime.version,patchSha256:await sha(patch),bundleSha256:await sha(join(checkout,'lib/index.js')),serverTypesSha256:await sha(join(checkout,'lib/index.d.ts')),clientSha256:await sha(join(checkout,'lib/client/client.js')),clientTypesSha256:await sha(join(checkout,'lib/client/client.d.cts')),lockSha256:await sha(join(checkout,'pnpm-lock.yaml')),browserTypesValidated:true,testedAt:new Date().toISOString()},null,2)+'\n')
console.log('Planner rc.3 adapter built and verified in the independent upstream copy.')
