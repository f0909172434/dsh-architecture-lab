import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { recipe as getRecipe } from './recipes.mjs'
import { task } from '../tasks/catalog.mjs'
import { project } from './runtime.mjs'
import { readRegistry, updateRegistry } from './registry.mjs'
import { openControl, contactControl } from './control.mjs'
import { prepareLinuxDshWorld, exportLinuxDshWorld } from './isolation/linux-dsh.mjs'
import { verifyContainerCleanup } from './linux-process.mjs'
import { startDailyModelBroker, startOfflineBroker } from './broker/server.mjs'
import { authoritativeBudgetRoot, ledgerRootFor } from './broker/location.mjs'
import { brokerCompletion } from './completion.mjs'
import { readIsolatedCredential } from './credential.mjs'
import { startOfflineProvider, offlinePricing } from './offline-provider.mjs'
import { assertDailyReady } from './readiness.mjs'
import { dailyRoot, dailyRegistry, getDailyProject, importDailyProject, dailyHead, copyDailyWorkspace, readWorkspace, validDailyId, dailyWorldPath } from './daily-workspace.mjs'

const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const directoryFor=(root,id)=>join(dailyRoot(root),'runs',id)
const update=(root,fn)=>updateRegistry(dailyRoot(root),fn)
async function entriesAt(root){try{return JSON.parse(await readFile(join(root,'budget.json'),'utf8')).entries}catch(error){if(error.code==='ENOENT')return [];throw error}}

export function createDailyTask(root,{projectId,prompt,recipe='A'}){
  getDailyProject(root,projectId);getRecipe(recipe)
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>16000)throw new Error('請提供 1 至 16000 字的任務內容')
  const item={id:randomUUID(),projectId,prompt:prompt.trim(),recipe,kind:'user-task',createdAt:new Date().toISOString(),firstStartedAt:null}
  update(root,state=>{if(state.active)throw new Error('請先結束目前的日常任務');state.jobs??=[];state.jobs.push(item);state.selectedRecipe=recipe})
  return item
}

export async function createDailyCheck(root,recipe='A',{projectId}={}){
  getRecipe(recipe)
  const item=projectId?getDailyProject(root,projectId):await importDailyProject(root,{label:'離線日常流程範例',source:join(project,'tasks/stale-fee/fixture')})
  if(projectId&&!item.installationSample)throw new Error('離線檢查只使用內建範例專案')
  const job=createDailyTask(root,{projectId:item.id,recipe,prompt:task('stale-fee').prompt})
  update(root,state=>{
    state.projects.find(row=>row.id===item.id).installationSample=true
    state.jobs.find(row=>row.id===job.id).kind='installation-check'
  })
  return {...job,kind:'installation-check'}
}

export function getDailyTask(root,id){
  if(!validDailyId(id))throw new Error('invalid daily task')
  const job=dailyRegistry(root).jobs?.find(row=>row.id===id)
  if(!job)throw new Error('找不到日常任務')
  return job
}

async function usage(root,row){
  const ledger=ledgerRootFor(dailyRoot(root),row.mode)
  const entries=(await entriesAt(ledger)).filter(entry=>entry.trialId===row.trialId&&!(row.priorRequestIds??[]).includes(entry.id))
  const completion=await brokerCompletion(ledger,entries)
  return {requests:entries.length,requestIds:entries.map(e=>e.id),costTwd:entries.every(e=>e.status==='metered'&&Number.isFinite(e.actualTwd))?entries.reduce((n,e)=>n+e.actualTwd,0):null,
    reservedTwd:entries.reduce((n,e)=>n+e.reservedTwd,0),claimedCompletion:completion.claimedCompletion,finalText:completion.finalText,
    paidRequests:row.mode==='offline'?0:entries.length}
}

