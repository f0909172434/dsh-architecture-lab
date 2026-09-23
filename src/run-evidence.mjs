import { readFile, writeFile, open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { hashBytes, loadStoredProtocol } from './protocol.mjs'
import { loadReview } from './protocol-review.mjs'
import { ledgerRootFor } from './broker/location.mjs'
import { brokerCompletion } from './completion.mjs'
import { containerReceipt } from './linux-process.mjs'

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const fields=['runId','trialId','attempt','mode','recipe','taskId','repetition','protocolId','containerRunId','containerImage']
const fixedFiles=['launch.json','record.json','outcome.json','process.json','evaluation/report.json','container-receipt.json']
const identity=row=>Object.fromEntries(fields.map(key=>[key,row[key]??null]))

async function fileBytes(base,path){
  const file=join(base,path)
  const canonicalBase=await realpath(base)
  try{
    if(!(await realpath(file)).startsWith(canonicalBase+sep))throw new Error('evidence outside trusted directory')
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try{const meta=await handle.stat();if(!meta.isFile()||meta.size>16*1024*1024)throw new Error('invalid evidence file');return await handle.readFile()}
    finally{await handle.close()}
  }catch(error){if(error.code==='ENOENT')return null;throw error}
}

export async function writeLaunchEvidence(record,reviewed){
  if(record.mode==='live'&&(!reviewed||record.protocolId!==reviewed.protocol.id))throw new Error('reviewed protocol required before launch')
  const data={schemaVersion:1,...identity(record),checkedAt:new Date().toISOString(),reviewId:reviewed?.review.id??null,
    source:'trusted-controller-preflight',currentInputsVerified:record.mode==='live'}
  await writeFile(join(record.outputDir,'launch.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600})
}

/** Seal the controller-owned artifacts only after the broker has stopped.
 * The host is trusted; hashes detect change, not a malicious host administrator.
 * Candidate-writable logs can be retained but never establish eligibility.
 */
export async function sealRunEvidence(root,record){
  if(!uuid.test(record.runId))throw new Error('invalid run identity')
  const directory=join(root,'v2/runs',record.runId),budget=ledgerRootFor(root,record.mode)
  if(record.outputDir!==directory)throw new Error('run directory mismatch')
  if(record.backend==='linux'&&record.containerRunId){
    const receipt=await containerReceipt(record.containerRunId)
    await writeFile(join(directory,'container-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600})
  }
  let ledger
  try{ledger=JSON.parse(await readFile(join(budget,'budget.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;ledger={entries:[]}}
  const requestIds=record.requestIds??[]
  if(!Array.isArray(requestIds)||new Set(requestIds).size!==requestIds.length||requestIds.some(id=>!uuid.test(id)))throw new Error('invalid dispatch identities')
  const entries=requestIds.map(id=>{const found=ledger.entries.filter(row=>row.id===id);if(found.length!==1||found[0].trialId!==record.trialId)throw new Error('dispatch evidence mismatch');return found[0]})
  const artifacts=[]
  const add=async(scope,path)=>{const bytes=await fileBytes(scope==='attempt'?directory:budget,path);artifacts.push({scope,path,sha256:bytes===null?null:hashBytes(bytes)})}
  for(const path of fixedFiles)await add('attempt',path)
  for(const id of requestIds)for(const suffix of ['request.json','sse'])await add('budget',`broker-evidence/${id}.${suffix}`)
  const data={schemaVersion:1,kind:'sealed-run-evidence',sealedAt:new Date().toISOString(),...identity(record),recordSha256:hashBytes(JSON.stringify(record)),entries,artifacts}
  await writeFile(join(directory,'evidence-seal.json'),JSON.stringify({...data,id:hashBytes(JSON.stringify(data))},null,2)+'\n',{flag:'wx',mode:0o600})
}

export function assessRunEvidence({record,launch,receipt,protocol,review}){
  const reasons=[]
  if(!['completed','failed','interrupted'].includes(record.status))reasons.push('nonterminal')
  if(record.mode!=='live')reasons.push('offline')
  if(!record.launched||record.backend!=='linux')reasons.push('unlaunched-or-unsupported-backend')
  if(!launch||!isDeepStrictEqual(identity(launch),identity(record))||launch.source!=='trusted-controller-preflight'||launch.currentInputsVerified!==true)reasons.push('missing-preflight')
  const checked=Date.parse(launch?.checkedAt),started=Date.parse(receipt?.stateBeforeCleanup?.StartedAt)
  if(!receipt||receipt.runId!==record.containerRunId||receipt.image!==record.containerImage||!Number.isFinite(started)||started<=0||!Number.isFinite(checked)||started<checked)reasons.push('no-confirmed-container-start')
  if(!protocol||!review||review.purpose!=='research'||protocol.id!==record.protocolId||launch?.reviewId!==review.id||!Number.isFinite(Date.parse(review.reviewedAt))||Date.parse(review.reviewedAt)>checked||protocol.execution.imageId!==record.containerImage)reasons.push('no-prior-matching-review')
  if(protocol&&(!protocol.trials.some(row=>row.recipe===record.recipe&&row.taskId===record.taskId&&row.repetition===record.repetition)||record.trialId!==`${protocol.id}-${record.taskId}-${record.recipe}-${record.repetition}`))reasons.push('outside-frozen-schedule')
  // Pass/fail, completion claims, known cost and cleanup success do not decide
  // inclusion. Launched failures and interruptions remain in the denominator.
  return {eligible:reasons.length===0,reasons}
}

export async function auditRunEvidence(root,record){
  const fail=reason=>({eligible:false,integrityVerified:false,reasons:[reason]})
  if(!uuid.test(record.runId??''))return fail('legacy-or-invalid-run-identity')
  const directory=join(root,'v2/runs',record.runId)
  try{
    const sealBytes=await fileBytes(directory,'evidence-seal.json')
    if(!sealBytes)return fail('unsealed')
    const seal=JSON.parse(sealBytes),{id,...contents}=seal
    if(seal.schemaVersion!==1||seal.kind!=='sealed-run-evidence'||id!==hashBytes(JSON.stringify(contents))||!isDeepStrictEqual(identity(seal),identity(record))||seal.recordSha256!==hashBytes(JSON.stringify(record)))return fail('record-or-seal-changed')
    const requestIds=record.requestIds??[]
    if(new Set(requestIds).size!==requestIds.length||requestIds.some(value=>!uuid.test(value)))return fail('invalid-dispatch-identities')
    const expected=[...fixedFiles.map(path=>`attempt:${path}`),...requestIds.flatMap(id=>['request.json','sse'].map(suffix=>`budget:broker-evidence/${id}.${suffix}`))]
    if(!Array.isArray(seal.artifacts)||!isDeepStrictEqual(seal.artifacts.map(row=>`${row.scope}:${row.path}`),expected))return fail('incomplete-evidence-manifest')
    const budget=ledgerRootFor(root,record.mode),data={}
    for(const item of seal.artifacts){
      const bytes=await fileBytes(item.scope==='attempt'?directory:budget,item.path)
      if((bytes===null?null:hashBytes(bytes))!==item.sha256)return fail('artifact-changed')
      if(item.scope==='attempt'&&bytes)data[item.path]=JSON.parse(bytes)
    }
    if(!isDeepStrictEqual(data['record.json'],record))return fail('record-file-mismatch')
    let ledger
    try{ledger=JSON.parse(await readFile(join(budget,'budget.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;ledger={entries:[]}}
    const entries=requestIds.map(id=>{const matches=ledger.entries.filter(row=>row.id===id);if(matches.length!==1)throw new Error('dispatch absent');return matches[0]})
    if(!isDeepStrictEqual(entries,seal.entries)||entries.some(entry=>entry.trialId!==record.trialId)||record.requests!==entries.length)return fail('accounting-changed')
    const metered=entries.every(entry=>entry.status==='metered'&&Number.isFinite(entry.actualTwd))
    const cost=metered?entries.reduce((sum,row)=>sum+row.actualTwd,0):null
    if(record.costTwd!==cost||record.reservedTwd!==entries.reduce((sum,row)=>sum+row.reservedTwd,0))return fail('accounting-total-mismatch')
    const completion=await brokerCompletion(budget,entries)
    if(record.claimedCompletion!==completion.claimedCompletion)return fail('completion-evidence-mismatch')
    const outcome=data['outcome.json']
    if(outcome&&!isDeepStrictEqual(record.test,outcome.correctness))return fail('judge-result-mismatch')
    if(!outcome&&record.test?.pass!=null)return fail('missing-judge-evidence')
    let protocol,review
    if(record.mode==='live'){protocol=await loadStoredProtocol(root);review=await loadReview(root,protocol)}
    if(protocol&&entries.some(entry=>entry.accountingVersion!==2||!isDeepStrictEqual(entry.pricing,protocol.pricing)))return fail('dispatch-prices-differ-from-protocol')
    return {...assessRunEvidence({record,launch:data['launch.json'],receipt:data['container-receipt.json'],protocol,review}),integrityVerified:true,sealId:id,checkedAt:new Date().toISOString()}
  }catch{return fail('evidence-unavailable-or-invalid')}
}
