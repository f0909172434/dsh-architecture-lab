import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { readRegistry, updateRegistry, visibleRegistry } from '../src/registry.mjs'
import { contactControl, openControl } from '../src/control.mjs'
import { recoverRegistry, runManagedTrial, stopManagedRun } from '../src/manager.mjs'
import { compareRuns, exportManagedReport } from '../src/managed-report.mjs'
import { hashBytes, verifyFileManifest } from '../src/protocol.mjs'

async function temporary(fn){const root=await mkdtemp(join(tmpdir(),'architecture-manager-'));try{await fn(root)}finally{await rm(root,{recursive:true,force:true})}}
function child(script){
  const process=spawn(globalThis.process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']})
  let stdout='',stderr='';process.stdout.on('data',x=>stdout+=x);process.stderr.on('data',x=>stderr+=x)
  return new Promise((resolve,reject)=>{process.on('error',reject);process.on('close',code=>code===0?resolve({stdout,pid:process.pid}):reject(new Error(stderr)))})
}

test('registry preserves legacy selection without rewriting legacy evidence and rolls back failed updates',()=>temporary(async root=>{
  const old=JSON.stringify({selectedRecipe:'D',trials:[{secret:'synthetic legacy evidence'}]})
  await writeFile(join(root,'lab-state.json'),old)
  assert.equal(readRegistry(root).selectedRecipe,'D')
  updateRegistry(root,state=>state.runs.push({runId:'finished',status:'completed'}))
  assert.throws(()=>updateRegistry(root,state=>{state.runs=[];throw new Error('test abort')}),/test abort/)
  assert.equal(readRegistry(root).runs.length,1)
  assert.equal(await readFile(join(root,'lab-state.json'),'utf8'),old)
  assert.throws(()=>updateRegistry(root,async()=>{}),/synchronous/)
}))

test('concurrent independent registry writers do not lose records',()=>temporary(async root=>{
  const module=new URL('../src/registry.mjs',import.meta.url).href
  await Promise.all(Array.from({length:4},(_,worker)=>child(`import {updateRegistry} from ${JSON.stringify(module)};for(let i=0;i<15;i++)updateRegistry(${JSON.stringify(root)},s=>s.runs.push({runId:${worker}+'-'+i}));`)))
  const state=readRegistry(root)
  assert.equal(state.runs.length,60);assert.equal(new Set(state.runs.map(row=>row.runId)).size,60)
}))

test('control capability is authenticated and cannot stop another run identity',()=>temporary(async root=>{
  let stopped=0
  const control=await openControl('specific-run',()=>stopped++)
  const active={runId:'specific-run',pid:process.pid,control:control.descriptor}
  try{
    assert.equal((await contactControl(active)).runId,'specific-run')
    await assert.rejects(contactControl({...active,control:{...control.descriptor,token:'f'.repeat(64)}},'stop'),/identity rejected/)
    assert.equal(stopped,0)
    await assert.rejects(contactControl({...active,runId:'wrong'},'stop'),/identity rejected/)
    assert.equal(stopped,0)
    updateRegistry(root,state=>{state.active=active})
    assert.ok(!JSON.stringify(visibleRegistry(readRegistry(root))).includes(control.descriptor.token))
    assert.equal((await stopManagedRun(root)).stopping,true);assert.equal(stopped,1)
  }finally{await control.close()}
}))

test('restart recovers a confirmed dead owner, preserves completed rows, and requires explicit resume',()=>temporary(async root=>{
  const module=new URL('../src/registry.mjs',import.meta.url).href
  const controlModule=new URL('../src/control.mjs',import.meta.url).href
  await child(`import {updateRegistry} from ${JSON.stringify(module)};import {openControl} from ${JSON.stringify(controlModule)};const c=await openControl('lost',()=>{});updateRegistry(${JSON.stringify(root)},s=>{s.runs=[{runId:'done',status:'completed'},{runId:'lost',trialId:'offline-stale-fee-A-1',status:'running'}];s.active={runId:'lost',pid:process.pid,control:c.descriptor}});process.exit(0);`)
  const recovered=await recoverRegistry(root)
  assert.equal(recovered.active,null)
  assert.equal(recovered.runs[0].status,'completed')
  assert.equal(recovered.runs[1].status,'interrupted')
  assert.equal(recovered.runs[1].cleanupVerified,false)
  await assert.rejects(runManagedTrial({root,mode:'offline',resume:true}),/清理尚未確認/)
  await assert.rejects(runManagedTrial({root,mode:'offline',recipe:'B'}),/清理尚未確認/)
  assert.equal(readRegistry(root).runs.length,2)
}))

test('a live owner with unreachable control is not treated as dead or restarted',()=>temporary(async root=>{
  const c=await openControl('alive',()=>{});await c.close()
  updateRegistry(root,s=>{s.active={runId:'alive',pid:process.pid,control:c.descriptor};s.runs=[{runId:'alive',status:'running'}]})
  const status=await recoverRegistry(root)
  assert.ok(status.attention);assert.equal(status.runs[0].status,'running')
  await assert.rejects(runManagedTrial({root,mode:'offline'}),/已有進行/)
}))

test('live management remains held before state, credentials or any provider is touched',()=>temporary(async root=>{
  await assert.rejects(runManagedTrial({root,mode:'live'}),/實機試驗暫停/)
  assert.deepEqual(await readdir(root),[])
}))

test('research resumes retain first-start deadline even without a dispatched request',()=>temporary(async root=>{
  const first=new Date(Date.now()-600001).toISOString()
  updateRegistry(root,state=>state.runs.push({runId:'expired',trialId:'offline-stale-fee-A-1',mode:'offline',status:'interrupted',backend:'linux',cleanupVerified:true,startedAt:first}))
  await assert.rejects(runManagedTrial({root,mode:'offline',resume:true,backend:'linux'}),/deadline reached/)
  assert.equal(readRegistry(root).runs.length,1)
  assert.equal(readRegistry(root).active,null)
}))

test('death before durable guest launch mapping does not strand a current Linux controller',()=>temporary(async root=>{
  const registry=new URL('../src/registry.mjs',import.meta.url).href,control=new URL('../src/control.mjs',import.meta.url).href
  await child(`import {updateRegistry} from ${JSON.stringify(registry)};import {openControl} from ${JSON.stringify(control)};const c=await openControl('prelaunch',()=>{});updateRegistry(${JSON.stringify(root)},s=>{s.runs=[{schemaVersion:2,runId:'prelaunch',backend:'linux',mode:'offline',trialId:'offline-stale-fee-A-1',status:'running',startedAt:new Date().toISOString()}];s.active={runId:'prelaunch',pid:process.pid,control:c.descriptor}});process.exit(0);`)
  const recovered=await recoverRegistry(root)
  assert.equal(recovered.active,null);assert.equal(recovered.runs[0].status,'interrupted')
  assert.equal(recovered.runs[0].cleanupVerified,true);assert.equal(recovered.runs[0].requests,0)
}))

test('report counts interrupted first attempts and never substitutes a successful resume or offline check',()=>{
  const base={recipe:'A',mode:'live',attempt:1,evidenceValid:true,launched:true,costTwd:.1,requests:1}
  const summary=compareRuns([
    {...base,status:'completed',test:{pass:true},claimedCompletion:true},
    {...base,status:'interrupted',test:{pass:false},claimedCompletion:null},
    {...base,status:'failed',terminalReason:'request_limit',test:{pass:false},claimedCompletion:true},
    {...base,attempt:2,status:'completed',test:{pass:true}},
    {...base,mode:'offline',status:'completed',test:{pass:true}},
  ]).A
  assert.equal(summary.eligibleFirstAttempts,3);assert.equal(summary.successRate,1/3)
  assert.equal(summary.falseCompletions,1);assert.equal(summary.resumedAttempts,1);assert.equal(summary.offlineChecks,1)
})

test('managed export redacts control tokens, retains ineligible legacy findings and unknown costs',()=>temporary(async root=>{
  updateRegistry(root,s=>{s.active={runId:'one',control:{token:'synthetic-private-capability'}};s.runs=[{recipe:'B',mode:'live',attempt:1,status:'interrupted',requests:1,costTwd:null}]})
  const legacy='{"selectedRecipe":"B","trials":[{"recipe":"B","status":"unavailable","test":{"pass":true}}]}'
  await writeFile(join(root,'lab-state.json'),legacy)
  await mkdir(join(root,'analysis'));await writeFile(join(root,'analysis/pilot-audit.json'),'{"comparisonEligible":false,"reason":"synthetic contamination"}')
  const output=join(root,'report.json'),report=await exportManagedReport(root,output)
  assert.equal(report.comparisonReady,false);assert.equal(report.legacy.comparisonEligible,false)
  assert.equal(report.legacy.evidenceAudit.reason,'synthetic contamination');assert.equal(report.summary.B.costTwd,null)
  assert.ok(!(await readFile(output,'utf8')).includes('synthetic-private-capability'))
  assert.equal(await readFile(join(root,'lab-state.json'),'utf8'),legacy)
}))

test('editing a registry eligibility flag cannot promote an unsealed live record',()=>temporary(async root=>{
  updateRegistry(root,state=>state.runs.push({runId:'12345678-1234-1234-1234-123456789abc',recipe:'A',taskId:'stale-fee',repetition:1,attempt:1,
    protocolId:'a'.repeat(64),containerImage:'sha256:'+'b'.repeat(64),mode:'live',status:'completed',launched:true,evidenceValid:true,test:{pass:true}}))
  const report=await exportManagedReport(root,join(root,'report.json'))
  assert.equal(report.runs[0].evidenceValid,false)
  assert.equal(report.runs[0].evidenceAudit.integrityVerified,false)
  assert.equal(report.research.protocols.length,0)
  assert.equal(report.comparisonReady,false)
}))

test('frozen protocol inputs reject changes and path traversal',()=>temporary(async root=>{
  await writeFile(join(root,'fixture'),'fixed')
  const files=[{scope:'project',path:'fixture',sha256:hashBytes('fixed')}]
  await verifyFileManifest(files,{project:root})
  await writeFile(join(root,'fixture'),'changed')
  await assert.rejects(verifyFileManifest(files,{project:root}),/input changed/)
  await assert.rejects(verifyFileManifest([{...files[0],path:'../private'}],{project:root}),/invalid protocol/)
}))
