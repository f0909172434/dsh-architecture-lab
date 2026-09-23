import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tasks } from '../tasks/catalog.mjs'
import { trialOrder } from './recipes.mjs'
import { readState } from './store.mjs'
import { loadPricing } from './budget.mjs'
import { hasIsolatedCredential } from './credential.mjs'
import { assertLiveReady, liveBlockers } from './readiness.mjs'
import { harness, versions, project } from './runtime.mjs'
import { readRegistry } from './registry.mjs'
import { recoverRegistry, runManagedTrial, stopManagedRun, chooseRecipe } from './manager.mjs'
import { exportManagedReport } from './managed-report.mjs'
import { prepareProtocol } from './protocol.mjs'

const root = process.env.DSH_ARCH_LAB_ROOT ?? join(project,'state')
const statePath=join(root,'lab-state.json'), home=join(root,'dsh-home')
const commands=['doctor','prepare','status','select','check-one','resume-check','run-one','resume-one','run-batch','report','stop']

async function installed(profile, name) {
  try { return JSON.parse(await readFile(join(home, 'profiles', profile, 'node_modules', name, 'package.json'), 'utf8')).version } catch { return null }
}

async function doctor() {
  let pricing = 'unavailable (offline only)'
  try { const p = await loadPricing(root); pricing = `${p.checkedAt} (${p.source}; FX ${p.fxSource})` } catch (error) { pricing = `unavailable: ${error.message}` }
  let evaluator = null
  try { evaluator = JSON.parse(await readFile(join(project, 'upstream/dsh-eval-harness/package.json'), 'utf8')).version } catch (error) { if (error.code !== 'ENOENT') throw error }
  let isolatedHarness = null
  try { isolatedHarness = (await harness()).version } catch {}
  const info = {
    pinnedVersions: await versions(),
    isolatedHarness,
    profiles: { A: 'lab-a', B: 'lab-b', C: 'lab-c', D: 'lab-d' },
    engram: await installed('lab-b', '@kenz1117/dsh-engram'),
    planner: await installed('lab-c', 'dsh-plan-and-execute'),
    evaluator,
    pricing,
    isolatedCredentialAvailable: await hasIsolatedCredential(home),
    recordedTrials: readRegistry(root).runs.length,
    legacyTrials: (await readState(statePath)).trials.length,
    liveReady: liveBlockers.length === 0,
    liveBlockers,
    readiness: {
      A: 'scripted isolated DSH/evaluator/judge integration passes; paid run held',
      B: 'patched Engram integration passes; historical pilot remains contaminated',
      C: 'patched planner completes through isolated upstream evaluator; GUI acceptance pending',
      D: 'combined scripted integration passes; research protocol and live acceptance pending',
    },
  }
  console.log(JSON.stringify(info, null, 2))
}


const [command,...args]=process.argv.slice(2)
const controller=new AbortController()
const interrupt=()=>controller.abort()
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
try{
  if(command==='doctor')await doctor()
  else if(command==='prepare')console.log(JSON.stringify(await prepareProtocol(root),null,2))
  else if(command==='status')console.log(JSON.stringify(await recoverRegistry(root),null,2))
  else if(command==='select')console.log(`已選擇 ${chooseRecipe(root,args[0])}；後續實驗會以此配方建立獨立環境。`)
  else if(['run-one','resume-one','check-one','resume-check'].includes(command)){
    const offline=command==='check-one'||command==='resume-check'
    const row=await runManagedTrial({root,taskId:offline?'stale-fee':args[0],recipe:offline?(args[0]??readRegistry(root).selectedRecipe):(args[2]??readRegistry(root).selectedRecipe),repetition:Number(args[1]??1),mode:offline?'offline':'live',resume:command.startsWith('resume'),signal:controller.signal})
    console.log(JSON.stringify(row,null,2))
    if(row.status!=='completed'||row.test?.pass!==true)process.exitCode=1
  }else if(command==='run-batch'){
    assertLiveReady()
    for(const row of trialOrder(tasks.map(item=>item.id))){
      if(controller.signal.aborted)break
      const prior=readRegistry(root).runs.filter(run=>run.mode==='live'&&run.taskId===row.taskId&&run.recipe===row.recipe&&run.repetition===row.repetition)
      if(prior.length){if(prior.every(run=>run.status==='completed'))continue;throw new Error('批次中有未完成紀錄，請從實驗室明確恢復')}
      const result=await runManagedTrial({root,...row,mode:'live',signal:controller.signal})
      console.log(JSON.stringify(result))
      if(result.status==='interrupted')break
    }
  }else if(command==='report')console.log(JSON.stringify(await exportManagedReport(root,resolve(args[0]??join(root,'comparison-v2.json'))),null,2))
  else if(command==='stop')console.log(JSON.stringify(await stopManagedRun(root)))
  else throw new Error(`usage: npm run lab -- ${commands.join(' | ')}`)
}catch(error){console.error(error.message);process.exitCode=1}
finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt)}
