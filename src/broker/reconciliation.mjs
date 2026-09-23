import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withLedger } from '../budget.mjs'
import { committedTwd, fingerprint } from './accounting.mjs'

/** A provider's closed-day aggregate can bound all covered historical calls
 * without inventing per-request usage. Original reservations remain untouched.
 * Observation/key matching and trace coverage must be reviewed before applying.
 */
export function proposeHistoricalReconciliation(ledger,{observation,coveredEntryIds,traceRequests,traceTokens,evidence,reviewedAt}){
  committedTwd(ledger)
  if(ledger.reconciliations?.length)throw new Error('historical reconciliation already exists')
  const start=Date.parse(observation.periodStart),end=Date.parse(observation.periodEnd),at=Date.parse(observation.observedAt)
  if(observation.source!=='https://platform.deepseek.com/usage'||observation.evidenceKind!=='authenticated-provider-usage-screen'||!observation.maskedKeyMatch||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(at)||at<end+300000||Date.parse(reviewedAt)<at||!Number.isFinite(Date.parse(reviewedAt)))throw new Error('unverified provider observation')
  if(!Number.isInteger(observation.requests)||observation.requests!==traceRequests||!Number.isSafeInteger(traceTokens)||!Number.isSafeInteger(observation.totalTokens)||traceTokens<0||observation.totalTokens<traceTokens)throw new Error('provider and trace coverage do not agree')
  const cny=observation.displayedCosts?.CNY,usd=observation.displayedCosts?.USD,rate=observation.cnyToTwd
  if(!Number.isFinite(cny)||cny<0||usd!==0||observation.displayRoundingCny!==.01||!Number.isFinite(rate)||rate<=0||observation.fxSource!=='https://open.er-api.com/v6/latest/CNY')throw new Error('unsupported reconciliation currency')
  const fx=Date.parse(observation.fxCheckedAt)
  if(!Number.isFinite(fx)||fx>at||at-fx>48*60*60*1000)throw new Error('unverified reconciliation exchange rate')
  if(!Array.isArray(coveredEntryIds)||!coveredEntryIds.length||new Set(coveredEntryIds).size!==coveredEntryIds.length)throw new Error('invalid historical entries')
  const entries=coveredEntryIds.map(id=>{
    const row=ledger.entries.find(item=>item.id===id)
    if(!row||row.accountingVersion===2||Date.parse(row.at)<start||Date.parse(row.at)>=end||!Number.isFinite(Date.parse(row.at)))throw new Error('entry outside provider window')
    return row
  })
  if(!Array.isArray(evidence)||!evidence.length||evidence.some(row=>typeof row.path!=='string'||!/^([a-f0-9]{64})$/.test(row.sha256??'')))throw new Error('hashed evidence required')
  // One full display unit covers truncation or rounding. A further 10% FX
  // margin and upward whole-NT$ rounding keep this a conservative charge.
  const chargedUpperBoundTwd=Math.ceil((cny+.01)*rate*1.1)
  if(chargedUpperBoundTwd>entries.reduce((sum,row)=>sum+row.reservedTwd,0))throw new Error('reconciliation exceeds original reservations')
  return {kind:'provider-window-upper-bound-v1',reviewedAt,coveredEntryIds,coveredEntriesSha256:fingerprint(entries),
    chargedUpperBoundTwd,calculation:{displayedCny:cny,displayUnitCny:.01,cnyToTwd:rate,fxMargin:1.1},providerInvoiceVerified:false,perRequestCostsVerified:false,unallocatedTokens:observation.totalTokens-traceTokens,
    method:'closed provider day, matching key, complete observed request count; display rounding + 10% FX margin, rounded up to whole NT$',evidence}
}

export async function applyHistoricalReconciliation(root,proposal){
  for(const item of proposal.evidence){
    if(createHash('sha256').update(await readFile(item.path)).digest('hex')!==item.sha256)throw new Error('reconciliation evidence changed')
  }
  return withLedger(root,async ledger=>{
    if(ledger.reconciliations?.length)throw new Error('historical reconciliation already exists')
    const before=committedTwd(ledger)
    ledger.reconciliations=[proposal]
    const after=committedTwd(ledger)
    if(after>before||after>300)throw new Error('reconciliation cannot increase the budget cap')
    // Read and back up under the same lock as the update, so a concurrent
    // reservation cannot disappear from the exact before-image.
    await writeFile(join(root,'budget.before-provider-reconciliation.json'),await readFile(join(root,'budget.json')),{flag:'wx',mode:0o600})
    return {before,after,availableTwd:300-after,originalEntriesPreserved:true}
  })
}
