import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'
import { verifyLinuxImage } from '../src/isolation/linux-dsh.mjs'
import { runLinuxProcess } from '../src/linux-process.mjs'
import { updateRegistry } from '../src/registry.mjs'
import { runManagedTrial } from '../src/manager.mjs'

const root=await mkdtemp(join(project,'state/deadline-acceptance-')),image=await verifyLinuxImage()
const deadlineAt=Date.now()+1500,controller=new AbortController()
// If the absolute deadline regresses, stop the probe instead of waiting ten minutes.
const guard=setTimeout(()=>controller.abort(),8000)
let result
try{
  result=await runLinuxProcess({runId:randomUUID(),image:image.imageId,timeoutMs:600000,deadlineAt,command:['node','-e','console.log("deadline probe started");setInterval(()=>{},1000)']},{signal:controller.signal})
}finally{clearTimeout(guard)}
assert.equal(result.reason,'timeout',JSON.stringify(result));assert.equal(result.cleanupVerified,true)
assert.equal(result.receipt.deadlineAt,deadlineAt)
assert.ok(result.stdout.includes('deadline probe started'),'probe must actually launch')
assert.ok(result.receipt.finishedAt*1000<deadlineAt+5000,'cleanup must finish promptly after the original deadline')

// A labelled synthetic prior attempt leaves eight seconds in the same logical
// trial. The resumed actual DSH process must not receive another ten minutes.
const firstStartedAt=new Date(Date.now()-592000).toISOString()
updateRegistry(root,state=>state.runs.push({runId:randomUUID(),trialId:'offline-stale-fee-A-1',mode:'offline',status:'interrupted',backend:'linux',cleanupVerified:true,startedAt:firstStartedAt,firstStartedAt,attempt:1,taskId:'stale-fee',recipe:'A',repetition:1}))
const row=await runManagedTrial({root,mode:'offline',recipe:'A',resume:true,backend:'linux',responseDelayMs:2000})
assert.equal(row.firstStartedAt,firstStartedAt);assert.equal(row.deadlineAt,Date.parse(firstStartedAt)+600000)
assert.equal(row.status,'interrupted',JSON.stringify(row));assert.equal(row.cleanupVerified,true)
assert.ok(row.requests>0,'deadline test must include an actual offline provider dispatch')
assert.ok(row.durationMs<15000,'resumed staging, calls and cleanup must use the original deadline')
const summary={createdAt:new Date().toISOString(),passed:true,paidRequests:0,comparisonEligible:false,imageId:image.imageId,
  guestAbsoluteDeadline:true,independentCleanup:true,researchResumeOriginalDeadline:true,actualOfflineRequests:row.requests,
  resumedElapsedMs:row.durationMs,deadlineAt:row.deadlineAt,firstStartedAt,limitation:'The prior interrupted attempt is synthetic; the guest deadline and resumed DSH process are real offline executions.'}
await writeFile(join(root,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({root,...summary}))
