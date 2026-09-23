import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTrialEnvironment, pinTrialRequest } from '../src/trial-agent.mjs'
import { validateRequest } from '../src/broker/server.mjs'
import { dispatchBound } from '../src/broker/accounting.mjs'

test('Engram rewrite calls inherit pinned effort without allowing alternate routes or output limits',()=>{
  const base={provider:'deepseek-official',model:'deepseek-flash',purpose:'engram-rewrite',maxTokens:200}
  const request={...base};pinTrialRequest(request);assert.equal(request.reasoningEffort,'high')
  for(const change of [{purpose:'unknown'},{reasoningEffort:'low'},{model:'other'},{provider:'other'},{maxTokens:4097},{maxTokens:undefined}])assert.throws(()=>pinTrialRequest({...base,...change}),/not pinned/)
})

test('the trial adapter rejects provider credentials and routes outside its local broker',()=>{
  const env={DEEPSEEK_BASE_URL:'http://127.0.0.1:12345',DEEPSEEK_API_KEY:'a'.repeat(64)}
  assert.doesNotThrow(()=>validateTrialEnvironment(env))
  for(const url of ['https://api.deepseek.com','http://localhost:12345','http://127.0.0.1','http://user:pass@127.0.0.1:12345','http://127.0.0.1:12345?key=x','http://127.0.0.1:12345/other'])assert.throws(()=>validateTrialEnvironment({...env,DEEPSEEK_BASE_URL:url}),/scoped local broker/)
  assert.throws(()=>validateTrialEnvironment({...env,DEEPSEEK_API_KEY:'sk-dummy-test-only'}),/scoped local broker/)
})

test('Harness inventory is validated and included in the reservation bound',()=>{
  const body={model:'deepseek-flash',reasoning_effort:'high',thinking:{type:'enabled'},stream:true,stream_options:{include_usage:true},max_tokens:4096,messages:[{role:'user',content:'synthetic'}]}
  const inventory={version:1,packages:[{name:'dsh-plan-and-execute',version:'0.5.0'}]}
  assert.doesNotThrow(()=>validateRequest({...body,dsh_plugin_packages:inventory}))
  for(const invalid of [null,{}, {version:2,packages:[]},{version:1,packages:[{}]}])assert.throws(()=>validateRequest({...body,dsh_plugin_packages:invalid}),/inventory/)
  const price={provider:'deepseek-official',model:'deepseek-flash',source:'https://example.invalid/pricing',fxSource:'https://example.invalid/fx',checkedAt:new Date().toISOString(),inputUsdPerMillion:.3,cacheHitUsdPerMillion:.006,outputUsdPerMillion:1.2,usdTwd:31.7}
  assert.ok(dispatchBound({...body,dsh_plugin_packages:{version:1,packages:Array(1000).fill(inventory.packages[0])}},price)>dispatchBound(body,price))
})
