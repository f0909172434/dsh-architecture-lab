import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashBytes, validateProtocolIdentity } from '../src/protocol.mjs'
import { validateReview, loadReview, protocolReviewStatus, reviewChecks } from '../src/protocol-review.mjs'

const seal=object=>({...object,id:hashBytes(JSON.stringify(object))})
const protocol=()=>({...seal({schemaVersion:2,reviewStatus:'pending',capTwd:300,maxRequestsPerTrial:12,maxDurationMs:600000,model:'deepseek-official/deepseek-flash',reasoningEffort:'high'}),preparedAt:'2026-09-24T00:00:00Z'})
const evidence='Synthetic review evidence; not a real study approval.'
const digest=hashBytes(evidence)
const review=p=>seal({schemaVersion:1,kind:'protocol-review-attestation',purpose:'research',decision:'accept',protocolId:p.id,reviewedAt:'2026-09-24T00:01:00Z',
  reviewer:{name:'Test reviewer',kind:'single-agent'},limitations:'Synthetic test only; no claim of independent review.',
  evidence:[{path:`review-evidence/${digest}`,sha256:digest,description:'Synthetic method evidence for this test only.'}],
  checks:Object.fromEntries(reviewChecks.map(name=>[name,{verdict:'pass',reason:'Reviewed synthetic evidence for this test only.',evidence:[digest]}]))})

test('protocol remains immutable and a separate review cannot change its limits or identity',()=>{
  const p=protocol();assert.equal(validateProtocolIdentity(p),p)
  assert.equal(validateReview(review(p),p).protocolId,p.id)
  assert.throws(()=>validateProtocolIdentity({...p,reviewStatus:'accepted'}),/identity/)
  assert.throws(()=>validateProtocolIdentity({...p,capTwd:301}),/identity/)
  assert.throws(()=>validateReview(review(p),{...p,id:'b'.repeat(64)}),/identity/)
})

test('review requires all checks, reviewed evidence, chronology and stated limitations',()=>{
  const p=protocol(),{id,...base}=review(p)
  const changed=[{decision:'reject'},{reviewedAt:'2026-09-23T00:00:00Z'},{limitations:''},
    {checks:{}},{evidence:[{...base.evidence[0],path:'../../private'}]},
    {checks:{...base.checks,method:{...base.checks.method,evidence:['b'.repeat(64)]}}},
    {checks:{...base.checks,fixtures:{...base.checks.fixtures,verdict:'pending'}}}]
  for(const update of changed)assert.throws(()=>validateReview(seal({...base,...update}),p))
})

test('saved review evidence is verified after preparation; missing or changed bytes invalidate status',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lab-review-')),p=protocol(),r=review(p)
  try{
    assert.equal((await protocolReviewStatus(root)).status,'not-prepared')
    await mkdir(join(root,'v2/review-evidence'),{recursive:true})
    await writeFile(join(root,'v2/protocol.json'),JSON.stringify(p))
    assert.equal((await protocolReviewStatus(root)).status,'pending')
    await writeFile(join(root,'v2/protocol-review.json'),JSON.stringify(r))
    assert.equal((await protocolReviewStatus(root)).status,'invalid')
    await writeFile(join(root,'v2',r.evidence[0].path),evidence)
    assert.equal((await loadReview(root,p)).id,r.id)
    const status=await protocolReviewStatus(root)
    assert.equal(status.status,'accepted');assert.equal(status.liveGateUnchanged,true)
    await writeFile(join(root,'v2',r.evidence[0].path),'changed')
    await assert.rejects(loadReview(root,p),/evidence changed/)
    assert.equal((await protocolReviewStatus(root)).status,'invalid')
  }finally{await rm(root,{recursive:true,force:true})}
})
