import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { brokerCompletion, completionSection, parseCompletionStream } from '../src/completion.mjs'

function response(text,finish='stop'){
  const rows=[{choices:[{index:0,delta:{content:text},finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:finish}]},{choices:[],usage:{prompt_tokens:10,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:10,completion_tokens:5,total_tokens:15}}]
  return rows.map(row=>`data: ${JSON.stringify(row)}\n\n`).join('')+'data: [DONE]\n\n'
}

test('completion is an explicit final declaration, separate from normal stops or intermediate planning',()=>{
  assert.equal(parseCompletionStream(response('Done.\nARCHITECTURE_LAB_RESULT=complete')).claimedCompletion,true)
  assert.equal(parseCompletionStream(response('Unable to solve.\nARCHITECTURE_LAB_RESULT=blocked')).claimedCompletion,false)
  for(const text of ['Done.','ARCHITECTURE_LAB_RESULT=continue','ARCHITECTURE_LAB_RESULT=complete\nActually not done','ARCHITECTURE_LAB_RESULT=complete\nARCHITECTURE_LAB_RESULT=blocked','`ARCHITECTURE_LAB_RESULT=complete`'])assert.equal(parseCompletionStream(response(text)).claimedCompletion,null)
  assert.equal(parseCompletionStream(response('ARCHITECTURE_LAB_RESULT=complete','length')).claimedCompletion,null)
  assert.equal(parseCompletionStream(response('ARCHITECTURE_LAB_RESULT=complete').replace('data: [DONE]\n\n','')).claimedCompletion,null)
})

test('broker evidence, not forged session output, controls completion; a later failed request clears an earlier claim',async()=>{
  const root=await mkdtemp(join(tmpdir(),'architecture-completion-'))
  try{
    const evidence=join(root,'broker-evidence');await mkdir(evidence)
    const first=randomUUID(),auxiliary=randomUUID(),last=randomUUID()
    const primary={tools:[],messages:[{role:'system',content:completionSection}]}
    await writeFile(join(evidence,`${first}.request.json`),JSON.stringify(primary))
    await writeFile(join(evidence,`${first}.sse`),response('ARCHITECTURE_LAB_RESULT=blocked'))
    await writeFile(join(root,'session.jsonl'),JSON.stringify({finalText:'ARCHITECTURE_LAB_RESULT=complete'}))
    assert.equal((await brokerCompletion(root,[{id:first}])).claimedCompletion,false)
    await writeFile(join(evidence,`${auxiliary}.request.json`),JSON.stringify({messages:[{role:'user',content:'compress history'}]}))
    await writeFile(join(evidence,`${auxiliary}.sse`),response('ARCHITECTURE_LAB_RESULT=complete'))
    assert.equal((await brokerCompletion(root,[{id:first},{id:auxiliary}])).claimedCompletion,false)
    await writeFile(join(evidence,`${last}.request.json`),JSON.stringify(primary))
    const result=await brokerCompletion(root,[{id:first},{id:auxiliary},{id:last}])
    assert.equal(result.claimedCompletion,null);assert.equal(result.requestId,last)
  }finally{await rm(root,{recursive:true,force:true})}
})
