// Private historical audit. No network/model calls and no credential output.
// The observation must first be taken from the user's authenticated provider UI.
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {project} from '../src/runtime.mjs'
import {readIsolatedCredential} from '../src/credential.mjs'
import {proposeHistoricalReconciliation,applyHistoricalReconciliation} from '../src/broker/reconciliation.mjs'
import {decodeZstdLog,scanZstdFrames} from '../upstream/dsh-eval-harness/lib/zstd.js'

const root=join(project,'state'),output=join(root,'billing-reconciliation')
const observationPath=join(output,'provider-observation.json')
const observation=JSON.parse(await readFile(observationPath,'utf8'))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
if(sha(await readIsolatedCredential(join(root,'dsh-home')))!==observation.credentialSha256)throw new Error('isolated credential does not match the observed account key')
const pilotPath=join(root,'analysis/pilot-audit.json'),incidentPath=join(root,'analysis/compatibility-incident.json')
const pilot=JSON.parse(await readFile(pilotPath,'utf8')),incident=JSON.parse(await readFile(incidentPath,'utf8'))
const records=[...pilot.pilots,incident],evidence=[]
for(const path of [observationPath,pilotPath,incidentPath,join(output,'cny-fx.json')])evidence.push({path,sha256:sha(await readFile(path))})
let traceRequests=0,traceTokens=0,auxiliaryRequests=0
const coverage=[]
for(const record of records){
  const path=resolve(project,record.trace)
  if(!path.startsWith(root+'/'))throw new Error('historical trace outside private state')
  const bytes=await readFile(path)
  if(sha(bytes)!==record.traceSha256||scanZstdFrames(bytes).tornStart!==undefined)throw new Error('historical trace changed or is incomplete')
  const events=decodeZstdLog(bytes).trim().split('\n').map(JSON.parse)
  if(events.some(event=>event.type==='llm/retry'))throw new Error('retry coverage requires separate review')
  const messages=events.filter(event=>event.type==='assistant/message')
  // A title-request event precedes dispatch and is not proof it happened.
  // Count only a provider-produced title; retain unsuccessful intents as such.
  const auxiliaryIntents=events.filter(event=>event.type==='session/title-llm-request')
  const auxiliary=events.filter(event=>event.type==='session/title'&&event.data?.source?.kind==='provider'&&event.data.source.provider==='session-title-first-prompt-llm')
  const relevant=[...messages,...auxiliary]
  for(const event of relevant){
    if(!Number.isFinite(event.time)||event.time<Date.parse(observation.periodStart)||event.time>=Date.parse(observation.periodEnd))throw new Error('request outside observed provider day')
  }
  let tokens=0
  for(const event of messages){
    // Reasoning is a subset of output tokens, not a fourth billable category.
    for(const key of ['inputTokens','cacheReadTokens','outputTokens']){
      const amount=event.data.usage?.[key]
      if(!Number.isSafeInteger(amount)||amount<0)throw new Error('incomplete trace usage')
      tokens+=amount
    }
  }
  traceRequests+=relevant.length;traceTokens+=tokens;auxiliaryRequests+=auxiliary.length
  evidence.push({path,sha256:sha(bytes)})
  coverage.push({traceSha256:sha(bytes),assistantRequests:messages.length,auxiliaryRequests:auxiliary.length,auxiliaryRequestIntents:auxiliaryIntents.length,knownTokens:tokens,
    firstRequestEventAt:new Date(Math.min(...relevant.map(event=>event.time))).toISOString(),lastRequestEventAt:new Date(Math.max(...relevant.map(event=>event.time))).toISOString()})
}
const fx=JSON.parse(await readFile(join(output,'cny-fx.json'),'utf8'))
if(fx.result!=='success'||fx.rates?.TWD!==observation.cnyToTwd||fx.time_last_update_utc!==observation.fxCheckedAt)throw new Error('FX evidence differs from observation')
const ledger=JSON.parse(await readFile(join(root,'budget.json'),'utf8'))
const proposal=proposeHistoricalReconciliation(ledger,{observation,coveredEntryIds:ledger.entries.filter(row=>row.accountingVersion!==2).map(row=>row.id),traceRequests,traceTokens,evidence,reviewedAt:new Date().toISOString()})
await mkdir(output,{recursive:true,mode:0o700})
await writeFile(join(output,'trace-coverage.json'),JSON.stringify({traceRequests,traceTokens,auxiliaryRequests,providerTokens:observation.totalTokens,coverage},null,2)+'\n',{mode:0o600})
await writeFile(join(output,'proposal.json'),JSON.stringify(proposal,null,2)+'\n',{mode:0o600})
let applied=null
if(process.argv.includes('--apply'))applied=await applyHistoricalReconciliation(root,proposal)
console.log(JSON.stringify({traceRequests,traceTokens,auxiliaryRequests,providerTokens:observation.totalTokens,chargedUpperBoundTwd:proposal.chargedUpperBoundTwd,applied}))
