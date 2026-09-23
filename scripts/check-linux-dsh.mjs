import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'
import { startOfflineProvider, offlinePricing } from '../src/offline-provider.mjs'
import { startOfflineBroker } from '../src/broker/server.mjs'
import { evaluateIsolatedTrial } from '../src/evaluator.mjs'
import { brokerCompletion } from '../src/completion.mjs'

const root=await mkdtemp(join(project,'state/linux-dsh-'))
const results=[]
for(const recipe of ['A','B','C','D']){
  const attempt=join(root,recipe),ledger=join(attempt,'ledger')
  await mkdir(ledger,{recursive:true})
  await writeFile(join(ledger,'pricing.json'),JSON.stringify(offlinePricing())+'\n')
  const provider=await startOfflineProvider({recipe})
  const broker=await startOfflineBroker({root:ledger,trialId:`linux-${recipe}`,endpoint:provider.endpoint})
  try{
    const result=await evaluateIsolatedTrial({root:attempt,broker,recipe,taskId:'stale-fee',backend:'linux',allowUnacceptedImage:true,
      memorySnapshot:join(project,'state/snapshots/stale-fee/user.db'),
      beforeRun:world=>provider.setWorkspace(world.agentWorkspace),
    })
    const entries=await readFile(join(ledger,'budget.json'),'utf8').then(text=>JSON.parse(text).entries).catch(error=>{if(error.code==='ENOENT')return [];throw error})
    const completion=await brokerCompletion(ledger,entries)
    const row={recipe,status:result.result?.status,reason:result.result?.reason,verdict:result.verdict,claimedCompletion:completion.claimedCompletion,
      providerError:provider.error,requests:entries.length,allMetered:entries.every(entry=>entry.status==='metered'),cleanupVerified:result.result?.cleanupVerified,
      image:result.result?.container.image,paidRequests:0}
    results.push(row)
    await writeFile(join(root,'progress.json'),JSON.stringify(results,null,2)+'\n')
    assert.equal(row.status,0,JSON.stringify(row));assert.equal(row.providerError,null)
    assert.equal(row.verdict.pass,true);assert.equal(row.allMetered,true);assert.equal(row.cleanupVerified,true)
    assert.equal(row.claimedCompletion,true)
    console.log(JSON.stringify(row))
  }finally{await broker.close();await provider.close()}
}
const summary={createdAt:new Date().toISOString(),passed:true,paidRequests:0,results,limitation:'Scripted integration only; no comparative model-performance result.'}
await writeFile(join(root,'acceptance.json'),JSON.stringify(summary,null,2)+'\n')
const imagePath=join(project,'state/linux-vm/runtime-image.json')
const image=JSON.parse(await readFile(imagePath,'utf8'))
assert.ok(results.every(row=>row.image===image.imageId),'runtime image changed during acceptance')
Object.assign(image,{accepted:true,acceptedAt:new Date().toISOString(),acceptancePath:join(root,'acceptance.json')})
await writeFile(imagePath,JSON.stringify(image,null,2)+'\n',{mode:0o600})
console.log(root)
