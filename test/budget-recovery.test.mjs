import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { withLedger } from '../src/budget.mjs'

test('process death releases the budget writer lock without erasing durable reservations',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lab-budget-death-'))
  const old={capTwd:300,entries:[{id:'synthetic-unknown',trialId:'prior',reservedTwd:5,status:'unmetered'}]}
  await writeFile(join(root,'budget.json'),JSON.stringify(old))
  const module=new URL('../src/budget.mjs',import.meta.url).href
  const source=`import {withLedger} from ${JSON.stringify(module)};await withLedger(${JSON.stringify(root)},async ledger=>{ledger.entries=[];process.stdout.write('LOCKED\\n');await new Promise(()=>{setInterval(()=>{},1000)});});`
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']})
  const ended=once(child,'exit');child.stderr.resume()
  try{
    const timer=setTimeout(()=>child.kill('SIGKILL'),5000)
    try{assert.match(String((await Promise.race([once(child.stdout,'data'),ended.then(()=>{throw new Error('writer exited before acquiring lock')})]))[0]),/LOCKED/)}finally{clearTimeout(timer)}
    await assert.rejects(withLedger(root,()=>{}),/ledger is locked/)
    child.kill('SIGKILL');assert.equal((await ended)[1],'SIGKILL')
    await withLedger(root,ledger=>{assert.deepEqual(ledger,old);ledger.trialDeadlines=[{trialId:'new',deadlineAt:Date.now()+1000}]})
    assert.deepEqual(JSON.parse(await readFile(join(root,'budget.json'),'utf8')).entries,old.entries)
  }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await ended}await rm(root,{recursive:true,force:true})}
})
