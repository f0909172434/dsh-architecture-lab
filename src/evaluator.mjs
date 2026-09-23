import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { harness, project } from './runtime.mjs'
import { prepareDshWorld } from './isolation/dsh.mjs'
import { prepareLinuxDshWorld } from './isolation/linux-dsh.mjs'
import { judge } from './judge/index.mjs'
import { task } from '../tasks/catalog.mjs'

async function collectLogs(source,destination){
  await mkdir(destination,{recursive:true})
  for(const entry of await readdir(source,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('session evidence contains a symbolic link')
    if(entry.isDirectory())await collectLogs(join(source,entry.name),join(destination,entry.name))
    else if(entry.isFile()&&/^session(?:\.v3)?\.jsonl(?:\.zstd)?$/.test(entry.name))await copyFile(join(source,entry.name),join(destination,entry.name))
  }
}

/** One fresh attempt through the upstream evaluator. Its structural report is
 * preserved separately from the trusted correctness verdict. The supplied
 * broker owns the request limit, deadline, credentials and durable ledger.
 * Live broker creation remains held until protocol and billing reconciliation.
 */
export async function evaluateIsolatedTrial({ root, broker, recipe, taskId, memorySnapshot, memoryCache, signal, timeoutMs = 600_000, prompt, seedDir, beforeRun, backend='native', allowUnacceptedImage=false }) {
  if(!['native','linux'].includes(backend))throw new Error('unsupported trial backend')
  const spec=task(taskId),runtime=await harness()
  const {runEval}=await import('../upstream/dsh-eval-harness/lib/runner.js')
  const caseDir=join(root,'case'),outputDir=join(root,'evaluation'),worldRoot=join(root,'world')
  await mkdir(caseDir);await mkdir(worldRoot)
  await writeFile(join(caseDir,'task.yml'),`name: ${spec.id}\nprompt: ${JSON.stringify(prompt??spec.prompt)}\nassert:\n  turn_end: completed\n`,{flag:'wx'})
  let world,result,launches=0
  const report=await runEval({
    casesDir:caseDir,outputDir,profile:`architecture-${recipe}`,retries:0,trials:1,concurrency:1,timeoutMs,signal,
    seedDir:seedDir??join(project,'tasks',taskId,'fixture'),
    command:{bin:process.execPath,prefixArgs:[runtime.bin],version:runtime.version},
    judge:async()=>{throw new Error('auxiliary model judging is disabled')},
    processRunner:async input=>{
      if(++launches!==1)throw new Error('a trial permits exactly one attempt')
      const prepare=backend==='linux'?prepareLinuxDshWorld:prepareDshWorld
      world=await prepare(worldRoot,broker,{recipe,memorySnapshot,memoryCache,workspace:input.workspace,allowUnacceptedImage})
      await beforeRun?.(world)
      result=await world.run(input.prompt,{timeoutMs:input.timeoutMs,signal:input.signal})
      await writeFile(join(root,'process.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600})
      // Keep the evaluator's report/session parents outside the jail. Only the
      // trusted parent copies logs, rejecting links before the collector reads.
      await collectLogs(join(world.home,'sessions'),input.sessionRoot)
      return {code:result.status,timedOut:result.reason==='timeout',stderrTail:result.stderr.slice(-8192)}
    },
  })
  const verdict=world?await judge(taskId,world.workspace):{pass:false,status:'unavailable',reason:'trial_not_launched'}
  if(verdict.status==='unavailable')verdict.pass=null
  const trace=report.cases[0]
  const outcome={
    schemaVersion:2,taskId,recipe,attempts:launches,backend,
    ...(backend==='linux'?{exportedWorkspace:world?.workspace??null}:{}),
    correctness:verdict,
    // Preserve text for later preregistered coding; a normal stop alone does
    // not prove the model claimed that the task was solved.
    claimedCompletion:null,finalText:trace?.finalText??'',
    terminalReason:signal?.aborted?'cancelled':result?.reason??trace?.turnEnd??'unknown',
    evaluatorStatus:trace?.status??'error',durationMs:report.durationMs,
    rawReport:'evaluation/report.json',processEvidence:'process.json',
    evidenceValid:false,evidenceLimit:'Eligibility is derived by the controller evidence audit; this outcome alone cannot qualify a trial.',
  }
  await writeFile(join(root,'outcome.json'),JSON.stringify(outcome,null,2)+'\n',{mode:0o600})
  return {world,result,report,outcome,verdict}
}
