// End-to-end transport/tool probe with synthetic provider responses. This is
// integration evidence, never an architecture-comparison result.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'
import { evaluateIsolatedTrial } from '../src/evaluator.mjs'
import { startOfflineBroker } from '../src/broker/server.mjs'

const root = await mkdtemp(join(project,'state/brokered-dsh-'))
const recipe=process.argv[2]??'A'
assert.ok(['A','B','C','D'].includes(recipe),'unknown recipe')
const planning=recipe==='C'||recipe==='D',memory=recipe==='B'||recipe==='D'
await writeFile(join(root,'pricing.json'), JSON.stringify({ provider:'deepseek-official', model:'deepseek-flash', source:'https://example.invalid/offline-price', fxSource:'https://example.invalid/offline-fx', checkedAt:new Date().toISOString(), inputUsdPerMillion:.3,cacheHitUsdPerMillion:.006,outputUsdPerMillion:1.2,usdTwd:31.7 }))
const privateMarker = join(root,'other-trial.txt'); await writeFile(privateMarker,'SYNTHETIC_OTHER_TRIAL_SECRET')
const requests = []
let serverError = null
let planDir,world
const server = createServer(async (req,res) => {
  try {
    let input=''; for await (const chunk of req) input+=chunk
    const body=JSON.parse(input); requests.push(body)
    assert.equal(req.headers.authorization,'Bearer offline-dummy-credential')
    const step=requests.length
    assert.ok(step<=(planning?8:7),'unexpected extra provider dispatch')
    if(planning && step===1){
      const context=body.messages.map(message=>message.content??'').join('\n')
      planDir=context.match(/每一步写一个 Markdown 文件到 ([^\n]+?)\/：/)?.[1]
      assert.ok(planDir?.startsWith(join(world.workspace,'.pae/')),'planner must publish its own isolated plan directory')
    }
    const scripted = planning ? [
      {name:'write',arguments:{file_path:join(planDir,'step-01-fee.md'),content:'# Atomic fee repair\nThis is a single atomic function change.\nGoal: implement the current 8% integer-cent rule in index.mjs.\nValidation: run serviceFee(10000) and expect 800.\n'}},
      {name:'submit_plan',arguments:{planDir,steps:[{file:'step-01-fee.md',title:'Fix the fee calculation'}],summary:'A single atomic function repair followed by a local test.'}},
      null,
      {name:'read',arguments:{file_path:'index.mjs'}},
      {name:'write',arguments:{file_path:'index.mjs',content:'export const serviceFee = amount => Math.round(amount * 0.08);\n'}},
      {name:'bash',arguments:{command:`node --input-type=module -e 'import { serviceFee } from "./index.mjs"; console.log(serviceFee(10000));'`,description:'Test the current fee rule'}},
      {name:'report_step',arguments:{status:'success',artifacts:['index.mjs'],summary:'Updated the atomic fee function and verified the local test.',exit_code:0}},
    ][step-1] : [
      { name:'bash', arguments:{command:'/bin/cat local.txt',description:'Read the synthetic local marker'} },
      { name:'read', arguments:{file_path:privateMarker} },
      { name:'read', arguments:{file_path:join(project,'tasks/cases.mjs')} },
      { name:'read', arguments:{file_path:'index.mjs'} },
      { name:'write', arguments:{file_path:'index.mjs',content:'export const serviceFee = amount => Math.round(amount * 0.08);\n'} },
      { name:'bash', arguments:{command:`node --input-type=module -e 'import { serviceFee } from "./index.mjs"; console.log(serviceFee(10000));'`,description:'Run the synthetic candidate'} },
    ][step-1]
    if(scripted) assert.ok(body.tools.some(tool=>tool.function.name===scripted.name),'native tool is advertised')
    const delta=scripted ? {role:'assistant',reasoning_content:'Synthetic offline tool probe.',tool_calls:[{index:0,id:`probe-${step}`,type:'function',function:{name:scripted.name,arguments:JSON.stringify(scripted.arguments)}}]} : {role:'assistant',content:'OFFLINE_INTEGRATION_COMPLETE'}
    const base={id:`offline-${step}`,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'deepseek-flash'}
    const chunks=[
      {...base,choices:[{index:0,delta,finish_reason:null}]},
      {...base,choices:[{index:0,delta:{},finish_reason:scripted?'tool_calls':'stop'}]},
      {...base,choices:[],usage:{prompt_tokens:100,prompt_cache_hit_tokens:80,prompt_cache_miss_tokens:20,completion_tokens:10,total_tokens:110}},
    ]
    res.writeHead(200,{'Content-Type':'text/event-stream','x-request-id':`offline-${step}`})
    res.end(chunks.map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join('')+'data: [DONE]\n\n')
  }catch(error){serverError??=error.message;res.writeHead(500);res.end('offline probe failed')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let broker
try{
  broker=await startOfflineBroker({root,trialId:'offline-native-tools',endpoint:`http://127.0.0.1:${server.address().port}/chat/completions`,durationMs:30000})
  const {result,report,verdict}=await evaluateIsolatedTrial({root,broker,recipe,taskId:'stale-fee',memorySnapshot:join(project,'state/snapshots/stale-fee/user.db'),memoryCache:join(project,'state/engram/models'),timeoutMs:25000,prompt:'Execute the offline integration probe.',beforeRun:async prepared=>{
    world=prepared
    await writeFile(join(world.workspace,'local.txt'),'SYNTHETIC_LOCAL_SUCCESS')
  }})
  await writeFile(join(root,'process.json'),JSON.stringify(result,null,2)+'\n')
  await writeFile(join(root,'requests.json'),JSON.stringify(requests,null,2)+'\n')
  console.log(JSON.stringify({root,status:result.status,reason:result.reason,dispatches:requests.length,serverError,stderr:result.stderr.slice(-2500)}))
  assert.equal(serverError,null)
  assert.equal(result.status,0,'jailed DSH completes')
  assert.match(result.stdout,/OFFLINE_INTEGRATION_COMPLETE/)
  assert.equal(requests.length,planning?8:7)
  if(memory){
    const context=requests[0].messages.map(message=>message.content??'').join('\n')
    assert.match(context,/<engram_memory_context/)
    assert.ok(context.includes('<current_user_request>\nExecute the offline integration probe.\n</current_user_request>'),'Engram attributes the actual human request')
  }
  const toolResults=requests.at(-1).messages.filter(message=>message.role==='tool')
  let planningPhase=null
  if(planning){
    const [session]=await readdir(join(world.workspace,'.pae'))
    planningPhase=JSON.parse(await readFile(join(world.workspace,'.pae',session,'orchestrator.json'),'utf8')).phase
    assert.equal(planningPhase,'completed')
    assert.ok(toolResults.some(result=>/800/.test(result.content)))
  }else{
    assert.equal(toolResults.length,6)
    assert.match(toolResults[0].content,/SYNTHETIC_LOCAL_SUCCESS/)
    for(const result of toolResults.slice(1,3)){
      assert.match(result.content,/EPERM|not permitted|permission|denied/i)
      assert.doesNotMatch(result.content,/SYNTHETIC_OTHER_TRIAL_SECRET|export const cases/)
    }
    assert.match(toolResults[5].content,/800/)
  }
  const ledger=JSON.parse(await readFile(join(root,'budget.json'),'utf8'))
  assert.equal(ledger.entries.length,requests.length)
  assert.ok(ledger.entries.every(entry=>entry.status==='metered'))
  assert.equal(await readFile(privateMarker,'utf8'),'SYNTHETIC_OTHER_TRIAL_SECRET')
  assert.equal(report.cases[0].status,'pass',JSON.stringify(report.cases[0]))
  assert.equal(report.cases[0].attempts,1)
  assert.ok(report.cases[0].events>0,'upstream evaluator collects real session events')
  assert.equal(verdict.pass,true,JSON.stringify(verdict))
  await writeFile(join(root,'acceptance.json'),JSON.stringify({offlineOnly:true,recipe,paidRequests:0,dispatches:requests.length,registeredTools:planning?['write','submit_plan','bash','report_step']:['bash','read','write'],crossTrialReadDenied:planning?null:true,judgeReadDenied:planning?null:true,meteredDispatches:ledger.entries.length,humanMemoryAttribution:memory?true:null,planningPhase,evaluatorStatus:report.cases[0].status,evaluatorEvents:report.cases[0].events,verdict},null,2)+'\n')
  console.log('Jailed DSH, registered native tools, broker transport and persistent metering passed offline.')
}finally{
  await broker?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
}
