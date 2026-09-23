import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'

if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new Error('this bootstrap requires macOS; other Docker hosts need a separately verified adapter')
const config=JSON.parse(await readFile(join(project,'containers/runtime.json'),'utf8'))
const tools=join(project,'state/tools'),installation=join(tools,`lima-${config.limaVersion}`)
const archive=join(tools,`lima-${config.limaVersion}.tar.gz`)
const binary=join(installation,'bin/limactl'),vmHome=join(project,'state/linux-vm')
const env={PATH:`${join(installation,'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,HOME:process.env.HOME,LIMA_HOME:vmHome,TMPDIR:process.env.TMPDIR??'/tmp'}
await mkdir(tools,{recursive:true,mode:0o700});await mkdir(vmHome,{recursive:true,mode:0o700})
let bytes
try{bytes=await readFile(archive)}catch(error){if(error.code!=='ENOENT')throw error}
if(!bytes){
  const url=`https://github.com/lima-vm/lima/releases/download/v${config.limaVersion}/lima-${config.limaVersion}-Darwin-${process.arch==='x64'?'x86_64':'arm64'}.tar.gz`
  console.log(`Downloading Lima ${config.limaVersion} from its official release.`)
  const response=await fetch(url);if(!response.ok)throw new Error('Lima download failed')
  await pipeline(Readable.fromWeb(response.body),createWriteStream(archive+'.download',{flags:'wx',mode:0o600}))
  await rename(archive+'.download',archive);bytes=await readFile(archive)
}
if(createHash('sha256').update(bytes).digest('hex')!==config.archives[process.arch])throw new Error('Lima archive checksum mismatch; no binary executed')
try{await stat(binary)}catch(error){
  if(error.code!=='ENOENT')throw error
  await mkdir(installation,{recursive:true});execFileSync('/usr/bin/tar',['-xzf',archive,'-C',installation])
}
const version=execFileSync(binary,['--version'],{encoding:'utf8',env}).trim()
if(!version.includes(config.limaVersion))throw new Error('unexpected Lima version')
console.log(version)
const run=(args)=>new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{env,stdio:'inherit'});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`Lima command failed (${code})`)))
})
const existing=execFileSync(binary,['list','--json'],{env,encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).find(item=>item.name===config.vmName)
await run(existing?['start','--tty=false',config.vmName]:['start','--tty=false','--name',config.vmName,join(project,'containers/lima.yaml')])
const info=JSON.parse(execFileSync(binary,['list',config.vmName,'--json'],{env,encoding:'utf8'}))
const guest=(args)=>execFileSync(binary,['shell','--workdir','/',config.vmName,...args],{env,encoding:'utf8'})
const docker=JSON.parse(guest(['sudo','docker','version','--format','{{json .}}']))
const mounts=JSON.parse(guest(['findmnt','--json','--output','TARGET,FSTYPE,SOURCE']))
const flattened=[]
const visit=entries=>{for(const entry of entries??[]){flattened.push(entry);visit(entry.children)}}
visit(mounts.filesystems)
if((info.config?.mounts??[]).length||flattened.some(entry=>['virtiofs','9p'].includes(entry.fstype)))throw new Error('unexpected host filesystem share')
if(info.config?.ssh?.forwardAgent!==false||info.config?.ssh?.loadDotSSHPubKeys!==false)throw new Error('unexpected host SSH forwarding/import')
const rule=info.config?.portForwards?.[0]
if(rule?.guestIP!=='0.0.0.0'||rule.guestIPMustBeZero!==false||rule.proto!=='any'||rule.ignore!==true||rule.guestPortRange?.join(',')!=='1,65535')throw new Error('automatic guest port forwarding must be disabled')
if(!info.config.images?.length||info.config.images.some(image=>!/^sha256:[a-f0-9]{64}$/.test(image.digest??'')))throw new Error('all guest image sources must be pinned')
await run(['shell','--workdir','/',config.vmName,'sudo','docker','pull',config.probeImage])
const facts={createdAt:new Date().toISOString(),lima:version,vm:info.name,status:info.status,arch:info.arch,mounts:info.config.mounts??[],hostFilesystemShares:[],ssh:info.config.ssh,portForwards:info.config.portForwards,images:info.config.images,docker}
await writeFile(join(vmHome,'installation.json'),JSON.stringify(facts,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({vm:config.vmName,status:info.status,dockerServer:docker.Server?.Version,paidRequests:0}))
