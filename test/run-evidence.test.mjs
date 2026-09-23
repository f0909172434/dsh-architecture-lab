import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assessRunEvidence, writeLaunchEvidence, sealRunEvidence, auditRunEvidence } from '../src/run-evidence.mjs'

const runId='12345678-1234-1234-1234-123456789abc'
function proof(){
  const protocol={id:'a'.repeat(64),execution:{imageId:'sha256:'+'b'.repeat(64)},trials:[{taskId:'stale-fee',recipe:'A',repetition:1}]}
  const review={id:'c'.repeat(64),purpose:'research',reviewedAt:'2026-09-24T00:00:00Z'}
  const record={runId,mode:'live',backend:'linux',launched:true,attempt:1,recipe:'A',taskId:'stale-fee',repetition:1,protocolId:protocol.id,trialId:`${protocol.id}-stale-fee-A-1`,containerRunId:runId,containerImage:protocol.execution.imageId,status:'failed',test:{pass:false},claimedCompletion:true,costTwd:null}
  const launch={...record,source:'trusted-controller-preflight',checkedAt:'2026-09-24T00:01:00Z',reviewId:review.id,currentInputsVerified:true}
  const receipt={runId,image:record.containerImage,stateBeforeCleanup:{StartedAt:'2026-09-24T00:01:01Z'}}
  return {record,launch,receipt,protocol,review}
}

test('reviewed launched failures and interruptions remain eligible regardless of success or unknown cost',()=>{
  const p=proof();assert.equal(assessRunEvidence(p).eligible,true)
  for(const status of ['failed','completed','interrupted'])assert.equal(assessRunEvidence({...p,record:{...p.record,status,test:{pass:null,status:'unavailable'},costTwd:null,cleanupVerified:false}}).eligible,true)
})

test('retroactive reviews, wrong images, missing launch evidence and unstarted containers cannot qualify',()=>{
  const p=proof()
  for(const changed of [
    {review:{...p.review,reviewedAt:'2026-09-24T01:00:00Z'}},
    {review:{...p.review,purpose:'workflow-validation'}},
    {launch:{...p.launch,reviewId:'d'.repeat(64)}},
    {launch:null},
    {receipt:{...p.receipt,stateBeforeCleanup:{StartedAt:'0001-01-01T00:00:00Z'}}},
    {receipt:{...p.receipt,image:'sha256:'+'d'.repeat(64)}},
    {record:{...p.record,mode:'offline'}},
    {protocol:{...p.protocol,trials:[]}},
  ])assert.equal(assessRunEvidence({...p,...changed}).eligible,false)
})

test('controller seal detects changed records and artifacts; offline proof never promotes research eligibility',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lab-seal-')),outputDir=join(root,'v2/runs',runId)
  try{
    await mkdir(outputDir,{recursive:true});await mkdir(join(root,'v2/offline-budget'),{recursive:true})
    const record={runId,outputDir,trialId:'offline-stale-fee-A-1',attempt:1,mode:'offline',backend:'native',recipe:'A',taskId:'stale-fee',repetition:1,protocolId:null,status:'completed',launched:true,
      requestIds:[],requests:0,costTwd:0,reservedTwd:0,claimedCompletion:null,test:{pass:true},evidenceValid:false}
    await writeLaunchEvidence(record,null)
    await writeFile(join(outputDir,'record.json'),JSON.stringify(record))
    await writeFile(join(outputDir,'outcome.json'),JSON.stringify({correctness:record.test}))
    await sealRunEvidence(root,record)
    const original=await readFile(join(outputDir,'evidence-seal.json'))
    const audit=await auditRunEvidence(root,record)
    assert.equal(audit.integrityVerified,true);assert.equal(audit.eligible,false);assert.ok(audit.reasons.includes('offline'))
    assert.equal((await auditRunEvidence(root,{...record,evidenceValid:true})).integrityVerified,false)
    await writeFile(join(outputDir,'outcome.json'),JSON.stringify({correctness:{pass:false}}))
    assert.deepEqual((await auditRunEvidence(root,record)).reasons,['artifact-changed'])
    assert.deepEqual(await readFile(join(outputDir,'evidence-seal.json')),original)
    await assert.rejects(sealRunEvidence(root,record),error=>error.code==='EEXIST')
  }finally{await rm(root,{recursive:true,force:true})}
})