export async function recoverDaily(root){
  const before=readRegistry(dailyRoot(root)),active=before.active
  let attention
  if(active){
    let absent=false
    try{await contactControl(active)}catch{
      try{process.kill(active.pid,0)}catch(error){if(error.code==='ESRCH')absent=true}
      if(!absent)attention='日常執行狀態尚無法確認，不會自動重新啟動。'
    }
    if(absent){
      const row=before.runs.find(r=>r.runId===active.runId),accounting=await usage(root,row)
      update(root,state=>{
        if(state.active?.runId!==active.runId)return
        Object.assign(state.runs.find(r=>r.runId===active.runId),accounting,{status:'interrupted',terminalReason:'controller_lost',finishedAt:new Date().toISOString(),cleanupVerified:!row.containerRunId})
        state.active=null
      })
    }
  }
  for(const row of dailyRegistry(root).runs.filter(r=>r.cleanupVerified===false&&r.containerRunId&&r.status!=='running')){
    let proof
    try{proof=await verifyContainerCleanup(row.containerRunId,row.containerImage)}catch{continue}
    if(proof)update(root,state=>{Object.assign(state.runs.find(r=>r.runId===row.runId),{cleanupVerified:true,cleanupEvidence:proof})})
  }
  for(const row of dailyRegistry(root).runs.filter(r=>r.terminalReason==='controller_lost'&&r.containerRunId&&r.cleanupVerified===true&&!r.recoveryExportChecked)){
    const claimed=update(root,state=>{const current=state.runs.find(r=>r.runId===row.runId);if(current.recoveryExportChecked)return false;Object.assign(current,{recoveryExportChecked:true,artifactError:'中斷後成果匯出未完成；原始證據仍保留。'});return true})
    if(!claimed)continue
    const result={recoveryExportChecked:true}
    try{
      const recovered=join(directoryFor(root,row.runId),'recovered-world')
      await mkdir(recovered,{mode:0o700})
      await exportLinuxDshWorld(recovered,row.containerRunId)
      const tree=await readWorkspace(join(recovered,'workspace'),{filter:'output'})
      Object.assign(result,{worldDirectory:'recovered-world',outputManifest:tree.files.map(({path,sha256})=>({path,sha256})),artifactError:null})
    }catch{result.artifactError='中斷後成果未能完整匯出；原始證據仍保留。'}
    update(root,state=>Object.assign(state.runs.find(r=>r.runId===row.runId),result))
  }
  return {...dailyRegistry(root),...(attention?{attention}:{})}
}

export async function stopDaily(root){
  const active=readRegistry(dailyRoot(root)).active
  if(!active)throw new Error('目前沒有日常任務正在執行')
  await contactControl(active,'stop');return {stopping:true,runId:active.runId}
}

