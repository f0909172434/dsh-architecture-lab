import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harness, project } from '../src/runtime.mjs'

const revision='edfd704cbeaff4190f1f9abbef9472a9374f7bfb'
const checkout=join(project,'upstream/dsh-engram')
const patch=join(project,'patches/dsh-engram-0.7.12-user-source.patch')
const runtime=await harness()
function run(binary,args,cwd=checkout){
  const result=spawnSync(binary,args,{cwd,encoding:'utf8',timeout:180000})
  if(result.status!==0)throw new Error(`${binary} failed: ${(result.stderr||result.stdout).slice(-1800)}`)
  return result.stdout.trim()
}
try{await stat(checkout)}catch(error){
  if(error.code!=='ENOENT')throw error
  run('git',['clone','--filter=blob:none','--no-checkout','https://github.com/kenz1117/dsh-engram.git',checkout],project)
  run('git',['checkout','--detach',revision])
}
if(run('git',['rev-parse','HEAD'])!==revision)throw new Error('Engram source is not the pinned revision')
if(spawnSync('git',['apply','--reverse','--check',patch],{cwd:checkout}).status!==0)run('git',['apply',patch])
run('pnpm',['install','--frozen-lockfile','--ignore-scripts','--config.auto-install-peers=false'])
const scope=join(checkout,'node_modules/@deepseek-ai')
const target=join(runtime.root,'node_modules/@deepseek-ai')
try{if(await realpath(scope)!==await realpath(target))throw new Error('Engram peer namespace belongs to another runtime')}
catch(error){if(error.code!=='ENOENT')throw error;await symlink(target,scope)}
// Invoke installed binaries directly: pnpm 11 exec can re-run dependency
// installation with different peer settings and fetch unpublished host types.
console.log(run(join(checkout,'node_modules/.bin/vitest'),['run','tests/security.spec.ts']))
run(join(checkout,'node_modules/.bin/tsdown'),[])
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex')
await mkdir(join(project,'state/patches'),{recursive:true})
await writeFile(join(project,'state/patches/engram-build.json'),JSON.stringify({revision,version:'0.7.12',harness:runtime.version,patchSha256:await sha(patch),bundleSha256:await sha(join(checkout,'lib/index.js')),lockSha256:await sha(join(checkout,'pnpm-lock.yaml')),testedAt:new Date().toISOString()},null,2)+'\n')
console.log('Engram source-attribution patch built and verified in the independent upstream copy.')
