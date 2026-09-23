import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {proposeHistoricalReconciliation,applyHistoricalReconciliation} from '../src/broker/reconciliation.mjs'
import {committedTwd} from '../src/broker/accounting.mjs'
import {ledgerRootFor,authoritativeBudgetRoot} from '../src/broker/location.mjs'

const ledger=()=>({capTwd:300,entries:[{id:'old',trialId:'old',reservedTwd:300,status:'unmetered',at:'2026-09-23T10:00:00Z'}]})
const observation={source:'https://platform.deepseek.com/usage',evidenceKind:'authenticated-provider-usage-screen',maskedKeyMatch:true,
  periodStart:'2026-09-23T00:00:00+08:00',periodEnd:'2026-09-24T00:00:00+08:00',observedAt:'2026-09-23T18:00:00Z',
  requests:2,totalTokens:110,displayedCosts:{CNY:.20,USD:0},displayRoundingCny:.01,cnyToTwd:4.7,
  fxSource:'https://open.er-api.com/v6/latest/CNY',fxCheckedAt:'2026-09-23T00:00:00Z'}
const options=()=>({observation:{...observation},coveredEntryIds:['old'],traceRequests:2,traceTokens:100,
  reviewedAt:'2026-09-23T18:01:00Z',evidence:[{path:'synthetic',sha256:'a'.repeat(64)}]})

test('separate experiment directories share the original live allowance',()=>{
  assert.equal(ledgerRootFor('/new/experiment-a','live'),authoritativeBudgetRoot)
  assert.equal(ledgerRootFor('/new/experiment-b','live'),authoritativeBudgetRoot)
  assert.notEqual(ledgerRootFor('/new/experiment-a','offline'),ledgerRootFor('/new/experiment-b','offline'))
  assert.throws(()=>ledgerRootFor('/new','unknown'))
})

test('aggregate provider bound retains original unknown entries and adds new dispatch cost',()=>{
  const l=ledger(),original=structuredClone(l.entries),p=proposeHistoricalReconciliation(l,options())
  assert.equal(p.chargedUpperBoundTwd,2);assert.equal(p.unallocatedTokens,10);assert.equal(p.perRequestCostsVerified,false)
  l.reconciliations=[p];assert.equal(committedTwd(l),2);assert.deepEqual(l.entries,original)
  l.entries.push({id:'new',accountingVersion:2,status:'reserved',reservedTwd:1})
  assert.equal(committedTwd(l),3)
  l.entries[1].status='metered';l.entries[1].actualTwd=.1;assert.equal(committedTwd(l),2.1)
})

test('unmatched keys, request count, token coverage, time windows and currency fail closed',()=>{
  const changes=[{maskedKeyMatch:false},{requests:3},{totalTokens:99},{observedAt:'2026-09-23T16:01:00Z'},
    {periodStart:'2026-09-24T00:00:00Z'},{displayedCosts:{CNY:.2,USD:1}},{cnyToTwd:NaN},{fxCheckedAt:'2020-01-01'}]
  for(const change of changes)assert.throws(()=>proposeHistoricalReconciliation(ledger(),{...options(),observation:{...observation,...change}}))
  assert.throws(()=>proposeHistoricalReconciliation(ledger(),{...options(),coveredEntryIds:['missing']}))
  const l=ledger();l.entries[0].accountingVersion=2
  assert.throws(()=>proposeHistoricalReconciliation(l,options()),/outside provider window/)
})

test('covered entries cannot change, be double-covered, or use a reduced bound',()=>{
  const l=ledger(),p=proposeHistoricalReconciliation(l,options());l.reconciliations=[p]
  l.entries[0].status='metered';assert.throws(()=>committedTwd(l),/evidence changed/)
  l.entries[0].status='unmetered';l.reconciliations.push(p);assert.throws(()=>committedTwd(l),/coverage/)
  l.reconciliations=[{...p,chargedUpperBoundTwd:.01}];assert.throws(()=>committedTwd(l),/bound/)
})

test('apply verifies evidence bytes and preserves the exact previous ledger',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lab-reconciliation-'))
  try{
    const evidencePath=join(root,'provider.json'),bytes=JSON.stringify(observation)
    await writeFile(evidencePath,bytes)
    const evidence=[{path:evidencePath,sha256:createHash('sha256').update(bytes).digest('hex')}]
    const l=ledger(),original=JSON.stringify(l,null,4)+'\n';await writeFile(join(root,'budget.json'),original)
    const p=proposeHistoricalReconciliation(l,{...options(),evidence})
    await writeFile(join(root,'budget.lock'),'')
    await assert.rejects(applyHistoricalReconciliation(root,p),/locked/)
    await assert.rejects(readFile(join(root,'budget.before-provider-reconciliation.json')),error=>error.code==='ENOENT')
    await rm(join(root,'budget.lock'))
    await writeFile(evidencePath,'changed');await assert.rejects(applyHistoricalReconciliation(root,p),/evidence changed/)
    assert.equal(await readFile(join(root,'budget.json'),'utf8'),original)
    await writeFile(evidencePath,bytes)
    const result=await applyHistoricalReconciliation(root,p)
    assert.equal(result.after,2);assert.equal(result.availableTwd,298)
    assert.equal(await readFile(join(root,'budget.before-provider-reconciliation.json'),'utf8'),original)
    const after=JSON.parse(await readFile(join(root,'budget.json'),'utf8'))
    assert.deepEqual(after.entries,l.entries);assert.equal(after.capTwd,300)
    await assert.rejects(applyHistoricalReconciliation(root,p),/already exists/)
    assert.equal(await readFile(join(root,'budget.before-provider-reconciliation.json'),'utf8'),original)
  }finally{await rm(root,{recursive:true,force:true})}
})
