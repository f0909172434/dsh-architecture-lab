import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { project } from '../src/runtime.mjs'
import { linuxRuntime } from '../src/linux-runtime.mjs'
import { openLinuxBridge } from '../src/linux-bridge.mjs'
import { runLinuxProcess } from '../src/linux-process.mjs'
import { startOfflineBroker } from '../src/broker/server.mjs'
import { offlinePricing } from '../src/offline-provider.mjs'

const root=await mkdtemp(join(project,'state/linux-bridge-'))
await writeFile(join(root,'pricing.json'),JSON.stringify(offlinePricing())+'\n')
let calls=0,authValid=true,bridge,broker
const provider=createServer(async(req,res)=>{
  authValid&&=req.headers.authorization==='Bearer offline-dummy-credential'
  for await(const _ of req){}
  calls++
  res.writeHead(200,{'Content-Type':'text/event-stream'})
  res.end(`data: ${JSON.stringify({choices:[{delta:{content:'offline bridge fixture'}}],usage:{prompt_tokens:100,prompt_cache_hit_tokens:80,prompt_cache_miss_tokens:20,completion_tokens:10,total_tokens:110}})}\n\ndata: [DONE]\n\n`)
})
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve))
try{
  broker=await startOfflineBroker({root,trialId:'container-bridge',endpoint:`http://127.0.0.1:${provider.address().port}/chat/completions`})
  const runtime=await linuxRuntime(),runId=randomUUID()
  const image=JSON.parse(runtime.guest(['sudo','docker','image','inspect',runtime.config.probeImage]))[0].Id
  bridge=await openLinuxBridge({runId,port:broker.port})
  const source=`const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
    const body={model:'deepseek-flash',reasoning_effort:'high',thinking:{type:'enabled'},max_tokens:16,stream:true,stream_options:{include_usage:true},messages:[{role:'user',content:'offline bridge fixture'}]};
    const post=(path,token,payload)=>new Promise((resolve,reject)=>{const req=http.request({socketPath:'/broker.sock',path,method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode,data}))});req.on('error',reject);req.end(JSON.stringify(payload))});
    (async()=>{
      assert.deepEqual(Object.keys(require('node:os').networkInterfaces()),['lo']);
      assert.equal(fs.existsSync('/run/dsh-architecture-bridges'),false);
      const token=process.env.DEEPSEEK_API_KEY;
      assert.equal((await post('/chat/completions','wrong',body)).status,401);
      assert.equal((await post('/models',token,body)).status,404);
      assert.equal((await post('/chat/completions',token,{...body,model:'other'})).status,400);
      for(let n=0;n<12;n++){const r=await post('/chat/completions',token,body);assert.equal(r.status,200);assert.match(r.data,/offline bridge fixture/)}
      assert.equal((await post('/chat/completions',token,body)).status,502);
      console.log(JSON.stringify({validDispatches:12,wrongTokenRejected:true,unknownRouteRejected:true,unpricedModelRejected:true,thirteenthRequestRejected:true,networkInterfaces:['lo']}));
    })().catch(error=>{console.error(error);process.exit(1)});`
  const result=await runLinuxProcess({runId,image,brokerBridge:true,timeoutMs:30_000,command:['node','-e',source],env:{DEEPSEEK_API_KEY:broker.token}})
  await writeFile(join(root,'process.json'),JSON.stringify(result,null,2)+'\n')
  assert.equal(result.status,0,result.stderr)
  assert.equal(result.cleanupVerified,true)
  assert.equal(calls,12);assert.equal(authValid,true)
  const ledger=JSON.parse(await readFile(join(root,'budget.json'),'utf8'))
  assert.equal(ledger.entries.length,12)
  assert.ok(ledger.entries.every(entry=>entry.status==='metered'))
  await bridge.close();bridge=null
  const detachedRun=randomUUID()
  const workerSource=`import{openLinuxBridge}from ${JSON.stringify(new URL('../src/linux-bridge.mjs',import.meta.url).href)};const bridge=await openLinuxBridge({runId:${JSON.stringify(detachedRun)},port:${broker.port}});console.log(JSON.stringify({sshPid:bridge.child.pid}));`
  const worker=spawn(process.execPath,['--input-type=module','-e',workerSource],{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['ignore','pipe','pipe']})
  const workerDone=once(worker,'close')
  let workerOutput='';worker.stdout.on('data',chunk=>workerOutput+=chunk)
  worker.stderr.resume()
  try{
    const deadline=Date.now()+10_000
    while(!workerOutput.includes('\n')){if(Date.now()>deadline||worker.exitCode!==null)throw new Error('bridge worker did not start');await delay(100)}
    const {sshPid}=JSON.parse(workerOutput.trim())
    worker.kill('SIGKILL');await workerDone
    let closed=false
    const closeDeadline=Date.now()+10_000
    while(Date.now()<closeDeadline){
      try{
        runtime.guest(['test','!','-e',`/run/dsh-architecture-bridges/${detachedRun}/broker.sock`],{stdio:['pipe','pipe','pipe']})
        try{process.kill(sshPid,0)}catch(error){if(error.code==='ESRCH'){closed=true;break}throw error}
      }catch{}
      await delay(200)
    }
    assert.equal(closed,true,'both the reverse socket and SSH helper must exit after controller SIGKILL')
  }finally{if(worker.exitCode===null&&worker.signalCode===null)worker.kill('SIGTERM')}
  const evidence={createdAt:new Date().toISOString(),passed:true,paidRequests:0,cleanupVerified:true,socketRemoved:true,bridgeControllerDeathCleanup:true,providerDispatches:calls,meteredEntries:ledger.entries.length,...JSON.parse(result.stdout),limitations:['Native DSH execution through the relay is a separate integration gate.']}
  await writeFile(join(root,'acceptance.json'),JSON.stringify(evidence,null,2)+'\n')
  console.log(JSON.stringify(evidence));console.log(root)
}finally{
  await bridge?.close();await broker?.close();provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve))
}
