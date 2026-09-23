import { randomUUID, createHash } from 'node:crypto'
import { mkdir, lstat, readdir, realpath, open, writeFile, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { homedir } from 'node:os'
import { project } from './runtime.mjs'
import { readRegistry, updateRegistry, visibleRegistry } from './registry.mjs'

export const dailyRoot=root=>join(root,'daily')
export const dailyRegistry=root=>visibleRegistry(readRegistry(dailyRoot(root)))
export const validDailyId=id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const ignored=new Set(['.git','.pae','node_modules','.venv','venv','__pycache__','.DS_Store','.dsh','.codex','.ssh','.aws','.npm','dist','build','.next','coverage','.public-export','upstream','vendor','.credentials.yaml'])
const outputIgnored=new Set(['.git','.pae','node_modules','__pycache__','.DS_Store'])
const exclude=name=>ignored.has(name)||name==='.env'||name.startsWith('.env.')||/^credentials(?:\.|$)/i.test(name)||/^(?:id_rsa|id_ed25519)(?:\.|$)/.test(name)||/\.(?:pem|key)$/i.test(name)
const limits={files:1024,total:24*1024*1024,file:8*1024*1024}

export async function readWorkspace(directory,{filter='import'}={}){
  const base=await realpath(directory),files=[],skipped=[];let total=0,visited=0
  async function walk(relative=''){
    if(relative.split('/').length>32||!(await realpath(join(base,relative))).startsWith(base+(relative?sep:'')))throw new Error('資料夾過深或已改變')
    for(const entry of (await readdir(join(base,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const path=relative?relative+'/'+entry.name:entry.name
      if(++visited>8192)throw new Error('資料夾項目過多，請縮小工作範圍')
      if((filter==='import'&&(exclude(entry.name)||(base===resolve(project)&&entry.name==='state')))||(filter==='output'&&outputIgnored.has(entry.name))){skipped.push(path);continue}
      if(entry.name.includes('\\')||/[\x00-\x1f]/.test(entry.name))throw new Error('檔案名稱含不支援字元')
      const source=join(base,path),meta=await lstat(source)
      if(meta.isSymbolicLink()||(!meta.isFile()&&!meta.isDirectory()))throw new Error('資料夾包含符號連結或特殊檔案，請先整理為一般檔案')
      if(meta.isDirectory()){await walk(path);continue}
      if(meta.nlink!==1||meta.size>limits.file||files.length>=limits.files)throw new Error('資料夾超過可匯入限制，或包含硬連結')
      if(!(await realpath(source)).startsWith(base+sep))throw new Error('檔案位於所選資料夾之外')
      const fd=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
      let bytes
      try{
        const current=await fd.stat();if(!current.isFile()||current.ino!==meta.ino||current.dev!==meta.dev||current.size>limits.file)throw new Error('讀取時檔案已改變')
        const buffer=Buffer.alloc(current.size+1);let count=0
        while(count<buffer.length){const next=await fd.read(buffer,count,buffer.length-count,count);if(!next.bytesRead)break;count+=next.bytesRead}
        if(count!==current.size||(await fd.stat()).mtimeMs!==current.mtimeMs)throw new Error('讀取時檔案已改變')
        bytes=Buffer.from(buffer.subarray(0,count))
      }
      finally{await fd.close()}
      total+=bytes.length
      if(bytes.length>limits.file||total>limits.total)throw new Error('資料夾超過 24 MiB，請選擇較小的工作範圍')
      files.push({path,bytes,sha256:hash(bytes)})
    }
  }
  await walk()
  return {base,files,skipped,total}
}

async function writeSnapshot(destination,files){
  await mkdir(destination,{recursive:false,mode:0o700})
  for(const file of files){await mkdir(dirname(join(destination,file.path)),{recursive:true,mode:0o700});await writeFile(join(destination,file.path),file.bytes,{flag:'wx',mode:0o600})}
}

export async function importDailyProject(root,{source,label}){
  if(typeof source!=='string'||typeof label!=='string'||!label.trim()||label.length>120)throw new Error('請提供專案名稱與資料夾；留空資料夾可建立空白專案')
  const base=source.trim()?await realpath(resolve(source)):null
  const broad=['/',homedir(),...['Documents','Desktop','Downloads','Library'].map(name=>join(homedir(),name))]
  const privateRoots=await Promise.all([join(project,'state'),join(homedir(),'.dsh'),join(homedir(),'.codex'),root].map(async path=>{try{return await realpath(path)}catch{return resolve(path)}}))
  if(base&&(broad.includes(base)||privateRoots.some(path=>base===resolve(path)||base.startsWith(resolve(path)+sep))))throw new Error('請選擇單一工作專案，不可匯入整個家目錄或私人執行資料')
  const tree=base?await readWorkspace(base):{files:[],skipped:[]}
  const id=randomUUID(),directory=join(dailyRoot(root),'projects',id)
  await mkdir(directory,{recursive:true,mode:0o700})
  await writeSnapshot(join(directory,'initial'),tree.files)
  const item={id,label:label.trim(),source:base,createdAt:new Date().toISOString(),headRunId:null,memoryRunId:null,
    initialFiles:tree.files.map(({path,sha256,bytes})=>({path,sha256,size:bytes.length})),skipped:tree.skipped}
  await writeFile(join(directory,'project.json'),JSON.stringify(item,null,2)+'\n',{flag:'wx',mode:0o600})
  updateRegistry(dailyRoot(root),state=>{state.projects??=[];state.projects.push(item);state.selectedProject=id})
  return item
}

export function getDailyProject(root,id){
  if(!validDailyId(id))throw new Error('invalid daily project')
  const item=dailyRegistry(root).projects?.find(row=>row.id===id)
  if(!item)throw new Error('找不到日常專案')
  return item
}

export function dailyWorldPath(root,row){
  if(!validDailyId(row.runId)||!['world','recovered-world'].includes(row.worldDirectory??'world'))throw new Error('invalid daily workspace identity')
  return join(dailyRoot(root),'runs',row.runId,row.worldDirectory??'world')
}

export async function dailyHead(root,id){
  const item=getDailyProject(root,id)
  if(!item.headRunId){
    const workspace=join(dailyRoot(root),'projects',id,'initial'),tree=await readWorkspace(workspace,{filter:false})
    if(JSON.stringify(tree.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(item.initialFiles.map(({path,sha256})=>({path,sha256}))))throw new Error('初始副本已改變，請重新匯入專案')
    return {workspace,memorySnapshot:null,headRunId:null}
  }
  const run=dailyRegistry(root).runs.find(row=>row.runId===item.headRunId&&row.projectId===id)
  if(!run||run.status!=='completed'||!run.cleanupVerified||!run.outputManifest)throw new Error('專案成果尚未完成驗證')
  const workspace=join(dailyWorldPath(root,run),'workspace')
  const current=await readWorkspace(workspace,{filter:'output'})
  if(JSON.stringify(current.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(run.outputManifest))throw new Error('已採用的成果檔案發生變動')
  const memoryRun=dailyRegistry(root).runs.find(row=>row.runId===item.memoryRunId&&row.projectId===id)
  if(item.memoryRunId&&!memoryRun?.memorySha256)throw new Error('專案記憶來源不完整')
  const memory=memoryRun?join(dailyWorldPath(root,memoryRun),'memory/user.db'):null
  if(memory&&hash(await readFile(memory))!==memoryRun.memorySha256)throw new Error('專案記憶已改變')
  return {workspace,memorySnapshot:memory,headRunId:run.runId}
}

export async function copyDailyWorkspace(source,destination){
  const tree=await readWorkspace(source,{filter:'output'})
  await writeSnapshot(destination,tree.files)
  return tree.files.map(({path,sha256})=>({path,sha256}))
}

export async function previewDailyResult(root,runId){
  if(!validDailyId(runId))throw new Error('invalid daily run')
  const row=dailyRegistry(root).runs.find(run=>run.runId===runId)
  if(!row?.outputManifest||!row.cleanupVerified)throw new Error('成果尚未安全保存')
  const workspace=join(dailyWorldPath(root,row),'workspace'),tree=await readWorkspace(workspace,{filter:'output'})
  if(JSON.stringify(tree.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(row.outputManifest))throw new Error('成果檔案已變動')
  const before=new Map((row.reviewManifest??row.inputManifest).map(file=>[file.path,file])),after=new Map(tree.files.map(file=>[file.path,file]))
  const changes=[]
  for(const path of [...new Set([...before.keys(),...after.keys()])].sort()){
    const old=before.get(path),next=after.get(path)
    if(old?.sha256===next?.sha256)continue
    const binary=next&&next.bytes.includes(0),content=next&&!binary?next.bytes.subarray(0,65536).toString('utf8'):null
    changes.push({path,kind:!old?'added':!next?'deleted':'modified',size:next?.bytes.length??0,content,binary:!!binary,truncated:(next?.bytes.length??0)>65536})
  }
  return {runId,projectId:row.projectId,changes,files:tree.files.length,claimedCompletion:row.claimedCompletion,validatedCorrectness:false}
}

export async function adoptDailyResult(root,runId){
  await previewDailyResult(root,runId)
  updateRegistry(dailyRoot(root),state=>{
    if(state.active)throw new Error('請先停止日常任務再採用成果')
    const row=state.runs.find(item=>item.runId===runId),item=state.projects?.find(item=>item.id===row?.projectId)
    if(!item||row.status!=='completed'||!row.cleanupVerified)throw new Error('只能採用已完成並清理的成果')
    if(item.headRunId!==row.baseRunId)throw new Error('專案已有較新的成果；請保留分支並重新執行任務')
    item.headRunId=runId
    if(row.memorySha256)item.memoryRunId=runId
  })
  return {adopted:runId}
}

export async function exportDailyResult(root,runId,destination){
  await previewDailyResult(root,runId)
  if(typeof destination!=='string'||!destination.trim())throw new Error('請提供新的匯出資料夾')
  const requested=resolve(destination),parent=await realpath(dirname(requested)),target=join(parent,requested.split(sep).at(-1))
  const row=dailyRegistry(root).runs.find(item=>item.runId===runId)
  const tree=await readWorkspace(join(dailyWorldPath(root,row),'workspace'),{filter:'output'})
  await writeSnapshot(target,tree.files)
  return {directory:target,files:tree.files.length}
}
