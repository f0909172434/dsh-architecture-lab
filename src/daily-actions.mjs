import { createDailyTask, createDailyCheck, getDailyTask, recoverDaily, stopDaily } from './daily-manager.mjs'
import { importDailyProject, previewDailyResult, adoptDailyResult, exportDailyResult } from './daily-workspace.mjs'
import { assertDailyReady, dailyBlockers } from './readiness.mjs'

export async function dailyState(root){
  return {...await recoverDaily(root),paidReady:dailyBlockers.length===0,blockers:dailyBlockers,comparisonEligible:false}
}

export async function dailyAction(root,input,launch){
  switch(input.action){
    case 'import': return importDailyProject(root,{source:input.source,label:input.label})
    case 'task': return createDailyTask(root,{projectId:input.projectId,prompt:input.prompt,recipe:input.recipe})
    case 'check': {
      const job=await createDailyCheck(root,input.recipe)
      return {...await launch(['daily-run-check',job.id]),jobId:job.id}
    }
    case 'start': case 'resume': case 'resume-check': {
      if(input.action!=='resume-check')assertDailyReady()
      getDailyTask(root,input.jobId)
      return launch([input.action==='start'?'daily-run':input.action==='resume'?'daily-resume':'daily-resume-check',input.jobId])
    }
    case 'stop': return stopDaily(root)
    case 'preview': return previewDailyResult(root,input.runId)
    case 'adopt': return adoptDailyResult(root,input.runId)
    case 'export': return exportDailyResult(root,input.runId,input.destination)
    default: throw new Error('unknown daily action')
  }
}
