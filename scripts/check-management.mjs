import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { project } from '../src/runtime.mjs'
import { readRegistry } from '../src/registry.mjs'
import { chooseRecipe, runManagedTrial, stopManagedRun } from '../src/manager.mjs'
import { exportManagedReport } from '../src/managed-report.mjs'

const root=await mkdtemp(join(project,'state/managed-acceptance-'))
await mkdir(join(root,'snapshots/stale-fee'),{recursive:true})
await cp(join(project,'state/snapshots/stale-fee/user.db'),join(root,'snapshots/stale-fee/user.db'))
console.log(JSON.stringify({root,paidRequests:0}))
for(const recipe of ['A','B','C','D']){
  chooseRecipe(root,recipe)
  const row=await runManagedTrial({root,recipe,mode:'offline'})
  assert.equal(row.status,'completed',JSON.stringify(row));assert.equal(row.test.pass,true)
  assert.equal(row.claimedCompletion,true,JSON.stringify(row.completionEvidence))
  assert.equal(row.paidRequests,0);assert.equal(row.evidenceValid,false)
  console.log(`${recipe}: actual tools/evaluator/judge and broker-based completion claim passed`)
}

// Stop only after an actual fake-provider dispatch is observed, not a guessed
// startup delay. A fresh attempt must retain the interrupted record and usage.
const pending=runManagedTrial({root,recipe:'A',repetition:2,mode:'offline',responseDelayMs:2000})
let active,observed=false
for(let i=0;i<200;i++){
  const state=readRegistry(root);active=state.active
  const row=state.runs.find(row=>row.runId===active?.runId)
  if(row){try{await readFile(join(row.outputDir,'request-progress.json'));observed=true;break}catch(error){if(error.code!=='ENOENT')throw error}}
  await delay(50)
}
assert.ok(observed,'actual offline dispatch must precede cancellation')
await assert.rejects(runManagedTrial({root,recipe:'B',repetition:2,mode:'offline'}),/已有進行/)
await stopManagedRun(root)
const interrupted=await pending
assert.equal(interrupted.status,'interrupted',JSON.stringify(interrupted))
assert.ok(interrupted.requests>=1)
assert.equal(interrupted.costTwd,null,'cancelled unmetered dispatch retains unknown cost')
const originalRecord=await readFile(join(interrupted.outputDir,'record.json'),'utf8')
await assert.rejects(runManagedTrial({root,recipe:'A',repetition:2,mode:'offline'}),/已有紀錄/)
const resumed=await runManagedTrial({root,recipe:'A',repetition:2,mode:'offline',resume:true})
assert.equal(resumed.attempt,2);assert.equal(resumed.test.pass,true)
assert.equal(resumed.trialId,interrupted.trialId)
assert.notEqual(resumed.outputDir,interrupted.outputDir)
assert.equal(await readFile(join(interrupted.outputDir,'record.json'),'utf8'),originalRecord)
const ledger=JSON.parse(await readFile(join(root,'v2/offline-budget/budget.json'),'utf8'))
assert.equal(ledger.entries.filter(row=>row.trialId===resumed.trialId).length,interrupted.requests+resumed.requests)
assert.ok(ledger.entries.filter(row=>row.trialId===resumed.trialId).length<=12)

// A new application process must read the same durable state without starting
// a trial or needing the prior controller. This also exercises the CLI facade.
const child=spawn(process.execPath,[join(project,'src/cli.mjs'),'status'],{env:{PATH:process.env.PATH,DSH_ARCH_LAB_ROOT:root},stdio:['ignore','pipe','pipe']})
let text='',error='';child.stdout.on('data',x=>text+=x);child.stderr.on('data',x=>error+=x)
assert.equal(await new Promise(resolve=>child.once('close',resolve)),0,error)
const reopened=JSON.parse(text)
assert.equal(reopened.active,null);assert.equal(reopened.runs.length,6)
const report=await exportManagedReport(root,join(root,'export.json'))
assert.equal(report.summary.A.resumedAttempts,1)
assert.equal(report.summary.A.interrupted,1)
for(const summary of Object.values(report.summary))assert.equal(summary.successRate,null,'offline checks never imply research success')
assert.ok(!JSON.stringify(report).includes(active.control.token))
await writeFile(join(root,'acceptance.json'),JSON.stringify({offlineOnly:true,paidRequests:0,recipes:['A','B','C','D'],cancelAfterDispatch:true,explicitResume:true,recordsPreserved:true,newProcessReadback:true,budgetAcrossResume:true,completionSource:'broker',comparisonEligible:false},null,2)+'\n')
console.log('Management selection, cancellation, explicit resume, restart readback and export passed.')
