import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createLabWebHandler, budgetView } from '../src/web.mjs'
import { readRegistry, updateRegistry } from '../src/registry.mjs'

async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'lab-web-test-')),token='test-page-capability',launches=[]
  let handler
  const server=createServer((req,res)=>handler(req,res))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  handler=createLabWebHandler({root,port:server.address().port,token,launch:async args=>{launches.push(args);return {submitted:true}}})
  const call=(path,options={})=>fetch(origin+path,{...options,headers:{'x-architecture-lab-token':token,...options.headers}})
  const action=(input,headers={})=>call('/api/architecture-lab/action',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(input)})
  try{await fn({root,origin,call,action,launches,token})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})}
}

test('web controls reject wrong host, foreign origin, and missing capability before mutations',()=>fixture(async({root,origin,call,action,launches})=>{
  assert.equal((await fetch(origin+'/api/architecture-lab/state')).status,403)
  const invalidHost=await new Promise((resolve,reject)=>{const req=request(origin+'/api/architecture-lab/state',{headers:{host:'evil.example','x-architecture-lab-token':'test-page-capability'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()})
  assert.equal(invalidHost,403)
  assert.equal((await call('/api/architecture-lab/state',{headers:{'sec-fetch-site':'cross-site'}})).status,403)
  for(const headers of [{origin:'https://evil.example'},{origin:'http://localhost:1'},{origin:''},{'x-architecture-lab-token':'wrong'},{'content-type':'text/plain'}])assert.ok((await action({action:'select',recipe:'D'},headers)).status>=400)
  assert.equal(readRegistry(root).selectedRecipe,'A');assert.deepEqual(launches,[])
  assert.equal((await action({action:'start',recipe:'A',taskId:'stale-fee',repetition:1})).status,400)
  assert.equal(readRegistry(root).runs.length,0);assert.deepEqual(launches,[])
}))

test('web page, selection, labelled report and validated offline launch share the durable controller',()=>fixture(async({root,call,action,launches,token})=>{
  const page=await call('/architecture-lab');assert.equal(page.status,200)
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'self'/)
  assert.ok((await page.text()).includes(token))
  for(const path of ['app.mjs','research.mjs','style.css'])assert.equal((await call('/architecture-lab/'+path)).status,200)
  assert.equal((await action({action:'select',recipe:'B'})).status,200)
  assert.equal(readRegistry(root).selectedRecipe,'B')
  assert.equal((await action({action:'check',recipe:'B',repetition:2})).status,200)
  assert.deepEqual(launches,[['check-one','B','2']])
  assert.equal((await action({action:'check',recipe:'B',repetition:'2;bad'})).status,400)
  const state=await (await call('/api/architecture-lab/state')).json()
  assert.equal(state.selectedRecipe,'B');assert.equal(state.liveReady,false);assert.equal(state.summary.B.successRate,null)
  assert.equal(state.budget.invoiceTotalTwd,null)
  updateRegistry(root,s=>{s.active={runId:'one',control:{token:'private-stop-token'}}})
  const report=await (await call('/api/architecture-lab/report')).text()
  assert.ok(!report.includes('private-stop-token'))
}))

test('web evidence permits fixed attempt artifacts and denies traversal or links outside the attempt',()=>fixture(async({root,call})=>{
  const id='12345678-1234-1234-1234-123456789abc',dir=join(root,'v2/runs',id)
  await mkdir(dir,{recursive:true});await writeFile(join(dir,'record.json'),'{"synthetic":true}')
  const response=await call(`/api/architecture-lab/evidence?runId=${id}&kind=record`)
  assert.deepEqual(await response.json(),{synthetic:true})
  assert.equal((await call('/api/architecture-lab/evidence?runId=..%2F..&kind=record')).status,400)
  assert.equal((await call(`/api/architecture-lab/evidence?runId=${id}&kind=../../private`)).status,400)
  await writeFile(join(root,'private.json'),'{"secret":"synthetic"}')
  await symlink(join(root,'private.json'),join(dir,'outcome.json'))
  assert.equal((await call(`/api/architecture-lab/evidence?runId=${id}&kind=outcome`)).status,400)
}))

test('budget view retains legacy reservations and distinguishes unknown from zero',()=>fixture(async({root})=>{
  await writeFile(join(root,'budget.json'),JSON.stringify({capTwd:300,entries:[{reservedTwd:300,status:'unmetered'}]}))
  const view=await budgetView(root);assert.equal(view.committedTwd,300);assert.equal(view.availableTwd,0);assert.equal(view.unknownRequests,1);assert.equal(view.invoiceTotalTwd,null)
  await writeFile(join(root,'budget.json'),'invalid')
  assert.equal((await budgetView(root)).availableTwd,null)
}))

test('a killed controller record remains viewable without a final artifact',()=>fixture(async({root,call})=>{
  const runId='12345678-1234-1234-1234-123456789abc'
  updateRegistry(root,state=>state.runs.push({runId,status:'interrupted',terminalReason:'controller_lost',requests:1,costTwd:null,cleanupVerified:false}))
  const response=await call(`/api/architecture-lab/evidence?runId=${runId}&kind=record`)
  assert.equal(response.status,200)
  const row=await response.json()
  assert.equal(row.recordSource,'durable-registry-recovery');assert.equal(row.costTwd,null);assert.equal(row.requests,1)
}))

test('client registers a matching sidebar identity and main panel using host services',async()=>{
  let module
  runInNewContext(await readFile(new URL('../client/index.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:entry=>{module=entry}}}})
  assert.equal(module.id,'dsh-architecture-lab')
  const plugin=module.factory(name=>{assert.equal(name,'react');return {createElement:(tag,props)=>({tag,props})}})
  const registrations=[]
  plugin.apply({slots:{inject:(_name,callback)=>callback(),register:(definition,component)=>{registrations.push({definition,component})}}})
  const main=registrations.find(r=>r.definition.name==='main'),sidebar=registrations.find(r=>r.definition.name==='sidebar.panellist')
  assert.equal(main.definition.key,sidebar.definition.id)
  assert.equal(main.component().props.src,'/architecture-lab')
})
