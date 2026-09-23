import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readRegistry, visibleRegistry } from './registry.mjs'
import { compare } from './report.mjs'
import { readState } from './store.mjs'
import { liveBlockers } from './readiness.mjs'
import { analyzeResearch } from './research-analysis.mjs'

export function compareRuns(runs){
  return Object.fromEntries(['A','B','C','D'].map(recipe=>{
    const rows=runs.filter(row=>row.recipe===recipe)
    const paid=rows.filter(row=>row.mode==='live'),offline=rows.filter(row=>row.mode==='offline')
    const eligible=rows.filter(row=>row.mode==='live'&&row.evidenceValid===true&&row.attempt===1&&row.launched===true&&row.status!=='running')
    return [recipe,{
      recordedAttempts:rows.length,offlineChecks:rows.filter(row=>row.mode==='offline').length,
      resumedAttempts:rows.filter(row=>row.attempt>1).length,
      running:rows.filter(row=>row.status==='running').length,
      interrupted:rows.filter(row=>row.status==='interrupted').length,
      failed:rows.filter(row=>row.status==='failed').length,
      eligibleFirstAttempts:eligible.length,
      passed:eligible.filter(row=>row.test?.pass===true).length,
      successRate:eligible.length?eligible.filter(row=>row.test?.pass===true).length/eligible.length:null,
      falseCompletions:eligible.filter(row=>row.claimedCompletion===true&&row.test?.pass===false).length,
      unknownCompletionClaims:eligible.filter(row=>row.claimedCompletion==null).length,
      requests:rows.reduce((n,row)=>n+(row.requests??0),0),
      paidRequests:paid.reduce((n,row)=>n+(row.requests??0),0),
      costTwd:paid.length&&paid.every(row=>Number.isFinite(row.costTwd))?paid.reduce((n,row)=>n+row.costTwd,0):null,
      reservedTwd:paid.reduce((n,row)=>n+(row.reservedTwd??0),0),
      syntheticCostTwd:offline.length&&offline.every(row=>Number.isFinite(row.costTwd))?offline.reduce((n,row)=>n+row.costTwd,0):null,
      durationMs:rows.reduce((n,row)=>n+(row.durationMs??0),0),
    }]
  }))
}

export async function managedReport(root){
  const state=visibleRegistry(readRegistry(root)),legacy=await readState(join(root,'lab-state.json'))
  let audit=null
  try{audit=JSON.parse(await readFile(join(root,'analysis/pilot-audit.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  const research=analyzeResearch(state.runs)
  return {schemaVersion:2,generatedAt:new Date().toISOString(),comparisonReady:liveBlockers.length===0&&research.protocols.some(row=>row.comparisonAvailable),blockers:liveBlockers,selectedRecipe:state.selectedRecipe,active:state.active,summary:compareRuns(state.runs),summaryScope:'operational diagnostics only; use research.protocols for comparisons',research,runs:state.runs,
    legacy:{comparisonEligible:false,source:'lab-state.json',summary:compare(legacy.trials),trials:legacy.trials,evidenceAudit:audit},
  }
}

export async function exportManagedReport(root,path){
  const report=await managedReport(root)
  await mkdir(dirname(path),{recursive:true})
  await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  return report
}
