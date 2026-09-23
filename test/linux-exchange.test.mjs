import test from 'node:test'
import assert from 'node:assert/strict'
import { validateExchange } from '../src/isolation/linux-dsh.mjs'
import { validateBridge } from '../src/linux-bridge.mjs'

test('container file exchange rejects traversal, duplicates, invalid encoding and excess bytes',()=>{
  const row={path:'workspace/index.mjs',content:Buffer.from('synthetic').toString('base64')}
  assert.equal(validateExchange([row])[0].bytes.toString(),'synthetic')
  for(const path of ['/etc/passwd','workspace/../outside','workspace//double','workspace/./dot','workspace\\..\\outside','home/sessions/\0','private/key'])assert.throws(()=>validateExchange([{...row,path}]))
  assert.throws(()=>validateExchange([row,row]),/path/)
  assert.throws(()=>validateExchange([{...row,content:'YQ==ignored'}]),/encoding/)
  assert.throws(()=>validateExchange([{...row,content:Buffer.alloc(8*1024*1024+1).toString('base64')}]),/size/)
})

test('bridge endpoint accepts only UUID identities and a fixed loopback port',()=>{
  const runId='12345678-1234-1234-1234-123456789abc'
  assert.doesNotThrow(()=>validateBridge({runId,port:32222}))
  for(const value of ['../escape','x; touch /tmp/example',null])assert.throws(()=>validateBridge({runId:value,port:32222}))
  for(const port of ['32222',0,65536,NaN])assert.throws(()=>validateBridge({runId,port}))
})
