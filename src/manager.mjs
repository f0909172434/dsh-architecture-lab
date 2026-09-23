import { trialClock, remainingTrialMs } from './deadline.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { recipe as selectRecipe } from './recipes.mjs'
import { task } from '../tasks/catalog.mjs'
import { project } from './runtime.mjs'
import { assertLiveReady } from './readiness.mjs'
import { readRegistry, updateRegistry, visibleRegistry } from './registry.mjs'
import { openControl, contactControl } from './control.mjs'
import { startModelBroker, startOfflineBroker } from './broker/server.mjs'
import { offlinePricing, startOfflineProvider } from './offline-provider.mjs'
import { evaluateIsolatedTrial } from './evaluator.mjs'
import { loadReviewedProtocol } from './protocol-review.mjs'
import { readIsolatedCredential } from './credential.mjs'
import { brokerCompletion } from './completion.mjs'
import { verifyContainerCleanup } from './linux-process.mjs'
import { executionBackend } from './linux-runtime.mjs'
import { ledgerRootFor, authoritativeBudgetRoot } from './broker/location.mjs'
import { loadPricing } from './budget.mjs'
import { writeLaunchEvidence, sealRunEvidence } from './run-evidence.mjs'

async function entriesAt(root) {
  try { return JSON.parse(await readFile(join(root,'budget.json'),'utf8')).entries }
  catch(error){if(error.code==='ENOENT')return [];throw error}
}

async function reconcileContainerCleanup(root){
  for(const row of readRegistry(root).runs.filter(row=>['interrupted','failed'].includes(row.status)&&row.cleanupVerified===false&&row.backend==='linux'&&row.containerRunId)){
    let proof
    try{proof=await verifyContainerCleanup(row.containerRunId,row.containerImage)}catch{continue}
    if(!proof)continue
    updateRegistry(root,state=>{
      const current=state.runs.find(item=>item.runId===row.runId)
      if(['interrupted','failed'].includes(current?.status)&&current.cleanupVerified===false)Object.assign(current,{cleanupVerified:true,cleanupEvidence:proof})
    })
  }
}

