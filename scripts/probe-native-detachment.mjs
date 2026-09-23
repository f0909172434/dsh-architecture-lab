// A bounded negative diagnostic: never treated as accepted containment.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { project } from '../src/runtime.mjs'
import { runIsolatedProcess } from '../src/isolation/process.mjs'
const root=await mkdtemp(join(project,'state/native-detachment-')),file=join(root,'detached.mjs')
await writeFile(file,`import{spawn}from'node:child_process';const c=spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{detached:true,stdio:'ignore'});console.log(c.pid);c.unref();`)
const result=await runIsolatedProcess({args:[file],cwd:root,readOnly:[root],timeoutMs:5000})
assert.equal(result.status,0,result.stderr)
const pid=Number(result.stdout.trim());assert.ok(Number.isInteger(pid)&&pid>0)
const stat=spawnSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).stdout.trim()
let stopped=false
if(stat&&!stat.startsWith('Z')){try{process.kill(pid,'SIGKILL');stopped=true}catch(error){if(error.code!=='ESRCH')throw error}}
const facts={nativeContainmentAccepted:false,normalParentExit:true,detachedChildSurvived:!!stat&&!stat.startsWith('Z'),probeChildExplicitlyStopped:stopped,childNaturalDeadlineMs:4000,paidRequests:0}
await writeFile(join(root,'acceptance.json'),JSON.stringify(facts,null,2)+'\n')
console.log(JSON.stringify({root,...facts}))
