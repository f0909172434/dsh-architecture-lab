import { mkdir, open, realpath, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { hashBytes, loadProtocol, loadStoredProtocol } from './protocol.mjs'
import { readRegistry } from './registry.mjs'

export const reviewChecks=Object.freeze(['method','fixtures','isolation','accounting','lifecycle','reporting'])
export const reviewPath=root=>join(root,'v2','protocol-review.json')
const text=value=>typeof value==='string'&&value.trim().length>=12&&value.length<=8000

async function readEvidence(path){
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try{
    const stat=await handle.stat()
    if(!stat.isFile()||stat.size>2*1024*1024)throw new Error('review evidence must be a regular file under 2 MiB')
    return await handle.readFile()
  }finally{await handle.close()}
}

export function validateReview(review,protocol){
  const {id,...contents}=review
  if(review.schemaVersion!==1||review.kind!=='protocol-review-attestation'||review.decision!=='accept'||review.protocolId!==protocol.id||id!==hashBytes(JSON.stringify(contents)))throw new Error('review identity does not match the protocol')
  if(!['research','workflow-validation'].includes(review.purpose))throw new Error('review purpose required')
  const prepared=Date.parse(protocol.preparedAt),reviewed=Date.parse(review.reviewedAt)
  if(!Number.isFinite(prepared)||!Number.isFinite(reviewed)||reviewed<prepared)throw new Error('review precedes protocol preparation')
  if(typeof review.reviewer?.name!=='string'||!review.reviewer.name.trim()||review.reviewer.name.length>200||!['single-agent','independent-review','human-review'].includes(review.reviewer?.kind)||!text(review.limitations))throw new Error('reviewer identity and limitations required')
  if(!Array.isArray(review.evidence)||!review.evidence.length||review.evidence.length>32||new Set(review.evidence.map(row=>row.sha256)).size!==review.evidence.length)throw new Error('distinct review evidence required')
  for(const item of review.evidence){
    if(!/^[a-f0-9]{64}$/.test(item.sha256??'')||item.path!==`review-evidence/${item.sha256}`||!text(item.description))throw new Error('invalid review evidence identity')
  }
  if(!review.checks||Object.keys(review.checks).sort().join()!==[...reviewChecks].sort().join())throw new Error('all method review checks are required')
  for(const name of reviewChecks){
    const check=review.checks[name]
    if(check?.verdict!=='pass'||!text(check.reason)||!Array.isArray(check.evidence)||!check.evidence.length||check.evidence.some(id=>!review.evidence.some(row=>row.sha256===id)))throw new Error(`incomplete review check: ${name}`)
  }
  return review
}

export async function loadReview(root,protocol){
  const review=validateReview(JSON.parse(await readEvidence(reviewPath(root))),protocol)
  const base=await realpath(join(root,'v2'))
  for(const item of review.evidence){
    const path=join(base,item.path)
    try{if(!(await realpath(path)).startsWith(base+sep)||hashBytes(await readEvidence(path))!==item.sha256)throw new Error('review evidence changed')}
    catch{throw new Error('review evidence changed or is missing')}
  }
  return review
}

export async function loadReviewedProtocol(root){
  const protocol=await loadProtocol(root),review=await loadReview(root,protocol)
  if(review.purpose!=='research')throw new Error('workflow validation is not research acceptance')
  return {protocol,review}
}

/** Record a substantive review supplied as a document, not a boolean switch.
 * This does not remove the live gate, certify independent review, or promote
 * existing trials. Sources/price/image are checked again at execution time.
 */
export async function acceptProtocolReview(root,inputPath){
  const {dirname}=await import('node:path')
  const input=JSON.parse(await readEvidence(resolve(inputPath)))
  const protocol=await loadProtocol(root)
  if(input.protocolId!==protocol.id||input.decision!=='accept')throw new Error('explicit acceptance of this protocol is required')
  if(readRegistry(root).runs.some(row=>row.mode==='live')||readRegistry(root).active)throw new Error('review must precede all live attempts in this experiment')
  if(!Array.isArray(input.evidence)||input.evidence.length>32)throw new Error('review evidence list required')
  const evidence=[],bytes=new Map()
  for(const item of input.evidence){
    if(typeof item.path!=='string'||!text(item.description))throw new Error('evidence path and description required')
    const data=await readEvidence(resolve(dirname(resolve(inputPath)),item.path)),sha256=hashBytes(data)
    if(sha256!==item.sha256)throw new Error('review input evidence changed')
    evidence.push({path:`review-evidence/${sha256}`,sha256,description:item.description});bytes.set(sha256,data)
  }
  const contents={schemaVersion:1,kind:'protocol-review-attestation',purpose:input.purpose,protocolId:protocol.id,decision:'accept',reviewedAt:new Date().toISOString(),reviewer:input.reviewer,checks:input.checks,limitations:input.limitations,evidence}
  const review=validateReview({...contents,id:hashBytes(JSON.stringify(contents))},protocol)
  await mkdir(join(root,'v2','review-evidence'),{recursive:true,mode:0o700})
  for(const item of evidence){
    const path=join(root,'v2',item.path)
    try{await writeFile(path,bytes.get(item.sha256),{flag:'wx',mode:0o600})}
    catch(error){if(error.code!=='EEXIST'||hashBytes(await readEvidence(path))!==item.sha256)throw error}
  }
  // Exclusive final publication. Partial copied evidence cannot enable runs.
  await writeFile(reviewPath(root),JSON.stringify(review,null,2)+'\n',{flag:'wx',mode:0o600})
  return {protocolId:protocol.id,reviewId:review.id,reviewer:review.reviewer,reviewedAt:review.reviewedAt,liveGateUnchanged:true}
}

export async function protocolReviewStatus(root){
  try{
    const protocol=await loadStoredProtocol(root)
    let review
    try{review=await loadReview(root,protocol)}catch(error){
      if(error.code==='ENOENT')return {status:'pending',protocolId:protocol.id}
      return {status:'invalid',protocolId:protocol.id,reason:'審查紀錄或證據已變動，請建立新的協定。'}
    }
    return {status:review.purpose==='research'?'accepted':'workflow-validation',protocolId:protocol.id,reviewId:review.id,reviewer:review.reviewer,reviewedAt:review.reviewedAt,liveGateUnchanged:true}
  }catch(error){
    if(error.code==='ENOENT')return {status:'not-prepared'}
    return {status:'invalid',reason:'協定資料不完整或已變動。'}
  }
}
