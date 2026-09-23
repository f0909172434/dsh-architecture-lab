// Scripted responses, actual jailed DSH tools. Never a model-quality result.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { project } from '../src/runtime.mjs'
import { createDailyCheck, runDailyTask, recoverDaily, stopDaily } from '../src/daily-manager.mjs'
import { dailyRegistry, dailyRoot, dailyHead, previewDailyResult, adoptDailyResult, exportDailyResult, dailyWorldPath } from '../src/daily-workspace.mjs'
import { readRegistry } from '../src/registry.mjs'

const root=await mkdtemp(join(project,'state/daily-acceptance-'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const snapshot=join(project,'state/snapshots/stale-fee/user.db'),fixture=join(project,'tasks/stale-fee/fixture/index.mjs')
const initialSnapshot=hash(await readFile(snapshot)),initialFixture=hash(await readFile(fixture))
const records=[]
console.log(JSON.stringify({root,paidRequests:0}))
async function completed(job,options={}){
  const row=await runDailyTask({root,jobId:job.id,mode:'offline',...options})
  assert.equal(row.status,'completed',JSON.stringify(row));assert.equal(row.cleanupVerified,true)
  assert.equal(row.claimedCompletion,true);assert.equal(row.paidRequests,0);assert.equal(row.validatedCorrectness,false)
  assert.ok(row.requests<=12);assert.equal(row.comparisonEligible,false)
  assert.match(await readFile(join(dailyWorldPath(root,row),'workspace/index.mjs'),'utf8'),/0\.08/)
  const requests=JSON.parse(await readFile(join(row.outputDir,'offline-requests.json'),'utf8'))
  assert.ok(requests.some(req=>req.messages.some(m=>m.role==='system'&&m.content?.includes('no benchmark judge'))),'Cordis must forward daily purpose')
  assert.ok(!requests.some(req=>req.messages.some(m=>m.role==='system'&&m.content?.includes('external test independently'))))
  records.push({recipe:row.recipe,jobId:job.id,runId:row.runId,requests:row.requests,completed:true,dailyInstruction:true})
  console.log(JSON.stringify(records.at(-1)))
  return row
}
for(const recipe of ['A','B','C','D']){
  const job=await createDailyCheck(root,recipe),row=await completed(job)
  const preview=await previewDailyResult(root,row.runId)
  assert.ok(preview.changes.some(file=>file.path==='index.mjs'&&file.kind==='modified'))
  await adoptDailyResult(root,row.runId)
  assert.equal((await dailyHead(root,job.projectId)).headRunId,row.runId)
  const destination=join(root,`export-${recipe}`);await exportDailyResult(root,row.runId,destination)
  assert.match(await readFile(join(destination,'index.mjs'),'utf8'),/0\.08/)
  await assert.rejects(exportDailyResult(root,row.runId,destination),error=>error.code==='EEXIST')
}

const marker=`daily-isolation-${randomUUID()}`
function contains(path){const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare('SELECT content FROM nodes').all().some(row=>row.content.includes(marker))}finally{db.close()}}
async function memoryCheck(job,action,expected){
  const row=await completed(job,{memoryProbe:{marker,action}})
  const requests=JSON.parse(await readFile(join(row.outputDir,'offline-requests.json'),'utf8'))
  const packets=requests.flatMap(req=>req.messages.filter(m=>m.role==='tool').flatMap(m=>[...m.content.matchAll(/<engram_memory_context[^>]*>([\s\S]*?)<\/engram_memory_context>/g)].map(match=>match[1])))
  assert.ok(packets.length>0);assert.equal(packets.some(text=>text.includes(marker)),expected)
  assert.equal(contains(join(dailyWorldPath(root,row),'memory/user.db')),expected)
  assert.ok(requests.some(req=>!req.tools?.length),'rewrite calls must be metered')
  assert.equal(requests.length,row.requests)
  return row
}
const writer=await createDailyCheck(root,'B'),written=await memoryCheck(writer,'save-search',true)
await adoptDailyResult(root,written.runId)
const plain=await createDailyCheck(root,'A',{projectId:writer.projectId}),plainResult=await completed(plain)
assert.equal((await previewDailyResult(root,plainResult.runId)).changes.length,0,'next task must inherit adopted workspace')
await adoptDailyResult(root,plainResult.runId)
assert.ok((await dailyHead(root,writer.projectId)).memorySnapshot.includes(written.runId))
await memoryCheck(await createDailyCheck(root,'D',{projectId:writer.projectId}),'search',true)
await memoryCheck(await createDailyCheck(root,'B'),'search',false)

async function waitForStep(jobId,step,child){
  for(let i=0;i<600;i++){
    const row=dailyRegistry(root).runs.find(row=>row.jobId===jobId)
    if(row){try{if(JSON.parse(await readFile(join(row.outputDir,'request-progress.json'),'utf8')).step>=step)return row}catch(error){if(error.code!=='ENOENT')throw error}}
    if(child&&child.exitCode!==null)throw new Error('controller exited before target step')
    await delay(50)
  }
  throw new Error('timed out waiting for actual daily tool execution')
}
const cancelledJob=await createDailyCheck(root,'A')
const pending=runDailyTask({root,jobId:cancelledJob.id,mode:'offline',responseDelayMs:2000})
// Attach a handler immediately so a setup failure is not an unhandled rejection.
pending.catch(()=>{})
await waitForStep(cancelledJob.id,3)
await stopDaily(root)
const cancelled=await pending
assert.equal(cancelled.status,'interrupted');assert.equal(cancelled.cleanupVerified,true)
assert.ok((await previewDailyResult(root,cancelled.runId)).changes.length>0)
const resumed=await completed(cancelledJob,{resume:true})
assert.ok((await previewDailyResult(root,resumed.runId)).changes.length>0,'resumed review includes changes from earlier attempts')
assert.equal(resumed.firstStartedAt,cancelled.firstStartedAt);assert.equal(resumed.trialId,cancelled.trialId)
assert.ok(cancelled.requests+resumed.requests<=12)

const killedJob=await createDailyCheck(root,'A')
const script=`import {runDailyTask} from ${JSON.stringify(new URL('../src/daily-manager.mjs',import.meta.url).href)};await runDailyTask({root:${JSON.stringify(root)},jobId:${JSON.stringify(killedJob.id)},mode:'offline',responseDelayMs:2000});`
const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['ignore','ignore','pipe']})
const exited=once(child,'exit');child.stderr.resume()
let recovered
try{
  const running=await waitForStep(killedJob.id,3,child)
  const ledgerPath=join(dailyRoot(root),'v2/offline-budget/budget.json')
  const before=JSON.parse(await readFile(ledgerPath,'utf8')).entries
  child.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL')
  for(let i=0;i<100;i++){
    const state=await recoverDaily(root)
    recovered=state.runs.find(row=>row.runId===running.runId)
    if(recovered.cleanupVerified&&recovered.outputManifest)break
    await delay(100)
  }
  assert.equal(recovered.status,'interrupted');assert.equal(recovered.cleanupVerified,true)
  assert.equal(recovered.worldDirectory,'recovered-world');assert.equal(recovered.artifactError,null)
  assert.ok((await previewDailyResult(root,recovered.runId)).changes.length>0,'partial tool writes survive controller loss')
  assert.deepEqual(JSON.parse(await readFile(ledgerPath,'utf8')).entries,before)
  const retry=await completed(killedJob,{resume:true})
  assert.ok((await previewDailyResult(root,retry.runId)).changes.length>0)
  assert.equal(retry.firstStartedAt,recovered.firstStartedAt);assert.equal(retry.trialId,recovered.trialId)
  assert.ok(retry.requests+recovered.requests<=12)
}finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')}
assert.equal(hash(await readFile(snapshot)),initialSnapshot)
assert.equal(hash(await readFile(fixture)),initialFixture)
assert.equal(readRegistry(root).runs.length,0,'daily records never enter research registry')
const summary={createdAt:new Date().toISOString(),passed:true,paidRequests:0,comparisonEligible:false,records,
  nativeTools:true,purposeForwarded:true,explicitAdoption:true,exclusiveExport:true,originalSourceUnchanged:true,
  projectMemoryPersistence:true,crossProjectMemoryIsolation:true,researchSnapshotUnchanged:true,
  cancellationAndResume:true,controllerSigkillRecovery:true,partialFilesRecovered:true,cumulativeRequestLimit:true,
  cumulativeDeadlineIdentity:true,graphicalAcceptance:false,limitation:'Scripted offline integration only; GUI and paid daily use remain held.'}
await writeFile(join(root,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary))