async function sealRecoveredEvidence(root){
  for(const row of readRegistry(root).runs.filter(row=>row.terminalReason==='controller_lost'&&row.cleanupVerified===true&&row.outputDir)){
    try{
      try{await readFile(join(row.outputDir,'evidence-seal.json'));continue}catch(error){if(error.code!=='ENOENT')throw error}
      // A crash may leave no final file. Preserve an existing final artifact
      // instead of overwriting it; a mismatch will remain ineligible on audit.
      try{await writeFile(join(row.outputDir,'record.json'),JSON.stringify(row,null,2)+'\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error}
      await sealRunEvidence(root,row)
    }catch{ /* Recovery remains readable; the audit explicitly reports no seal. */ }
  }
}

export async function recoverRegistry(root) {
  await reconcileContainerCleanup(root)
  await sealRecoveredEvidence(root)
  const before=readRegistry(root),active=before.active
  if(!active)return visibleRegistry(before)
  try { await contactControl(active);return visibleRegistry(before) }
  catch(error){
    // A timeout or inaccessible control port is not proof that its process
    // stopped. Only confirmed process absence allows interrupted recovery.
    let absent=false
    try{process.kill(active.pid,0)}catch(cause){if(cause.code==='ESRCH')absent=true}
    if(!absent)return {...visibleRegistry(before),attention:'執行狀態尚無法確認；不會自動重啟。'}
  }
  // A killed owner never writes its final record. Recover usage only from the
  // durable broker ledger; missing usage stays unknown and reservations remain.
  const lost=before.runs.find(run=>run.runId===active.runId)
  let accounting={}
  if(lost?.mode&&lost.trialId){
    const ledgerRoot=ledgerRootFor(root,lost.mode)
    const priorIds=new Set(before.runs.filter(run=>run.trialId===lost.trialId&&run.runId!==lost.runId).flatMap(run=>run.requestIds??[]))
    const entries=(await entriesAt(ledgerRoot)).filter(row=>row.trialId===lost.trialId&&!priorIds.has(row.id))
    const completion=await brokerCompletion(ledgerRoot,entries)
    accounting={requests:entries.length,requestIds:entries.map(row=>row.id),
      costTwd:entries.every(row=>row.status==='metered'&&Number.isFinite(row.actualTwd))?entries.reduce((sum,row)=>sum+row.actualTwd,0):null,
      reservedTwd:entries.reduce((sum,row)=>sum+row.reservedTwd,0),paidRequests:lost.mode==='offline'?0:entries.length,
      claimedCompletion:completion.claimedCompletion,completionEvidence:completion,completionSource:'broker-captured-provider-stream'}
  }
  updateRegistry(root,state=>{
    if(state.active?.runId!==active.runId)return
    const record=state.runs.find(run=>run.runId===active.runId)
    // This controller durably maps the guest before world.run may launch it.
    // A current Linux record with no launch/map cannot have a running child.
    const neverLaunched=record?.schemaVersion===2&&record.backend==='linux'&&!record.launched&&!record.containerRunId
    if(record?.status==='running')Object.assign(record,{...accounting,status:'interrupted',terminalReason:'controller_lost',finishedAt:new Date().toISOString(),evidenceValid:false,cleanupVerified:neverLaunched})
    state.active=null
  })
  await reconcileContainerCleanup(root)
  await sealRecoveredEvidence(root)
  return visibleRegistry(readRegistry(root))
}

export async function stopManagedRun(root) {
  const active=readRegistry(root).active
  if(!active)throw new Error('目前沒有執行中的實驗')
  await contactControl(active,'stop')
  return {runId:active.runId,stopping:true}
}

export function chooseRecipe(root,id) {
  selectRecipe(id)
  updateRegistry(root,state=>{if(state.active)throw new Error('請先停止目前實驗再切換配方');state.selectedRecipe=id})
  return id
}

/** Both CLI and DSH use this controller. Offline is a labelled installation
 * check with a separate synthetic ledger. There is no paid fallback or retry.
 */
export async function runManagedTrial({ root, recipe='A', taskId='stale-fee', repetition=1, mode='live', resume=false, signal, responseDelayMs=0, backend=executionBackend() }) {
  if(mode!=='offline'&&mode!=='live')throw new Error('unknown execution mode')
  if(mode==='live')assertLiveReady() // before importing credentials or creating evidence
  if(!['native','linux'].includes(backend))throw new Error('unsupported execution backend')
  if(mode==='live'&&backend!=='linux')throw new Error('正式實驗必須使用 Linux 容器後端')
  const selected=selectRecipe(recipe),spec=task(taskId)
  if(!Number.isInteger(repetition)||repetition<1||repetition>3)throw new Error('次數須為 1、2 或 3')
  if(mode==='offline'&&taskId!=='stale-fee')throw new Error('安裝驗證只使用固定合成任務 stale-fee')
  const reviewed=mode==='live'?await loadReviewedProtocol(root):null
  const protocol=reviewed?.protocol
  await recoverRegistry(root)
  const trialId=`${mode==='offline'?'offline':protocol.id}-${taskId}-${recipe}-${repetition}`
  const runId=randomUUID(),startedAt=new Date().toISOString()
  const controller=new AbortController()
  const abort=()=>controller.abort()
  const ledgerRoot=ledgerRootFor(root,mode)
  const outputDir=join(root,'v2','runs',runId)
  let provider,broker,record,result,timer
  const priorIds=new Set((await entriesAt(ledgerRoot)).filter(row=>row.trialId===trialId).map(row=>row.id))
  const control=await openControl(runId,abort)
  try{
    record=updateRegistry(root,state=>{
      if(state.active)throw new Error('已有進行中的實驗，請查看狀態或先停止')
      const daily=readRegistry(join(root,'daily'))
      if(daily.active||daily.runs.some(row=>row.cleanupVerified===false))throw new Error('請先完成日常任務與程序清理')
      if(state.runs.some(run=>run.cleanupVerified===false))throw new Error('異常停止後的子程序清理尚未確認，不能重啟或開始其他試驗')
      const prior=state.runs.filter(run=>run.trialId===trialId)
      if(!resume&&prior.length)throw new Error('此試驗已有紀錄；中斷試驗請明確使用 resume，不會覆蓋')
      if(resume&&prior.at(-1)?.status!=='interrupted')throw new Error('沒有可恢復的中斷試驗')
      if(resume&&prior.at(-1)?.backend&&prior.at(-1).backend!==backend)throw new Error('恢復試驗須使用原來的執行後端')
      const clock=trialClock(prior,startedAt)
      const row={...clock,schemaVersion:2,trialId,runId,attempt:prior.length+1,taskId,category:spec.category,recipe,repetition,mode,backend,status:'running',startedAt,protocolId:protocol?.id??null,evidenceValid:false,outputDir}
      state.runs.push(row)
      state.active={runId,trialId,pid:process.pid,startedAt,control:control.descriptor}
      return row
    })
    timer=setTimeout(abort,remainingTrialMs(record.deadlineAt))
    signal?.addEventListener('abort',abort,{once:true})
    if(signal?.aborted)abort()
    await mkdir(outputDir,{recursive:true,mode:0o700})
    if(controller.signal.aborted)throw new Error('trial cancelled before setup')
    if(mode==='offline'){
      await mkdir(ledgerRoot,{recursive:true,mode:0o700})
      await writeFile(join(ledgerRoot,'pricing.json'),JSON.stringify(offlinePricing())+'\n',{mode:0o600})
      provider=await startOfflineProvider({recipe,responseDelayMs,onRequest:({step})=>writeFile(join(outputDir,'request-progress.json'),JSON.stringify({step,at:new Date().toISOString()})+'\n',{mode:0o600})})
      broker=await startOfflineBroker({root:ledgerRoot,trialId,endpoint:provider.endpoint,deadlineAt:record.deadlineAt})
    }else{
      if(JSON.stringify(protocol.pricing)!==JSON.stringify(await loadPricing(ledgerRoot)))throw new Error('protocol prices differ from the shared live budget')
      const apiKey=await readIsolatedCredential(join(authoritativeBudgetRoot,'dsh-home'))
      broker=await startModelBroker({root:ledgerRoot,trialId,apiKey,deadlineAt:record.deadlineAt})
    }
    result=await evaluateIsolatedTrial({root:outputDir,broker,recipe,taskId,signal:controller.signal,backend,timeoutMs:remainingTrialMs(record.deadlineAt),deadlineAt:record.deadlineAt,
      memorySnapshot:selected.memory?join(root,'snapshots',taskId,'user.db'):undefined,
      memoryCache:join(project,'state/engram/models'),
      beforeRun:async world=>{
        if(controller.signal.aborted)throw new Error('trial cancelled before launch')
        remainingTrialMs(record.deadlineAt)
        record.launched=true
        if(world.containerRunId)Object.assign(record,{containerRunId:world.containerRunId,containerImage:world.containerImage})
        await writeLaunchEvidence(record,reviewed)
        updateRegistry(root,state=>{Object.assign(state.runs.find(run=>run.runId===runId),{launched:true,...(world.containerRunId?{containerRunId:world.containerRunId,containerImage:world.containerImage}:{})})})
        provider?.setWorkspace(world.agentWorkspace??world.workspace)
      },
    })
    const trace=result.report.cases[0]
    Object.assign(record,{
      status:controller.signal.aborted?'interrupted':result.result?.status===0&&!provider?.error?'completed':'failed',
      test:result.verdict,agentCompleted:trace?.turnEnd==='completed',claimedCompletion:result.outcome.claimedCompletion,
      terminalReason:result.outcome.terminalReason,evaluatorStatus:trace?.status??'error',error:provider?.error??trace?.error??null,
      executionDurationMs:result.outcome.durationMs,cleanupVerified:backend==='linux'?result.result?.cleanupVerified===true:true,
      evidence:{rawReport:join(outputDir,'evaluation/report.json'),outcome:join(outputDir,'outcome.json'),process:join(outputDir,'process.json')},
    })
  }catch(error){
    if(!record)throw error
    Object.assign(record,{status:controller.signal.aborted?'interrupted':'failed',terminalReason:controller.signal.aborted?'cancelled':'controller_error',error:error.message,evidenceValid:false,cleanupVerified:record.launched?false:true})
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort)
    try{
      await broker?.close()
      await provider?.close()
      if(record){
      const entries=(await entriesAt(ledgerRoot)).filter(row=>row.trialId===trialId&&!priorIds.has(row.id))
      const completion=await brokerCompletion(ledgerRoot,entries)
      const allMetered=entries.every(row=>row.status==='metered'&&Number.isFinite(row.actualTwd))
      Object.assign(record,{finishedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(startedAt),requests:entries.length,requestIds:entries.map(row=>row.id),costTwd:allMetered?entries.reduce((n,row)=>n+row.actualTwd,0):null,reservedTwd:entries.reduce((n,row)=>n+row.reservedTwd,0),paidRequests:mode==='offline'?0:entries.length})
      Object.assign(record,{claimedCompletion:completion.claimedCompletion,completionEvidence:completion,completionSource:'broker-captured-provider-stream'})
      await mkdir(outputDir,{recursive:true,mode:0o700})
      if(provider)await writeFile(join(outputDir,'offline-requests.json'),JSON.stringify(provider.requests)+'\n',{mode:0o600})
      await writeFile(join(outputDir,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600})
      try{await sealRunEvidence(root,record)}catch{console.error('[architecture-lab] evidence seal unavailable; comparison remains ineligible')}
      updateRegistry(root,state=>{
        if(state.active?.runId!==runId)throw new Error('active controller changed unexpectedly')
        state.runs[state.runs.findIndex(run=>run.runId===runId)]=record
        state.active=null
      })
      }
    }finally{await control.close()}
  }
  return record
}
