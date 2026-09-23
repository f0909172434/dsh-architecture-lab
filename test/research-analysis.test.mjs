import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeResearch } from '../src/research-analysis.mjs'
import { tasks } from '../tasks/catalog.mjs'

const protocolId='a'.repeat(64),image='sha256:'+'1'.repeat(64)
function quartet({taskId='stale-fee',repetition=1,passes=[false,true,false,true],costs=[1,2,3,4],protocol=protocolId}={}){
  return ['A','B','C','D'].map((recipe,index)=>({mode:'live',protocolId:protocol,taskId,repetition,recipe,attempt:1,
    launched:true,evidenceValid:true,status:'completed',containerImage:image,test:{pass:passes[index]},
    claimedCompletion:true,costTwd:costs[index],durationMs:100*(index+1),requests:4}))
}
const first=rows=>analyzeResearch(rows).protocols[0]

test('factorial contrasts compare matched quartets and keep false claims separate',()=>{
  const report=first(quartet())
  assert.equal(report.contrasts.memory.verifiedPass.taskBalancedMeanDifference,1)
  assert.equal(report.contrasts.planning.verifiedPass.taskBalancedMeanDifference,0)
  assert.equal(report.contrasts.combined.verifiedPass.taskBalancedMeanDifference,1)
  assert.equal(report.contrasts.interaction.verifiedPass.taskBalancedMeanDifference,0)
  assert.equal(report.contrasts.combined.costTwd.taskBalancedMeanDifference,3)
  assert.equal(report.recipes.A.falseCompletions,1)
  assert.equal(report.coverage.allTasksRepresented,false)
})

test('successful resumes and scripted checks never replace a failed first attempt',()=>{
  const rows=quartet();rows[0].status='interrupted'
  const analysis=analyzeResearch([...rows,{...rows[0],attempt:2,test:{pass:true}},{...rows[0],mode:'offline',test:{pass:true}}, {...rows[0],evidenceValid:false,test:{pass:true}}])
  assert.equal(analysis.protocols[0].recipes.A.verifiedPassRate,0)
  assert.equal(analysis.protocols[0].recipes.A.interrupted,1)
  assert.equal(analysis.excluded.resumed,1);assert.equal(analysis.excluded.offline,1);assert.equal(analysis.excluded.ineligible,1)
  assert.equal(analysis.winner,null)
})

test('partial quartets retain arm denominators without inventing paired results',()=>{
  const report=first(quartet().slice(0,3))
  assert.equal(report.comparisonAvailable,false)
  assert.equal(report.coverage.incompleteQuartets,1);assert.equal(report.coverage.unlaunchedQuartets,17)
  assert.equal(report.recipes.A.launchedFirstAttempts,1);assert.equal(report.recipes.D.verifiedPassRate,null)
  assert.equal(report.contrasts.memory.verifiedPass.blocks,0)
})

test('separate protocols and repetitions cannot be accidentally paired',()=>{
  const a=quartet(),b=quartet({protocol:'b'.repeat(64)})
  const analysis=analyzeResearch([...a.slice(0,2),...b.slice(2)])
  assert.equal(analysis.protocols.length,2);assert.ok(analysis.protocols.every(row=>!row.comparisonAvailable))
  const mixed=first([...a.slice(0,2),...quartet({repetition:2}).slice(2)])
  assert.equal(mixed.coverage.completeQuartets,0)
})

test('unknown cost or duration cannot become zero or a selectively favorable mean',()=>{
  const rows=quartet({costs:[1,null,3,4]});rows[2].durationMs=undefined
  const report=first(rows)
  assert.equal(report.recipes.B.costTwd.total,null);assert.equal(report.recipes.B.costTwd.unknown,1)
  assert.equal(report.contrasts.memory.costTwd.taskBalancedMeanDifference,null)
  assert.equal(report.contrasts.memory.costTwd.unknown,1)
  assert.equal(report.contrasts.planning.durationMs.taskBalancedMeanDifference,null)
  assert.equal(report.contrasts.combined.costTwd.taskBalancedMeanDifference,3)
})

test('task-balanced effects do not overweight tasks with more completed repetitions',()=>{
  const rows=[...quartet(),...quartet({repetition:2}),...quartet({repetition:3}),...quartet({taskId:'stale-date',passes:[true,false,true,false]})]
  const effect=first(rows).contrasts.memory.verifiedPass
  assert.equal(effect.blockMeanDifference,.5)
  assert.equal(effect.taskBalancedMeanDifference,0)
  assert.equal(effect.positiveBlocks,3);assert.equal(effect.negativeBlocks,1)
})

test('duplicate first attempts, unavailable judges or changed images invalidate analysis',()=>{
  const rows=quartet()
  for(const corrupted of [[...rows,rows[0]], rows.map((r,i)=>i===0?{...r,test:{status:'unavailable',pass:false}}:r),rows.map((r,i)=>i===0?{...r,containerImage:'sha256:'+'2'.repeat(64)}:r)]){
    const report=first(corrupted)
    assert.equal(report.comparisonAvailable,false);assert.ok(report.integrityErrors.length)
    assert.equal(report.recipes,null);assert.equal(report.contrasts,null)
  }
})

test('all 72 eligible observations yield full coverage but no automated winner',()=>{
  const rows=tasks.flatMap(task=>[1,2,3].flatMap(repetition=>quartet({taskId:task.id,repetition})))
  const analysis=analyzeResearch(rows),report=analysis.protocols[0]
  assert.equal(report.coverage.completeQuartets,18);assert.equal(report.coverage.allTasksRepresented,true)
  assert.equal(report.recipes.A.launchedFirstAttempts,18);assert.equal(analysis.winner,null)
})

test('missing pass evidence stays in launched denominator; malformed metadata is disclosed',()=>{
  const rows=quartet();delete rows[0].test;rows[0].claimedCompletion=null
  const analysis=analyzeResearch([...rows,{...rows[0],protocolId:'unknown'},{...rows[0],status:'running'}])
  assert.equal(analysis.protocols[0].recipes.A.verifiedPassRate,0)
  assert.equal(analysis.protocols[0].recipes.A.unknownTestResults,1)
  assert.equal(analysis.protocols[0].recipes.A.unknownCompletionClaims,1)
  assert.equal(analysis.excluded.malformed,1);assert.equal(analysis.excluded.nonterminal,1)
})
