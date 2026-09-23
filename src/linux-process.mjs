import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { linuxRuntime } from './linux-runtime.mjs'
import { validateBridge } from './linux-bridge.mjs'

export async function containerReceipt(runId) {
  validateBridge({runId,port:1024})
  const runtime=await linuxRuntime()
  const value=JSON.parse(runtime.guest(['sudo','cat',`/var/lib/dsh-architecture-lab/runs/${runId}/supervisor.json`],{stdio:['pipe','pipe','pipe']}))
  if(value.runId!==runId)throw new Error('container receipt identity mismatch')
  return value
}

export async function verifyContainerCleanup(runId,image) {
  const receipt=await containerReceipt(runId)
  if(!receipt.cleanupVerified||!receipt.systemdCleanupCheckedAt||receipt.image!==image||!/^sha256:[a-f0-9]{64}$/.test(image??''))return null
  const runtime=await linuxRuntime()
  const remaining=runtime.guest(['sudo','docker','ps','--all','--quiet','--no-trunc','--filter',`label=dsh.architecture.run=${runId}`]).trim()
  return remaining?null:{runId,image,containerId:receipt.containerId,checkedAt:new Date().toISOString(),systemdCleanupCheckedAt:receipt.systemdCleanupCheckedAt}
}

/** A guest receipt remains authoritative even if the host SSH subprocess dies. */
export async function runLinuxProcess(config,{signal}={}) {
  validateBridge({runId:config.runId,port:1024})
  const runtime=await linuxRuntime()
  const child=runtime.spawnGuest(['sudo','python3','/opt/dsh-architecture-lab/launch.py',config.runId])
  const done=once(child,'close')
  let stdout='',stderr='',finished=false
  child.stdout.on('data',chunk=>{if(stdout.length<2*1024*1024)stdout+=chunk})
  child.stderr.on('data',chunk=>{if(stderr.length<64*1024)stderr+=chunk})
  child.stdin.on('error',()=>{})
  child.stdin.write(JSON.stringify(config)+'\n')
  const heartbeat=setInterval(()=>child.stdin.write('alive\n'),500)
  const cancel=()=>child.stdin.write('stop\n')
  signal?.addEventListener('abort',cancel,{once:true})
  if(signal?.aborted)cancel()
  try {
    const status=await Promise.race([done,delay(config.timeoutMs+65_000,undefined,{ref:false}).then(()=>null)])
    if(!status)throw new Error('container controller timed out; cleanup is unconfirmed')
    const receipt=await containerReceipt(config.runId)
    if(!receipt.cleanupVerified||!receipt.systemdCleanupCheckedAt)throw new Error('container cleanup is unconfirmed')
    if(receipt.image!==config.image)throw new Error('container image differs from the requested immutable identity')
    finished=true
    return {status:receipt.reason?null:receipt.exitCode??null,reason:receipt.reason,stdout:receipt.stdout??'',stderr:receipt.stderr??'',
      cleanupVerified:true,container:{runId:config.runId,containerId:receipt.containerId,image:receipt.image},receipt}
  } finally {
    clearInterval(heartbeat);signal?.removeEventListener('abort',cancel);child.stdin.end()
    if(!finished&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
  }
}
