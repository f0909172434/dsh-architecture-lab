// Inspect frozen inputs and evaluate reference/defective implementations through
// the actual external judge. No model or candidate gets the reference sources.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { project } from '../src/runtime.mjs'
import { tasks } from '../tasks/catalog.mjs'
import { cases } from '../tasks/cases.mjs'
import { references } from '../test/reference-solutions.mjs'
import { judge } from '../src/judge/index.mjs'
import { trialOrder } from '../src/recipes.mjs'

const root=await mkdtemp(join(project,'state/fixture-review-')),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const results=[]
for(const task of tasks){
  const fixture=join(project,'tasks',task.id,'fixture'),history=(await readFile(join(fixture,'history.md'),'utf8')).trim()
  const snapshot=join(project,'state/snapshots',task.id,'user.db'),before=sha(await readFile(snapshot))
  const metadata=JSON.parse(await readFile(join(project,'state/snapshots',task.id,'snapshot.json'),'utf8'))
  assert.equal(metadata.snapshotSha256,before);assert.equal(metadata.historySha256,sha(history))
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try{assert.deepEqual(db.prepare('SELECT content FROM nodes').all().map(row=>row.content),[history])}finally{db.close()}
  const workspace=join(root,task.id);await mkdir(workspace)
  await writeFile(join(workspace,'index.mjs'),references[task.id])
  const reference=await judge(task.id,workspace),original=await judge(task.id,fixture)
  assert.equal(reference.pass,true,JSON.stringify(reference));assert.equal(original.status,'failed')
  assert.ok(original.failedCases.length>0)
  assert.equal(sha(await readFile(snapshot)),before)
  results.push({taskId:task.id,category:task.category,cases:cases[task.id].cases.length,promptSha256:sha(task.prompt),historySha256:sha(history),snapshotSha256:before,
    caseCatalogSha256:sha(JSON.stringify(cases[task.id])),snapshotExactHistoryOnly:true,snapshotUnchanged:true,seedReceiptMatches:true,referenceSourceSha256:sha(references[task.id]),reference,original})
}
const schedule=trialOrder(tasks.map(task=>task.id)),positions=Object.fromEntries(['A','B','C','D'].map(id=>[id,[0,0,0,0]]))
assert.equal(schedule.length,72);assert.equal(new Set(schedule.map(row=>`${row.taskId}:${row.repetition}:${row.recipe}`)).size,72)
for(const [index,row] of schedule.entries())positions[row.recipe][index%4]++
assert.ok(Object.values(positions).flat().every(value=>value===4||value===5))
const result={createdAt:new Date().toISOString(),passed:true,paidRequests:0,comparisonEligible:false,reviewKind:'input-and-judge-validation',results,
  schedule:{trials:72,unique:true,positions},limitation:'Reference correctness and original-defect rejection are finite test evidence, not model-performance results or complete semantic proofs.'}
await writeFile(join(root,'acceptance.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({root,...result}))
