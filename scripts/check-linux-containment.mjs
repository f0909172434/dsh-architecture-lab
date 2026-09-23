import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { linuxRuntime } from '../src/linux-runtime.mjs'
import { project } from '../src/runtime.mjs'

const runtime=await linuxRuntime()
const image=JSON.parse(runtime.guest(['sudo','docker','image','inspect',runtime.config.probeImage]))[0]
assert.match(image.Id,/^sha256:[a-f0-9]{64}$/)
const root=await mkdtemp(join(project,'state/linux-containment-'))
const results=[]
const receiptPath=id=>`/var/lib/dsh-architecture-lab/runs/${id}/supervisor.json`
const guestRead=path=>runtime.guest(['sudo','cat',path],{stdio:['pipe','pipe','pipe']})
const receipt=id=>JSON.parse(guestRead(receiptPath(id)))
async function until(check, timeout=15_000) {
  const deadline=Date.now()+timeout
  let last
  while(Date.now()<deadline) {
    try { const result=check(); if(result)return result } catch(error) { last=error }
    await delay(150)
  }
  throw new Error('acceptance condition timed out',{cause:last})
}
function launch(config,worker=false) {
  let child
  if(worker) {
    // Killing this real controlling process also removes its heartbeat writer.
    // The guest must clean up without relying on its finally handlers.
    const source=`import {linuxRuntime} from ${JSON.stringify(new URL('../src/linux-runtime.mjs',import.meta.url).href)};
      const runtime=await linuxRuntime();
      const child=runtime.spawnGuest(['sudo','python3','/opt/dsh-architecture-lab/launch.py',${JSON.stringify(config.runId)}]);
      child.stdin.on('error',()=>{});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
      child.stdin.write(${JSON.stringify(JSON.stringify(config)+'\n')});
      const timer=setInterval(()=>child.stdin.write('alive\\n'),500);
      child.once('close',()=>{clearInterval(timer);process.exit(0)});`
    child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME}})
  } else {
    child=runtime.spawnGuest(['sudo','python3','/opt/dsh-architecture-lab/launch.py',config.runId])
    child.stdin.on('error',()=>{})
    child.stdin.write(JSON.stringify(config)+'\n')
  }
  let output='',errors=''
  child.stdout.on('data',chunk=>output+=chunk)
  child.stderr.on('data',chunk=>errors+=chunk)
  const done=once(child,'close')
  const heartbeat=worker?null:setInterval(()=>child.stdin.write('alive\n'),500)
  done.finally(()=>clearInterval(heartbeat))
  return {child,done,logs:()=>({output,errors}),stop:()=>child.stdin.write('stop\n'),noHeartbeat:()=>clearInterval(heartbeat)}
}
const descendant=`const fs=require('node:fs');fs.writeFileSync('/work/descendant',String(process.pid));setInterval(()=>fs.appendFileSync('/work/ticks','x'),50);setTimeout(()=>process.exit(0),30000)`
function command(normal=false) {
  return ['node','-e',`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'}).unref();${normal?'setTimeout(()=>process.exit(0),1200)':'setInterval(()=>{},1000)'}`]
}
async function run(name,{mode,timeoutMs=15_000,cmd=command(),reason=null}={}) {
  const runId=randomUUID(),config={runId,image:image.Id,timeoutMs,command:cmd}
  const control=launch(config,mode==='host-death')
  const workspace=`/var/lib/dsh-architecture-lab/runs/${runId}/workspace`
  try {
    if(mode) {
      await until(()=>guestRead(workspace+'/ticks').length>0)
      if(mode==='cancel')control.stop()
      if(mode==='lease')control.noHeartbeat()
      if(mode==='host-death')control.child.kill('SIGKILL')
      if(mode==='guest-death')runtime.guest(['sudo','systemctl','kill','--signal=SIGKILL','--kill-whom=main',`dsh-lab-${runId}.service`])
    }
    const data=await until(()=>{const r=receipt(runId);return r.systemdCleanupCheckedAt&&r},timeoutMs+12_000)
    assert.equal(data.cleanupVerified,true)
    assert.equal(data.reason,reason)
    if(reason===null)assert.equal(data.exitCode,0)
    const names=runtime.guest(['sudo','docker','ps','--all','--quiet','--filter',`name=^/dsh-lab-${runId}$`]).trim()
    assert.equal(names,'')
    if(cmd[0]==='node'&&cmd[2].includes('detached:true')) {
      const before=guestRead(workspace+'/ticks')
      assert.ok(before.length>0,'detached descendant actually ran')
      await delay(300)
      assert.equal(guestRead(workspace+'/ticks'),before,'detached descendant cannot write after cleanup')
    }
    await Promise.race([control.done,delay(3_000).then(()=>{throw new Error('local controller did not exit')})])
    const result={name,runId,passed:true,...data}
    results.push(result)
    await writeFile(join(root,`${name}.json`),JSON.stringify({config,result,...control.logs()},null,2)+'\n')
    console.log(JSON.stringify({name,passed:true,reason:data.reason,cleanupVerified:true}))
    return data
  } finally {
    control.noHeartbeat()
    if(control.child.exitCode===null&&control.child.signalCode===null)control.child.stdin.end()
  }
}
try {
  await run('normal-detached',{cmd:command(true)})
  await run('cancel-detached',{mode:'cancel',reason:'cancelled'})
  await run('deadline-detached',{timeoutMs:2500,reason:'timeout'})
  await run('heartbeat-expired',{mode:'lease',reason:'controller_lost'})
  await run('host-controller-killed',{mode:'host-death',reason:'controller_lost'})
  await run('guest-supervisor-killed',{mode:'guest-death',reason:'supervisor_lost'})
  await run('output-limit',{cmd:['node','-e',"const fs=require('node:fs'),chunk=Buffer.alloc(65536,120);for(;;)fs.writeSync(1,chunk)"],reason:'output_limit'})
  const boundary=await run('filesystem-network-boundary',{cmd:['node','-e',`const fs=require('node:fs'),assert=require('node:assert/strict');
    assert.equal(process.getuid(),1000);assert.deepEqual(Object.keys(require('node:os').networkInterfaces()),['lo']);
    for(const path of ['/var/run/docker.sock','/Users','/var/lib/dsh-architecture-lab','/opt/dsh-architecture-lab'])assert.equal(fs.existsSync(path),false);
    assert.throws(()=>fs.writeFileSync('/image-write','x'));assert.throws(()=>fs.readdirSync('/proc/1/root/root'));
    const status=fs.readFileSync('/proc/self/status','utf8');assert.match(status,/NoNewPrivs:\\s+1/);assert.match(status,/CapEff:\\s+0+/);
    console.log(JSON.stringify({uid:process.getuid(),networkInterfaces:Object.keys(require('node:os').networkInterfaces()),restrictions:true}));`]})
  const summary={createdAt:new Date().toISOString(),schemaVersion:1,passed:true,paidRequests:0,imageId:image.Id,imageDigests:image.RepoDigests,results:results.map(({name,runId,reason,exitCode,cleanupVerified,passed})=>({name,runId,reason,exitCode,cleanupVerified,passed})),boundary:JSON.parse(boundary.stdout),limits:['Fixture containment only; DSH container integration and broker bridge are not yet accepted.']}
  await writeFile(join(root,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
  console.log(root)
} catch(error) {
  await writeFile(join(root,'failure.json'),JSON.stringify({error:String(error),results},null,2)+'\n')
  throw error
}
