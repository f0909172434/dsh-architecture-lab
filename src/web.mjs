import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, open, realpath, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, sep } from 'node:path'
import { project, harness } from './runtime.mjs'
import { verifyDependencyBuild } from './dependency-build.mjs'
import { chooseRecipe, recoverRegistry, stopManagedRun } from './manager.mjs'
import { managedReport } from './managed-report.mjs'
import { recipe } from './recipes.mjs'
import { tasks, task } from '../tasks/catalog.mjs'
import { assertLiveReady, liveBlockers } from './readiness.mjs'
import { committedTwd } from './broker/accounting.mjs'

const prefix='/api/architecture-lab'
const staticFiles=new Map([['/architecture-lab','index.html'],['/architecture-lab/app.mjs','app.mjs'],['/architecture-lab/style.css','style.css']])
const types={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}

function originFor(req,port){
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw new Error('local access required')
  if(![`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`].includes(req.headers.host))throw new Error('invalid host')
  if(req.headers['sec-fetch-site']==='cross-site')throw new Error('cross-site access rejected')
  return `http://${req.headers.host}`
}
function authorize(req,token,origin){
  const supplied=Buffer.from(req.headers['x-architecture-lab-token']??''),expected=Buffer.from(token)
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new Error('invalid page capability')
  if(req.method==='POST' && req.headers.origin!==origin)throw new Error('same-origin request required')
}
async function body(req){
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new Error('JSON required')
  let text=''
  for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw new Error('request too large')}
  const value=JSON.parse(text)
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid action')
  return value
}

export async function budgetView(root){
  try{
    const ledger=JSON.parse(await readFile(join(root,'budget.json'),'utf8'))
    const committed=committedTwd(ledger)
    const unknown=ledger.entries.filter(e=>e.accountingVersion!==2||e.status!=='metered').length
    return {capTwd:300,committedTwd:committed,availableTwd:Math.max(0,300-committed),unknownRequests:unknown,estimatedMeteredTwd:ledger.entries.filter(e=>e.accountingVersion===2&&e.status==='metered').reduce((n,e)=>n+e.actualTwd,0),invoiceTotalTwd:null}
  }catch(error){if(error.code==='ENOENT')return {capTwd:300,committedTwd:0,availableTwd:300,unknownRequests:0,estimatedMeteredTwd:0,invoiceTotalTwd:null};return {capTwd:300,committedTwd:null,availableTwd:null,unknownRequests:null,estimatedMeteredTwd:null,invoiceTotalTwd:null,error:'費用帳本無法讀取；付費實驗保持停用。'}}
}

async function recipeAvailability(root){
  let common=null
  try{
    await harness();await access(join(project,'upstream/dsh-eval-harness/lib/runner.js'))
    if(process.platform!=='darwin')throw new Error('尚未驗收此系統的執行後端')
  }catch{common='尚未完成隔離執行環境安裝或驗收'}
  let memory=null,planning=null
  if(!common){
    try{await verifyDependencyBuild('engram');await access(join(root,'snapshots/stale-fee/user.db'))}catch{memory='記憶插件建置或初始快照尚未就緒'}
    try{await verifyDependencyBuild('planner')}catch{planning='規劃插件建置尚未就緒'}
  }
  return Object.fromEntries(['A','B','C','D'].map(id=>{const config=recipe(id),reason=common||(config.memory&&memory)||(config.planning&&planning)||null;return [id,{available:!reason,reason}]}))
}

export async function labAction(root,input,launch){
  if(!['select','check','resume-check','start','resume','batch','stop'].includes(input.action))throw new Error('unknown action')
  if(['start','resume','batch'].includes(input.action))assertLiveReady()
  if(input.action==='stop')return stopManagedRun(root)
  if(input.action==='batch')return launch(['run-batch'])
  recipe(input.recipe)
  if(input.action==='select')return {selectedRecipe:chooseRecipe(root,input.recipe)}
  const n=input.repetition
  if(!Number.isInteger(n)||n<1||n>3)throw new Error('次數須為 1、2 或 3')
  if(input.action==='check'||input.action==='resume-check')return launch([input.action==='check'?'check-one':'resume-check',input.recipe,String(n)])
  task(input.taskId)
  return launch([input.action==='start'?'run-one':'resume-one',input.taskId,String(n),input.recipe])
}

async function evidence(root,runId,kind){
  if(!/^[a-f0-9-]{36}$/.test(runId??''))throw new Error('invalid run')
  const files={record:'record.json',outcome:'outcome.json',upstream:'evaluation/report.json',process:'process.json'}
  if(!Object.hasOwn(files,kind))throw new Error('invalid evidence kind')
  const base=await realpath(join(root,'v2/runs',runId)),path=await realpath(join(base,files[kind]))
  const runsRoot=await realpath(join(root,'v2/runs'))
  if(!base.startsWith(runsRoot+sep)||!path.startsWith(base+sep))throw new Error('invalid evidence location')
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try{const info=await handle.stat();if(!info.isFile()||info.size>2*1024*1024)throw new Error('evidence too large');return JSON.parse(await handle.readFile('utf8'))}
  finally{await handle.close()}
}

export function createLabWebHandler({root,port,launch,token=randomBytes(32).toString('hex')}){
  let availability,checkedAt=0
  return async(req,res)=>{
    let origin
    try{origin=originFor(req,port)}catch(error){return json(res,403,{error:error.message})}
    const url=new URL(req.url,origin)
    try{
      if(staticFiles.has(url.pathname)){
        if(req.method!=='GET')return json(res,405,{error:'GET required'})
        const name=staticFiles.get(url.pathname)
        let content=await readFile(join(project,'client',name),'utf8')
        if(name==='index.html')content=content.replace('__LAB_TOKEN__',token)
        res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"})
        res.end(content);return
      }
      if(!url.pathname.startsWith(prefix+'/'))return json(res,404,{error:'not found'})
      try{authorize(req,token,origin)}catch(error){return json(res,403,{error:error.message})}
      if(req.method==='GET'&&url.pathname===prefix+'/state'){
        const state=await recoverRegistry(root),report=await managedReport(root)
        if(!availability||Date.now()-checkedAt>30000){availability=await recipeAvailability(root);checkedAt=Date.now()}
        return json(res,200,{...report,attention:state.attention??null,budget:await budgetView(root),tasks,availability,liveReady:liveBlockers.length===0})
      }
      if(req.method==='GET'&&url.pathname===prefix+'/report')return json(res,200,await managedReport(root))
      if(req.method==='GET'&&url.pathname===prefix+'/evidence')return json(res,200,await evidence(root,url.searchParams.get('runId'),url.searchParams.get('kind')))
      if(req.method==='POST'&&url.pathname===prefix+'/action')return json(res,200,await labAction(root,await body(req),launch))
      return json(res,404,{error:'not found'})
    }catch(error){return json(res,400,{error:error.code==='ENOENT'?'證據尚未產生。':error.message})}
  }
}

export function registerLabWeb(ctx,{root,launch}){
  const handler=createLabWebHandler({root,launch,port:ctx.webServer.port})
  for(const path of ['/architecture-lab',prefix])ctx.effect(()=>ctx.webServer.register({kind:'prefix',path,handler}),`architecture-lab route ${path}`)
}
