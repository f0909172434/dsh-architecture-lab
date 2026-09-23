import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link, realpath } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { importDailyProject, dailyHead, dailyRoot, dailyRegistry, readWorkspace, previewDailyResult, adoptDailyResult, exportDailyResult } from '../src/daily-workspace.mjs'
import { updateRegistry, readRegistry } from '../src/registry.mjs'
import { createDailyTask, createDailyCheck, runDailyTask } from '../src/daily-manager.mjs'
import { runManagedTrial } from '../src/manager.mjs'
import { completionInstructionFor } from '../src/completion-protocol.mjs'

const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
async function fixture(fn){const base=await realpath(await mkdtemp(join(tmpdir(),'lab-daily-'))),root=join(base,'state'),source=join(base,'input');await mkdir(root);await mkdir(source);try{await fn({base,root,source})}finally{await rm(base,{recursive:true,force:true})}}
async function addResult(root,item,files,{baseRunId=null,memory}={}){
  const runId=randomUUID(),directory=join(dailyRoot(root),'runs',runId,'world/workspace');await mkdir(directory,{recursive:true})
  for(const [name,contents] of Object.entries(files))await writeFile(join(directory,name),contents)
  if(memory){await mkdir(join(directory,'../memory'));await writeFile(join(directory,'../memory/user.db'),memory)}
  const tree=await readWorkspace(directory,{filter:'output'}),row={runId,projectId:item.id,baseRunId,status:'completed',cleanupVerified:true,inputManifest:item.initialFiles,
    outputManifest:tree.files.map(({path,sha256})=>({path,sha256})),memorySha256:memory?sha(memory):null,claimedCompletion:true}
  updateRegistry(dailyRoot(root),state=>state.runs.push(row));return row
}

test('import snapshots source and excludes credentials/caches without touching research or original files',()=>fixture(async({root,source})=>{
  await writeFile(join(source,'index.mjs'),'original');await writeFile(join(source,'.env'),'synthetic secret');await mkdir(join(source,'.git'));await writeFile(join(source,'.git/config'),'synthetic metadata')
  const item=await importDailyProject(root,{source,label:'Demo'})
  assert.deepEqual(item.initialFiles.map(f=>f.path),['index.mjs']);assert.ok(item.skipped.includes('.env'))
  const head=await dailyHead(root,item.id);assert.equal(await readFile(join(head.workspace,'index.mjs'),'utf8'),'original')
  await writeFile(join(source,'index.mjs'),'external later edit')
  assert.equal(await readFile(join(head.workspace,'index.mjs'),'utf8'),'original');assert.equal(readRegistry(root).runs.length,0)
  const blank=await importDailyProject(root,{source:'',label:'Blank'});assert.equal(blank.initialFiles.length,0)
  await writeFile(join(head.workspace,'index.mjs'),'tampered snapshot');await assert.rejects(dailyHead(root,item.id),/初始副本已改變/)
}))

test('import rejects broad/private roots, links and excessive file sizes',()=>fixture(async({root,source})=>{
  for(const directory of [homedir(),root])await assert.rejects(importDailyProject(root,{source:directory,label:'No'}),/單一工作專案/)
  await writeFile(join(source,'file'),'a');await symlink(join(source,'file'),join(source,'linked'))
  await assert.rejects(importDailyProject(root,{source,label:'No'}),/符號連結/);await rm(join(source,'linked'))
  await link(join(source,'file'),join(source,'hard'));await assert.rejects(importDailyProject(root,{source,label:'No'}),/硬連結/)
  await rm(join(source,'hard'));await writeFile(join(source,'large'),Buffer.alloc(8*1024*1024+1));await assert.rejects(importDailyProject(root,{source,label:'No'}),/限制/)
}))

test('preview and adoption preserve originals, reject stale branches, and export only into a new folder',()=>fixture(async({root,source,base})=>{
  await writeFile(join(source,'index.mjs'),'old');await writeFile(join(source,'remove.txt'),'old note')
  const item=await importDailyProject(root,{source,label:'Demo'}),first=await addResult(root,item,{'index.mjs':'new','added.md':'new note'})
  const preview=await previewDailyResult(root,first.runId)
  assert.deepEqual(preview.changes.map(row=>[row.path,row.kind]),[['added.md','added'],['index.mjs','modified'],['remove.txt','deleted']]);assert.equal(preview.validatedCorrectness,false)
  const stale=await addResult(root,item,{'index.mjs':'stale'})
  await adoptDailyResult(root,first.runId);await assert.rejects(adoptDailyResult(root,stale.runId),/較新的成果/)
  assert.equal(await readFile(join(source,'index.mjs'),'utf8'),'old')
  const destination=join(base,'export');await exportDailyResult(root,first.runId,destination)
  assert.equal(await readFile(join(destination,'index.mjs'),'utf8'),'new')
  await assert.rejects(exportDailyResult(root,first.runId,destination),error=>error.code==='EEXIST')
  assert.equal(await readFile(join(destination,'index.mjs'),'utf8'),'new')
}))

