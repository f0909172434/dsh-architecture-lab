// Kill the real host controller after a broker dispatch. No model account or
// real budget ledger is used. The guest must independently clean the container.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { project } from '../src/runtime.mjs'
import { readRegistry } from '../src/registry.mjs'
import { recoverRegistry, runManagedTrial } from '../src/manager.mjs'
import { verifyContainerCleanup } from '../src/linux-process.mjs'
import { auditRunEvidence } from '../src/run-evidence.mjs'

const root=await mkdtemp(join(project,'state/linux-recovery-'))
console.log(JSON.stringify({root,paidRequests:0}))
const script=`import {runManagedTrial} from ${JSON.stringify(new URL('../src/manager.mjs',import.meta.url).href)}; await runManagedTrial({root:${JSON.stringify(root)},recipe:'A',mode:'offline',backend:'linux',responseDelayMs:2000});`
const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['ignore','ignore','pipe']})
const exited=once(child,'exit');let stderr='';child.stderr.on('data',chunk=>stderr+=chunk)
let lost
try{
  for(let i=0;i<400;i++){
    lost=readRegistry(root).runs[0]
    if(lost){try{await readFile(join(lost.outputDir,'request-progress.json'));break}catch(error){if(error.code!=='ENOENT')throw error}}
    if(child.exitCode!==null)throw new Error(`controller exited before dispatch: ${stderr}`)
    await delay(50)
  }
  assert.ok(lost?.containerRunId,'container mapping must be durable before dispatch')
  await readFile(join(lost.outputDir,'request-progress.json'))
  const ledgerPath=join(root,'v2/offline-budget/budget.json')
  const before=JSON.parse(await readFile(ledgerPath,'utf8')).entries
  assert.ok(before.length>=1);assert.ok(before.some(entry=>entry.status==='reserved'))
  child.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL')
  let recovered
  for(let i=0;i<100;i++){
    recovered=await recoverRegistry(root)
    assert.equal(recovered.active,null)
    if(recovered.runs[0].cleanupVerified)break
    await delay(100)
  }
  const old=recovered.runs[0]
  assert.equal(old.status,'interrupted');assert.equal(old.terminalReason,'controller_lost')
  assert.equal(old.cleanupVerified,true,JSON.stringify(old))
  assert.ok(await verifyContainerCleanup(old.containerRunId,old.containerImage))
  assert.equal(old.requests,before.length);assert.equal(old.costTwd,null)
  const evidenceAudit=await auditRunEvidence(root,old)
  assert.equal(evidenceAudit.integrityVerified,true,JSON.stringify(evidenceAudit))
  assert.equal(evidenceAudit.eligible,false)
  assert.deepEqual(JSON.parse(await readFile(ledgerPath,'utf8')).entries,before,'recovery may not settle or release uncertain requests')
  await writeFile(join(root,'recovered-record.json'),JSON.stringify(old,null,2)+'\n')
  await assert.rejects(runManagedTrial({root,recipe:'A',mode:'offline',backend:'linux'}),/已有紀錄/)
  const resumed=await runManagedTrial({root,recipe:'A',mode:'offline',backend:'linux',resume:true})
  assert.equal(resumed.attempt,2);assert.equal(resumed.status,'completed');assert.equal(resumed.test.pass,true)
  assert.equal(resumed.trialId,old.trialId);assert.notEqual(resumed.containerRunId,old.containerRunId)
  assert.deepEqual(readRegistry(root).runs[0],old,'explicit resume must retain the recovered record')
  const after=JSON.parse(await readFile(ledgerPath,'utf8')).entries
  assert.deepEqual(after.slice(0,before.length),before)
  assert.equal(after.length,old.requests+resumed.requests);assert.ok(after.length<=12)
  const summary={createdAt:new Date().toISOString(),backend:'linux',passed:true,paidRequests:0,comparisonEligible:false,
    controllerSigkillAfterDispatch:true,independentGuestCleanup:true,daemonAbsenceReadback:true,
    interruptedRecordPreserved:true,explicitResume:true,requestsAcrossResume:after.length,uncertainReservationsUnchanged:true}
  await writeFile(join(root,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
  console.log(JSON.stringify(summary))
}finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')}