export async function runDailyTask({root,jobId,mode='live',resume=false,signal,responseDelayMs=0,memoryProbe}){
  if(!['live','offline'].includes(mode))throw new Error('unknown daily mode')
  if(mode==='live')assertDailyReady() // No credentials, files or paid state before the gate.
  const job=getDailyTask(root,jobId),selected=getRecipe(job.recipe)
  if(mode==='offline'&&(job.kind!=='installation-check'||job.prompt!==task('stale-fee').prompt||!getDailyProject(root,job.projectId).installationSample))throw new Error('離線驗證不會模擬一般使用者任務')
  if(mode==='live'&&job.kind!=='user-task')throw new Error('安裝範例不使用付費模型')
  await recoverDaily(root)
  if(readRegistry(root).active)throw new Error('請先完成研究試驗，再執行日常任務')
  const previous=dailyRegistry(root).runs.filter(row=>row.jobId===jobId)
  if(!resume&&previous.length)throw new Error('任務已有執行紀錄；中斷後請明確恢復')
  if(resume&&previous.at(-1)?.status!=='interrupted')throw new Error('沒有可恢復的日常任務')
  if(previous.some(row=>row.mode!==mode))throw new Error('不能在離線與正式執行之間切換同一任務')
  const startedAt=new Date().toISOString(),firstStartedAt=job.firstStartedAt??startedAt
  const remaining=()=>Math.min(600000,Date.parse(firstStartedAt)+600000-Date.now())
  if(remaining()<=0)throw new Error('本任務累計 10 分鐘已用完；可查看成果並另建任務')
  const runId=randomUUID(),trialId=`daily-${jobId}`,outputDir=directoryFor(root,runId),budget=ledgerRootFor(dailyRoot(root),mode)
  const priorRequestIds=(await entriesAt(budget)).filter(entry=>entry.trialId===trialId).map(entry=>entry.id)
  const controller=new AbortController(),abort=()=>controller.abort(),control=await openControl(runId,abort)
  let record,broker,provider,world,timer
  try{
    record=updateRegistry(root,research=>{
      if(research.active||research.runs.some(row=>row.cleanupVerified===false))throw new Error('請先完成研究試驗與程序清理')
      return update(root,state=>{
      if(state.active)throw new Error('已有日常任務正在執行')
      if(state.runs.some(row=>row.cleanupVerified===false))throw new Error('尚有未確認清理的日常程序')
      // Recheck under the transaction, so racing starts cannot duplicate a job.
      const prior=state.runs.filter(row=>row.jobId===jobId)
      if(prior.length!==previous.length)throw new Error('任務狀態已改變，請重新整理')
      const row={schemaVersion:1,kind:'daily-task-attempt',jobId,runId,trialId,projectId:job.projectId,recipe:job.recipe,attempt:prior.length+1,mode,startedAt,firstStartedAt,status:'running',outputDir,worldDirectory:'world',baseRunId:null,priorRequestIds,evidenceValid:false,comparisonEligible:false,validatedCorrectness:false}
      state.jobs.find(row=>row.id===jobId).firstStartedAt=firstStartedAt;state.runs.push(row);state.active={runId,trialId,pid:process.pid,control:control.descriptor};return row
      })
    })
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
    timer=setTimeout(abort,Math.max(1,remaining()))
    await mkdir(outputDir,{recursive:true,mode:0o700})
    let head=await dailyHead(root,job.projectId)
    const reviewTree=await readWorkspace(head.workspace,{filter:'output'})
    record.reviewManifest=reviewTree.files.map(({path,sha256})=>({path,sha256}))
    if(resume){
      const last=previous.at(-1)
      if(head.headRunId!==last.baseRunId)throw new Error('專案成果已更新，請以新任務承接')
      if(last.outputManifest){
        const path=join(dailyWorldPath(root,last),'workspace'),tree=await readWorkspace(path,{filter:'output'})
        if(JSON.stringify(tree.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(last.outputManifest))throw new Error('中斷成果已變動')
        head={...head,workspace:path}
      }
    }
    record.baseRunId=head.headRunId
    record.inputManifest=await copyDailyWorkspace(head.workspace,join(outputDir,'input'))
    if(record.priorRequestIds.length>=12)throw new Error('本任務累計 12 次請求已用完')
    update(root,state=>Object.assign(state.runs.find(r=>r.runId===runId),record))
    if(controller.signal.aborted||remaining()<=0)throw new Error('任務已停止或逾時')
    if(mode==='offline'){
      await mkdir(budget,{recursive:true,mode:0o700});await writeFile(join(budget,'pricing.json'),JSON.stringify(offlinePricing())+'\n',{mode:0o600})
      provider=await startOfflineProvider({recipe:job.recipe,responseDelayMs,memoryProbe,onRequest:({step})=>writeFile(join(outputDir,'request-progress.json'),JSON.stringify({step})+'\n',{mode:0o600})})
      broker=await startOfflineBroker({root:budget,trialId,endpoint:provider.endpoint,durationMs:Math.max(1,remaining())})
    }else{
      const apiKey=await readIsolatedCredential(join(authoritativeBudgetRoot,'dsh-home'))
      broker=await startDailyModelBroker({root:budget,trialId,apiKey,durationMs:Math.max(1,remaining())})
    }
    await mkdir(join(outputDir,'world'),{mode:0o700})
    world=await prepareLinuxDshWorld(join(outputDir,'world'),broker,{recipe:job.recipe,purpose:'daily',workspace:join(outputDir,'input'),memorySnapshot:selected.memory?head.memorySnapshot:undefined})
    Object.assign(record,{containerRunId:world.containerRunId,containerImage:world.containerImage,cleanupVerified:false})
    update(root,state=>Object.assign(state.runs.find(r=>r.runId===runId),record));provider?.setWorkspace(world.agentWorkspace)
    const context=`日常工作任務。請以繁體中文說明結果。\n${resume?'這是中斷任務的明確恢復，請檢查已保存的變更再繼續。\n':''}${job.prompt}`
    const result=await world.run(context,{signal:controller.signal,timeoutMs:Math.max(1,remaining())})
    await writeFile(join(outputDir,'process.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600})
    Object.assign(record,{status:controller.signal.aborted?'interrupted':result.status===0&&!provider?.error?'completed':'failed',terminalReason:controller.signal.aborted?'cancelled-or-timeout':result.reason,cleanupVerified:result.cleanupVerified===true,error:provider?.error??result.artifactError??null})
    if(record.cleanupVerified&&!result.artifactError){
      const output=await readWorkspace(world.workspace,{filter:'output'})
      record.outputManifest=output.files.map(({path,sha256})=>({path,sha256}))
      if(selected.memory){try{record.memorySha256=sha(await readFile(join(outputDir,'world/memory/user.db')))}catch(error){if(error.code!=='ENOENT')throw error}}
    }
  }catch(error){
    if(!record)throw error
    Object.assign(record,{status:controller.signal.aborted?'interrupted':'failed',terminalReason:controller.signal.aborted?'cancelled-or-timeout':'controller-error',error:error.message,cleanupVerified:record.containerRunId?false:true})
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort)
    try{
      await broker?.close();await provider?.close()
      if(provider)await writeFile(join(outputDir,'offline-requests.json'),JSON.stringify(provider.requests)+'\n',{mode:0o600})
      if(record){
        Object.assign(record,await usage(root,record),{finishedAt:new Date().toISOString(),durationMs:Date.now()-Date.parse(startedAt)})
        await mkdir(outputDir,{recursive:true,mode:0o700});await writeFile(join(outputDir,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600})
        update(root,state=>{if(state.active?.runId!==runId)throw new Error('daily controller identity changed');state.runs[state.runs.findIndex(row=>row.runId===runId)]=record;state.active=null})
      }
    }finally{await control.close()}
  }
  return record
}
