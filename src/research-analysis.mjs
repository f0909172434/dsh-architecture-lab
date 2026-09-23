import { tasks } from '../tasks/catalog.mjs'

const recipes=['A','B','C','D']
const knownTasks=new Set(tasks.map(task=>task.id))
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null
const numeric=value=>Number.isFinite(value)&&value>=0
const passed=row=>row.test?.pass===true?1:0
export const analysisPolicy=Object.freeze({
  version:'paired-descriptive-v1',
  primary:'verified external-test pass within the shared allowance',
  denominator:'every eligible launched terminal first attempt, including limits and interruptions',
  pairing:'same protocol, task and repetition; complete A/B/C/D quartets only',
  contrasts:{memory:{A:-1,B:1},planning:{A:-1,C:1},combined:{A:-1,D:1},interaction:{A:1,B:-1,C:-1,D:1}},
  aggregation:'equal weight per represented task, averaging repetitions within task',
  missing:'report all launched arms; do not impute unlaunched arms or substitute resumes',
  uncertainty:'descriptive only; six fixed tasks and repeated runs are not independent population samples',
  selection:'no automatic winner; report cost, completion claims and failure evidence separately',
})

function totals(rows,key){
  const known=rows.filter(row=>numeric(row[key]))
  return {total:known.length===rows.length&&rows.length?known.reduce((sum,row)=>sum+row[key],0):null,
    observedTotal:known.reduce((sum,row)=>sum+row[key],0),known:known.length,unknown:rows.length-known.length}
}
function arm(rows){
  return {launchedFirstAttempts:rows.length,verifiedPasses:rows.filter(row=>passed(row)).length,
    verifiedPassRate:average(rows.map(passed)),
    unknownTestResults:rows.filter(row=>typeof row.test?.pass!=='boolean').length,
    interrupted:rows.filter(row=>row.status==='interrupted').length,
    falseCompletions:rows.filter(row=>row.claimedCompletion===true&&row.test?.pass===false).length,
    unknownCompletionClaims:rows.filter(row=>typeof row.claimedCompletion!=='boolean').length,
    costTwd:totals(rows,'costTwd'),durationMs:totals(rows,'durationMs'),requests:totals(rows,'requests')}
}
function contrast(quartets,weights,measure){
  const data=quartets.map(block=>{
    let value=0
    for(const [id,weight] of Object.entries(weights)){
      const amount=measure(block.rows[id])
      if(amount===null)return {...block,value:null}
      value+=weight*amount
    }
    return {...block,value}
  })
  const perTask=tasks.map(task=>{
    const items=data.filter(row=>row.taskId===task.id)
    const unknown=items.filter(row=>row.value===null).length
    return {taskId:task.id,category:task.category,blocks:items.length,unknown,
      meanDifference:unknown?null:average(items.map(row=>row.value))}
  })
  const unknown=data.filter(row=>row.value===null).length
  return {blocks:data.length,unknown,blockMeanDifference:unknown?null:average(data.map(row=>row.value)),
    taskBalancedMeanDifference:unknown?null:average(perTask.filter(row=>row.blocks).map(row=>row.meanDifference)),
    positiveBlocks:data.filter(row=>row.value>0).length,negativeBlocks:data.filter(row=>row.value<0).length,
    zeroBlocks:data.filter(row=>row.value===0).length,perTask}
}

/** Pure descriptive analysis; no eligibility promotion, provider calls or best-of
 * selection. Separate protocols are never pooled. Missing costs stay unknown.
 */
export function analyzeResearch(runs){
  const excluded={offline:0,resumed:0,unlaunched:0,ineligible:0,nonterminal:0,malformed:0}
  const grouped=new Map()
  for(const row of runs){
    let reason
    if(row.mode!=='live')reason='offline'
    else if(row.attempt!==1)reason='resumed'
    else if(!row.launched)reason='unlaunched'
    else if(row.evidenceValid!==true)reason='ineligible'
    else if(row.status==='running')reason='nonterminal'
    else if(!/^[a-f0-9]{64}$/.test(row.protocolId??'')||!knownTasks.has(row.taskId)||!recipes.includes(row.recipe)||!Number.isInteger(row.repetition)||row.repetition<1||row.repetition>3||!['completed','failed','interrupted'].includes(row.status))reason='malformed'
    if(reason){excluded[reason]++;continue}
    if(!grouped.has(row.protocolId))grouped.set(row.protocolId,[])
    grouped.get(row.protocolId).push(row)
  }
  const protocols=[]
  for(const [protocolId,rows] of grouped){
    const blocks=new Map(),integrityErrors=[]
    for(const row of rows){
      const key=`${row.taskId}:${row.repetition}`
      if(!blocks.has(key))blocks.set(key,{taskId:row.taskId,repetition:row.repetition,rows:{}})
      const block=blocks.get(key)
      if(block.rows[row.recipe])integrityErrors.push(`duplicate first attempt: ${key}:${row.recipe}`)
      block.rows[row.recipe]=row
      if(row.test?.status==='unavailable')integrityErrors.push(`unavailable judge marked eligible: ${key}:${row.recipe}`)
      if(!/^sha256:[a-f0-9]{64}$/.test(row.containerImage??''))integrityErrors.push(`missing immutable image: ${key}:${row.recipe}`)
    }
    if(new Set(rows.map(row=>row.containerImage)).size!==1)integrityErrors.push('multiple execution images in one protocol')
    if(integrityErrors.length){protocols.push({protocolId,integrityErrors,recipes:null,contrasts:null,comparisonAvailable:false});continue}
    const quartets=[...blocks.values()].filter(block=>recipes.every(id=>block.rows[id]))
    const covered=new Set(quartets.map(row=>row.taskId))
    const contrasts=Object.fromEntries(Object.entries(analysisPolicy.contrasts).map(([name,weights])=>[name,{
      verifiedPass:contrast(quartets,weights,passed),
      costTwd:contrast(quartets,weights,row=>numeric(row.costTwd)?row.costTwd:null),
      durationMs:contrast(quartets,weights,row=>numeric(row.durationMs)?row.durationMs:null),
    }]))
    protocols.push({protocolId,integrityErrors,comparisonAvailable:quartets.length>0,
      coverage:{plannedQuartets:tasks.length*3,completeQuartets:quartets.length,incompleteQuartets:blocks.size-quartets.length,
        unlaunchedQuartets:tasks.length*3-blocks.size,representedTasks:covered.size,allTasksRepresented:covered.size===tasks.length},
      recipes:Object.fromEntries(recipes.map(id=>[id,arm(rows.filter(row=>row.recipe===id))])),contrasts})
  }
  return {policy:analysisPolicy,totalRecords:runs.length,excluded,protocols,winner:null,
    conclusion:protocols.some(row=>row.comparisonAvailable)?'Descriptive effects for the represented fixed tasks only; inspect coverage and unknown costs.':'No eligible matched comparison is available.'}
}
