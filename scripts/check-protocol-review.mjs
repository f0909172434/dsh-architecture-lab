// Exercise review persistence against the installed runtime without approving
// the scientific method or creating a live-eligible experiment.
import assert from 'node:assert/strict'
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'
import { prepareProtocol, hashBytes } from '../src/protocol.mjs'
import { acceptProtocolReview, loadReview, loadReviewedProtocol, protocolReviewStatus, reviewChecks } from '../src/protocol-review.mjs'

const root=await mkdtemp(join(project,'state/review-workflow-'))
await cp(join(project,'state/snapshots'),join(root,'snapshots'),{recursive:true})
await cp(join(project,'state/pricing.json'),join(root,'pricing.json'))
const protocol=await prepareProtocol(root),original=await readFile(join(root,'v2/protocol.json'))
const bytes=Buffer.from('Synthetic review persistence probe. This file provides no scientific acceptance.\n'),sha256=hashBytes(bytes)
await writeFile(join(root,'probe.txt'),bytes)
const input={protocolId:protocol.id,decision:'accept',purpose:'workflow-validation',reviewer:{name:'Local offline integration probe',kind:'single-agent'},
  limitations:'This validates the review storage workflow only. It does not approve the method or authorize a model call.',
  evidence:[{path:'probe.txt',sha256,description:'Synthetic evidence for review workflow validation only.'}],
  checks:Object.fromEntries(reviewChecks.map(name=>[name,{verdict:'pass',reason:'Schema and persistence exercise only; no scientific review asserted.',evidence:[sha256]}]))}
const path=join(root,'input.json')
await writeFile(path,JSON.stringify({...input,protocolId:'0'.repeat(64)}))
await assert.rejects(acceptProtocolReview(root,path),/explicit acceptance/)
await writeFile(path,JSON.stringify(input))
const accepted=await acceptProtocolReview(root,path)
assert.equal((await protocolReviewStatus(root)).status,'workflow-validation')
assert.equal((await loadReview(root,protocol)).id,accepted.reviewId)
await assert.rejects(loadReviewedProtocol(root),/not research acceptance/)
await assert.rejects(acceptProtocolReview(root,path),error=>error.code==='EEXIST')
assert.deepEqual(await readFile(join(root,'v2/protocol.json')),original)
await writeFile(join(root,'probe.txt'),'changed source after immutable copy')
assert.equal((await loadReview(root,protocol)).id,accepted.reviewId)
await writeFile(join(root,'v2/review-evidence',sha256),'changed stored evidence')
await assert.rejects(loadReview(root,protocol),/evidence changed/)
assert.equal((await protocolReviewStatus(root)).status,'invalid')
const result={createdAt:new Date().toISOString(),paidRequests:0,passed:true,purpose:'workflow-validation',protocolId:protocol.id,
  wrongProtocolRejected:true,protocolBytesUnchanged:true,reviewOverwriteRejected:true,sourceCopyIndependent:true,
  evidenceTamperRejected:true,workflowReviewCannotEnableResearch:true,trials:protocol.trials.length}
await writeFile(join(root,'acceptance.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({root,...result}))