test('project memory survives a non-memory recipe and never crosses project identities',()=>fixture(async({root,source})=>{
  await writeFile(join(source,'index.mjs'),'old')
  const item=await importDailyProject(root,{source,label:'First'}),other=await importDailyProject(root,{source,label:'Other'})
  const remembered=await addResult(root,item,{'index.mjs':'B result'},{memory:'synthetic opaque memory bytes'});await adoptDailyResult(root,remembered.runId)
  const plain=await addResult(root,item,{'index.mjs':'A result'},{baseRunId:remembered.runId});await adoptDailyResult(root,plain.runId)
  const head=await dailyHead(root,item.id);assert.match(head.memorySnapshot,new RegExp(remembered.runId))
  assert.equal((await dailyHead(root,other.id)).memorySnapshot,null)
  await writeFile(head.memorySnapshot,'tampered');await assert.rejects(dailyHead(root,item.id),/記憶已改變/)
}))

test('user task drafts never pretend to run on the scripted provider and live starts remain held',()=>fixture(async({root,source})=>{
  await writeFile(join(source,'note.md'),'hello');const item=await importDailyProject(root,{source,label:'Notes'})
  const job=createDailyTask(root,{projectId:item.id,recipe:'D',prompt:'整理這份筆記並補上說明。'})
  assert.equal(job.kind,'user-task');assert.equal(dailyRegistry(root).jobs.length,1)
  await assert.rejects(runDailyTask({root,jobId:job.id,mode:'offline'}),/一般使用者任務/)
  await assert.rejects(runDailyTask({root,jobId:job.id,mode:'live'}),/日常付費任務暫停/)
  assert.equal(dailyRegistry(root).runs.length,0);assert.equal(readRegistry(root).runs.length,0)
  assert.match(completionInstructionFor('daily'),/no benchmark judge/)
  assert.match(completionInstructionFor('research'),/external test independently/)
  assert.throws(()=>completionInstructionFor('unknown'))
}))

test('daily and research starts reject the other active or uncertain-cleanup controller',()=>fixture(async({root})=>{
  const job=await createDailyCheck(root,'A')
  updateRegistry(root,state=>{state.active={runId:'research'}})
  await assert.rejects(runDailyTask({root,jobId:job.id,mode:'offline'}),/研究試驗/)
  assert.equal(dailyRegistry(root).runs.length,0)
  updateRegistry(root,state=>{state.active=null;state.runs.push({runId:'research',cleanupVerified:false})})
  await assert.rejects(runDailyTask({root,jobId:job.id,mode:'offline'}),/研究試驗與程序清理/)
  updateRegistry(root,state=>{state.runs=[]})
  updateRegistry(dailyRoot(root),state=>{state.active={runId:'daily'}})
  await assert.rejects(runManagedTrial({root,mode:'offline'}),/日常任務與程序清理/)
  updateRegistry(dailyRoot(root),state=>{state.active=null;state.runs.push({cleanupVerified:false})})
  await assert.rejects(runManagedTrial({root,mode:'offline'}),/日常任務與程序清理/)
  assert.equal(readRegistry(root).runs.length,0)
}))

test('expired daily tasks cannot reset the cumulative wall-clock allowance on resume',()=>fixture(async({root})=>{
  const job=await createDailyCheck(root,'A')
  updateRegistry(dailyRoot(root),state=>{
    state.jobs[0].firstStartedAt=new Date(Date.now()-600001).toISOString()
    state.runs.push({runId:randomUUID(),jobId:job.id,status:'interrupted',mode:'offline',cleanupVerified:true})
  })
  await assert.rejects(runDailyTask({root,jobId:job.id,mode:'offline',resume:true}),/10 分鐘已用完/)
  assert.equal(dailyRegistry(root).runs.length,1)
}))

test('resumed output review includes changes saved by earlier attempts',()=>fixture(async({root,source})=>{
  await writeFile(join(source,'index.mjs'),'original')
  const item=await importDailyProject(root,{source,label:'Review'}),row=await addResult(root,item,{'index.mjs':'partial work retained by resume'})
  updateRegistry(dailyRoot(root),state=>{
    const result=state.runs.find(r=>r.runId===row.runId)
    result.reviewManifest=item.initialFiles
    result.inputManifest=result.outputManifest
  })
  const preview=await previewDailyResult(root,row.runId)
  assert.equal(preview.changes.length,1);assert.equal(preview.changes[0].kind,'modified')
}))
