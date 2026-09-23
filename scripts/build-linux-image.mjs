import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, cp, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { project } from '../src/runtime.mjs'
import { linuxRuntime } from '../src/linux-runtime.mjs'

const runtime=await linuxRuntime(),context=await mkdtemp(join(project,'state/linux-image-context-'))
const files=['versions.json','package.json','src/runtime.mjs','src/trial-agent.mjs','src/completion-protocol.mjs','src/planner-runner.mjs',
  'scripts/bootstrap-runtime.mjs','scripts/bootstrap-engram.mjs','scripts/bootstrap-planner.mjs',
  'patches/dsh-engram-0.7.12-user-source.patch','patches/dsh-plan-and-execute-0.5.0-rc3.patch']
const manifest=[]
async function copy(source,target){await mkdir(dirname(target),{recursive:true});await cp(source,target);manifest.push({path:target.slice(context.length+1),sha256:createHash('sha256').update(await readFile(target)).digest('hex')})}
for(const file of files)await copy(join(project,file),join(context,file))
for(const name of ['Dockerfile','relay.mjs','entrypoint.mjs'])await copy(join(project,'containers',name),join(context,name))
for(const file of ['config.json','tokenizer.json','tokenizer_config.json','onnx/model_quantized.onnx']){
  const base='Xenova/bge-small-zh-v1.5/'
  await copy(join(project,'state/engram/models',base,file),join(context,'models',base,file))
}
manifest.sort((a,b)=>a.path.localeCompare(b.path))
await writeFile(join(context,'context-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
const tag='dsh-architecture-lab:runtime'
const build=runtime.spawnGuest(['sudo','docker','build','--progress=plain','--build-arg',`BASE_IMAGE=${runtime.config.probeImage}`,'--tag',tag,'-'])
build.stdout.pipe(process.stdout);build.stderr.pipe(process.stderr)
build.stdin.on('error',()=>{})
const tar=spawn('/usr/bin/tar',['-czf','-','-C',context,...await readdir(context)],{env:{PATH:'/usr/bin:/bin',COPYFILE_DISABLE:'1'},stdio:['ignore','pipe','inherit']})
tar.stdout.pipe(build.stdin)
const done=await Promise.all([once(tar,'close'),once(build,'close')])
if(done.some(([code])=>code!==0))throw new Error('Linux runtime build failed; previous runtime acceptance is unchanged')
const image=JSON.parse(runtime.guest(['sudo','docker','image','inspect',tag]))[0]
// Retain the actual transitive locks, not just the top-level package versions.
// Rebuilding from npm may resolve a different graph; image identity still owns
// trial reproducibility. No candidate files or account data are read here.
const lockReader=`const fs=require('node:fs');const v=JSON.parse(fs.readFileSync('/opt/lab/versions.json'));const paths=['state/runtime/'+v.harness+'/package-lock.json','upstream/dsh-engram/pnpm-lock.yaml','upstream/dsh-plan-and-execute/pnpm-lock.yaml'];process.stdout.write(JSON.stringify(Object.fromEntries(paths.map(path=>[path,fs.readFileSync('/opt/lab/'+path,'utf8')]))));`
const locks=runtime.guest(['sudo','docker','run','--rm','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',image.Id,'node','-e',lockReader])
JSON.parse(locks)
await writeFile(join(project,'state/linux-vm/runtime-dependency-locks.json'),locks,{mode:0o600})
const record={createdAt:new Date().toISOString(),imageId:image.Id,baseImage:runtime.config.probeImage,architecture:image.Architecture,manifest,
  dependencyLocksSha256:createHash('sha256').update(locks).digest('hex'),paidRequests:0,accepted:false}
await writeFile(join(project,'state/linux-vm/runtime-image.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({imageId:image.Id,accepted:false,paidRequests:0}))
