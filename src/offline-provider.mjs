import { createServer } from 'node:http'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { recipe as getRecipe } from './recipes.mjs'

export const offlinePricing = () => ({ provider:'deepseek-official',model:'deepseek-flash',source:'https://example.invalid/offline-price',fxSource:'https://example.invalid/offline-fx',checkedAt:new Date().toISOString(),inputUsdPerMillion:.3,cacheHitUsdPerMillion:.006,outputUsdPerMillion:1.2,usdTwd:31.7 })

/** Installation check only. Canned answers never count as research observations. */
export async function startOfflineProvider({ recipe, responseDelayMs = 0, onRequest, memoryProbe } = {}) {
  const planning=getRecipe(recipe).planning
  if(!Number.isInteger(responseDelayMs)||responseDelayMs<0||responseDelayMs>2000)throw new Error('invalid offline response delay')
  if(memoryProbe && (!getRecipe(recipe).memory || !['save-search','search'].includes(memoryProbe.action) || !/^[a-z0-9-]{10,100}$/.test(memoryProbe.marker)))throw new Error('invalid synthetic memory probe')
  let workspace,planDir,error=null,primarySteps=0
  const requests=[]
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.authorization!=='Bearer offline-dummy-credential')throw new Error('offline credential required')
      let text='';for await(const chunk of req){text+=chunk;if(text.length>1024*1024)throw new Error('request too large')}
      const body=JSON.parse(text);requests.push(body)
      const dispatch=requests.length
      const auxiliary=!body.tools?.length
      if(auxiliary && (!memoryProbe || !body.messages.some(m=>m.role==='system' && m.content?.includes('检索查询改写为最多'))))throw new Error('unexpected auxiliary dispatch')
      const step=auxiliary?null:++primarySteps
      const memoryTools=memoryProbe?[...(memoryProbe.action==='save-search'?[{name:'engram_save',arguments:{content:memoryProbe.marker,kind:'fact',scope:'user',importance:1}}]:[]),{name:'engram_search',arguments:{query:memoryProbe.marker,scope:'user',limit:10}}]:[]
      if(!workspace||dispatch>12||step>(planning?8:4)+memoryTools.length)throw new Error('unexpected offline dispatch')
      if(planning&&step===1){
        planDir=body.messages.map(m=>m.content??'').join('\n').match(/每一步写一个 Markdown 文件到 ([^\n]+?)\/：/)?.[1]
        if(!planDir?.startsWith(join(workspace,'.pae/')))throw new Error('planner directory is outside this trial')
      }
      const fix=[
        {name:'read',arguments:{file_path:'index.mjs'}},
        {name:'write',arguments:{file_path:'index.mjs',content:'export const serviceFee = amount => Math.round(amount * 0.08);\n'}},
        {name:'bash',arguments:{command:`node --input-type=module -e 'import {serviceFee} from "./index.mjs"; console.log(serviceFee(10000));'`,description:'Verify the synthetic fee implementation'}},
      ]
      const sequence=planning?[
        {name:'write',arguments:{file_path:join(planDir,'step-01-fee.md'),content:'# Atomic fee repair\nA single indivisible function change.\nImplement the current 8% integer-cent rule in index.mjs, then test serviceFee(10000) === 800.\n'}},
        {name:'submit_plan',arguments:{planDir,steps:[{file:'step-01-fee.md',title:'Repair the fee function'}],summary:'A single atomic function repair and local test.'}},
        null,...memoryTools,...fix,
        {name:'report_step',arguments:{status:'success',artifacts:['index.mjs'],summary:'Synthetic function repair and local test completed.',exit_code:0}},
      ]:[...memoryTools,...fix]
      const tool=auxiliary?null:sequence[step-1]
      if(tool&&!body.tools?.some(item=>item.function?.name===tool.name))throw new Error('required native tool is not advertised')
      await onRequest?.({step:dispatch,primaryStep:step,auxiliary,body})
      if(responseDelayMs)await delay(responseDelayMs)
      if(res.destroyed)return
      const delta=tool?{role:'assistant',reasoning_content:'Synthetic installation check.',tool_calls:[{index:0,id:`offline-${dispatch}`,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.arguments)}}]}:{role:'assistant',content:auxiliary?JSON.stringify([memoryProbe.marker]):`OFFLINE_INTEGRATION_COMPLETE\nARCHITECTURE_LAB_RESULT=${planning&&step===3?'continue':'complete'}`}
      const base={id:`offline-${dispatch}`,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'deepseek-flash'}
      const chunks=[{...base,choices:[{index:0,delta,finish_reason:null}]},{...base,choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}]},{...base,choices:[],usage:{prompt_tokens:100,prompt_cache_hit_tokens:80,prompt_cache_miss_tokens:20,completion_tokens:10,total_tokens:110}}]
      res.writeHead(200,{'Content-Type':'text/event-stream','x-request-id':`offline-${dispatch}`})
      res.end(chunks.map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join('')+'data: [DONE]\n\n')
    }catch(cause){error??=cause.message;if(!res.destroyed){res.writeHead(500);res.end('offline check failed')}}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  return {
    endpoint:`http://127.0.0.1:${server.address().port}/chat/completions`,requests,
    setWorkspace:value=>{workspace=value},get error(){return error},
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))},
  }
}
