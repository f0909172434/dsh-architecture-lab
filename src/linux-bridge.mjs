import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { project } from './runtime.mjs'
import { linuxRuntime } from './linux-runtime.mjs'

export function validateBridge({runId,port}) {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId??''))throw new Error('invalid bridge identity')
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid broker port')
}

export async function openLinuxBridge({runId,port}) {
  validateBridge({runId,port})
  const runtime=await linuxRuntime(),directory=`/run/dsh-architecture-bridges/${runId}`
  const uid=runtime.guest(['id','-u']).trim(),gid=runtime.guest(['id','-g']).trim()
  if(!/^\d+$/.test(uid)||!/^\d+$/.test(gid))throw new Error('guest login identity unavailable')
  runtime.guest(['sudo','install','-d','-m','0711','/run/dsh-architecture-bridges'])
  // UUID is fresh and must not replace a still-owned endpoint.
  runtime.guest(['sudo','mkdir',directory])
  runtime.guest(['sudo','chown',`${uid}:${gid}`,directory])
  runtime.guest(['sudo','chmod','0700',directory])
  const child=spawn('/usr/bin/ssh',[
    '-F',join(project,'state/linux-vm',runtime.config.vmName,'ssh.config'),
    '-S','none','-o','ControlMaster=no','-o','ControlPersist=no','-o','ForwardAgent=no',
    '-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=2','-o','ServerAliveCountMax=2',
    '-T','-R',`${directory}/broker.sock:127.0.0.1:${port}`,`lima-${runtime.config.vmName}`,
    'python3','/opt/dsh-architecture-lab/bridge-lease.py',runId,
  ],{env:runtime.env,stdio:['pipe','pipe','pipe']})
  const ended=once(child,'close')
  let stdout='',stderr=''
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
  child.stdin.on('error',()=>{})
  child.stdin.write('alive\n')
  const heartbeat=setInterval(()=>child.stdin.write('alive\n'),500)
  ended.finally(()=>clearInterval(heartbeat))
  async function close(){
    clearInterval(heartbeat);child.stdin.end()
    await Promise.race([ended,delay(2000)])
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await ended}
    const absent=runtime.guest(['test','!','-e',`${directory}/broker.sock`],{stdio:['pipe','pipe','pipe']})
    return {closed:true}
  }
  try {
    const deadline=Date.now()+8000
    while(!stdout.includes('ARCHITECTURE_BRIDGE_READY')) {
      if(child.exitCode!==null||child.signalCode!==null)throw new Error('reverse broker bridge failed: '+stderr.slice(-500))
      if(Date.now()>deadline)throw new Error('reverse broker bridge readiness timed out')
      await delay(50)
    }
  } catch(error){await close().catch(()=>{});throw error}
  return {runId,close,child}
}
