import { spawn } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from './runtime.mjs'
import { recipe, recipes } from './recipes.mjs'
import { readRegistry } from './registry.mjs'
import { chooseRecipe, recoverRegistry, stopManagedRun } from './manager.mjs'
import { managedReport, exportManagedReport } from './managed-report.mjs'
import { assertLiveReady, liveBlockers } from './readiness.mjs'
import { task } from '../tasks/catalog.mjs'

export const name='dsh-architecture-lab'
export const inject=[]
const labRoot=process.env.DSH_ARCH_LAB_ROOT??join(project,'state')

async function launch(args){
  const logDir=join(labRoot,'v2','launches');await mkdir(logDir,{recursive:true,mode:0o700})
  const path=join(logDir,`${Date.now()}-${process.pid}.log`),log=await open(path,'ax',0o600)
  try{
    const child=spawn(process.execPath,[join(project,'src/cli.mjs'),...args],{cwd:project,env:{PATH:process.env.PATH,HOME:process.env.HOME,DSH_ARCH_LAB_ROOT:labRoot},stdio:['ignore',log.fd,log.fd],detached:true})
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
    child.unref()
    return {kind:'success',text:`已送出${args[0].includes('check')?'離線安裝驗證':'實驗'}；請用 /architecture-lab status 查看結果。日誌：${path}`}
  }finally{await log.close()}
}

export function apply(ctx){
  // Management sessions never route through the trial broker. Keep every model
  // invocation held; headless slash-looking positional text is also a prompt.
  ctx.on('llm/stream',()=>{throw new Error('實機試驗暫停：管理會話不允許直接呼叫模型；請由實驗室入口啟動受預算保護的獨立試驗。')},{global:true})
  ctx.inject(['commands'],({commands})=>commands.register({
    name:'architecture-lab',
    description:'架構實驗室：選配方、離線驗證、執行控制與證據報告',
    input:{hint:'status | select A/B/C/D | check/resume-check [配方] [次數] | start/resume <配方> <題目> <次數> | batch | stop | report | export <路徑>'},
    handler:async({rawInput})=>{
      try{
        const [action='status',arg,arg2,arg3]=rawInput.trim().split(/\s+/)
        if(['start','resume','batch'].includes(action))assertLiveReady()
        if(action==='status'||!action){
          const state=await recoverRegistry(labRoot)
          return {kind:'success',text:`目前配方：${state.selectedRecipe} ${recipe(state.selectedRecipe).label}\n${Object.entries(recipes).map(([id,row])=>`${id} ${row.label}`).join('\n')}\n執行紀錄：${state.runs.length}；執行狀態：${state.active?'執行中':'未執行'}\n${state.attention??''}\n${liveBlockers.length?`實機試驗暫停：${liveBlockers.join('；')}`:'實機試驗就緒'}`}
        }
        if(action==='select'){
          chooseRecipe(labRoot,arg)
          return {kind:'success',text:`已選擇 ${arg} ${recipe(arg).label}。下一次實驗會建立對應的獨立環境；日常 DSH 會話仍須重新開啟對應 profile。`}
        }
        if(action==='report')return {kind:'success',text:JSON.stringify(await managedReport(labRoot),null,2)}
        if(action==='export'){
          const tail=rawInput.trim().slice('export'.length).trim()
          if(!tail)throw new Error('請提供匯出路徑')
          const path=tail.startsWith('"')?JSON.parse(tail):tail
          await exportManagedReport(labRoot,path)
          return {kind:'success',text:`報告已匯出：${path}`}
        }
        if(action==='stop')return {kind:'success',text:JSON.stringify(await stopManagedRun(labRoot))}
        if(action==='check'||action==='resume-check'){
          const selected=arg??readRegistry(labRoot).selectedRecipe;recipe(selected)
          const n=Number(arg2??1);if(!Number.isInteger(n)||n<1||n>3)throw new Error('次數須為 1、2 或 3')
          return await launch([action==='check'?'check-one':'resume-check',selected,String(n)])
        }
        if(action==='start'||action==='resume'){
          recipe(arg);task(arg2)
          const n=Number(arg3);if(!Number.isInteger(n)||n<1||n>3)throw new Error('次數須為 1、2 或 3')
          return await launch([action==='start'?'run-one':'resume-one',arg2,String(n),arg])
        }
        if(action==='batch')return await launch(['run-batch'])
        throw new Error('可用操作：status、select、check、resume-check、start、resume、batch、stop、report、export')
      }catch(error){return {kind:'error',text:error.message}}
    },
  }))
}
