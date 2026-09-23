// Real Engram write/retrieval in separate jailed DSH processes. All provider
// responses are synthetic; this demonstrates isolation, not memory quality.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { project } from '../src/runtime.mjs'
import { startOfflineProvider, offlinePricing } from '../src/offline-provider.mjs'
import { startOfflineBroker } from '../src/broker/server.mjs'
import { evaluateIsolatedTrial } from '../src/evaluator.mjs'
import { executionBackend } from '../src/linux-runtime.mjs'

const backend=executionBackend()
const root=await mkdtemp(join(project,'state/memory-isolation-'))
const snapshot=join(project,'state/snapshots/stale-fee/user.db')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const initialHash=hash(await readFile(snapshot))
const marker=`synthetic-isolation-${randomUUID()}`
const containsMarker=path=>{
  const db=new DatabaseSync(path,{readOnly:true})
  try{return db.prepare('SELECT content FROM nodes').all().some(row=>row.content.includes(marker))}
  finally{db.close()}
}
assert.equal(containsMarker(snapshot),false)
const records=[]
console.log(JSON.stringify({root,paidRequests:0}))
for(const [label,recipe,action,expected] of [['writer','B','save-search',true],['fresh-b','B','search',false],['fresh-d','D','search',false]]){
  const trialRoot=join(root,label);await mkdir(trialRoot)
  await writeFile(join(trialRoot,'pricing.json'),JSON.stringify(offlinePricing()))
  const provider=await startOfflineProvider({recipe,memoryProbe:{marker,action}})
  let broker
  try{
    broker=await startOfflineBroker({root:trialRoot,trialId:label,endpoint:provider.endpoint,durationMs:60000})
    const result=await evaluateIsolatedTrial({root:trialRoot,broker,recipe,backend,taskId:'stale-fee',memorySnapshot:snapshot,memoryCache:join(project,'state/engram/models'),timeoutMs:60000,beforeRun:world=>provider.setWorkspace(world.agentWorkspace??world.workspace)})
    await writeFile(join(trialRoot,'offline-requests.json'),JSON.stringify(provider.requests)+'\n')
    assert.equal(provider.error,null)
    assert.equal(result.result.status,0,JSON.stringify(result.result))
    assert.equal(result.verdict.pass,true)
    if(backend==='linux')assert.equal(result.result.cleanupVerified,true)
    const contents=provider.requests.flatMap(req=>req.messages.filter(m=>m.role==='tool').map(m=>m.content))
    // Query echo is expected in current_user_request. Inspect only the
    // returned historical-memory block and separately the persisted nodes.
    const packets=contents.flatMap(content=>[...content.matchAll(/<engram_memory_context[^>]*>([\s\S]*?)<\/engram_memory_context>/g)].map(m=>m[1]))
    assert.ok(packets.length>0,'search must return an actual memory packet')
    assert.equal(packets.some(packet=>packet.includes(marker)),expected,'retrieval result must match trial-local state')
    assert.equal(containsMarker(join(trialRoot,'world/memory/user.db')),expected)
    assert.equal(hash(await readFile(snapshot)),initialHash,'frozen snapshot must remain byte-identical')
    const ledger=JSON.parse(await readFile(join(trialRoot,'budget.json'),'utf8'))
    assert.equal(ledger.entries.length,provider.requests.length)
    assert.ok(ledger.entries.length<=12)
    assert.ok(ledger.entries.every(row=>row.status==='metered'))
    const auxiliaryRequests=provider.requests.filter(req=>!req.tools?.length).length
    assert.ok(auxiliaryRequests>=1,'exercise and meter the actual rewrite-model path')
    records.push({label,recipe,save:action==='save-search',retrieved:expected,databaseContainsMarker:expected,requests:provider.requests.length,auxiliaryRequests,testPass:true,snapshotUnchanged:true})
    await writeFile(join(trialRoot,'offline-requests.json'),JSON.stringify(provider.requests)+'\n')
    console.log(`${label}: actual save/search isolation passed (${provider.requests.length} requests, ${auxiliaryRequests} auxiliary)`)
  }finally{await broker?.close();await provider.close()}
}
await writeFile(join(root,'acceptance.json'),JSON.stringify({schemaVersion:1,backend,offlineOnly:true,paidRequests:0,comparisonEligible:false,snapshotSha256:initialHash,records},null,2)+'\n')
