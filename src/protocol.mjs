import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project, harness, versions } from './runtime.mjs'
import { tasks } from '../tasks/catalog.mjs'
import { trialOrder } from './recipes.mjs'
import { verifyDependencyBuild } from './dependency-build.mjs'
import { loadPricing } from './budget.mjs'
import { verifyLinuxImage } from './isolation/linux-dsh.mjs'

export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex')
export const protocolPath = root => join(root,'v2','protocol.json')

async function sourceFiles(directory,relative=''){
  const result=[]
  for(const entry of (await readdir(join(directory,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=join(relative,entry.name)
    if(entry.isSymbolicLink())throw new Error('protocol sources cannot be symbolic links')
    if(entry.isDirectory())result.push(...await sourceFiles(directory,path))
    else if(entry.isFile())result.push(path)
  }
  return result
}

export async function verifyFileManifest(files,roots){
  for(const entry of files){
    if(!Object.hasOwn(roots,entry.scope)||typeof entry.path!=='string'||entry.path.startsWith('/')||entry.path.split('/').some(p=>p==='..'||p===''))throw new Error('invalid protocol file reference')
    if(hashBytes(await readFile(join(roots[entry.scope],entry.path)))!==entry.sha256)throw new Error(`protocol input changed: ${entry.scope}/${entry.path}`)
  }
}

/** Immutable candidate protocol. Review acceptance and the live gate remain
 * distinct; preparing a manifest is not permission to spend or proof of rigor.
 */
export async function prepareProtocol(root){
  const runtime=await harness(),pins=await versions()
  const image=await verifyLinuxImage()
  const builds={engram:await verifyDependencyBuild('engram'),planner:await verifyDependencyBuild('planner')}
  const pricing=await loadPricing(root)
  const refs=[{scope:'project',path:'versions.json'},{scope:'project',path:'package.json'},
    {scope:'project',path:`state/runtime/${runtime.version}/package-lock.json`},
    {scope:'project',path:'upstream/dsh-eval-harness/lib/runner.js'}]
  refs.push({scope:'project',path:'state/linux-vm/runtime-dependency-locks.json'})
  for(const dir of ['src','tasks','patches','containers','scripts'])for(const path of await sourceFiles(join(project,dir)))if(!path.includes('__pycache__'))refs.push({scope:'project',path:join(dir,path)})
  for(const item of tasks)refs.push({scope:'experiment',path:`snapshots/${item.id}/user.db`})
  for(const ref of refs)ref.sha256=hashBytes(await readFile(join(ref.scope==='project'?project:root,ref.path)))
  const contents={schemaVersion:2,reviewStatus:'pending',execution:{backend:'linux',imageId:image.imageId,baseImage:image.baseImage,architecture:image.architecture,sourceManifest:image.manifest,dependencyLocksSha256:image.dependencyLocksSha256},model:'deepseek-official/deepseek-flash',reasoningEffort:'high',maxRequestsPerTrial:12,maxDurationMs:600000,capTwd:300,plugins:pins,builds,pricing,files:refs,trials:trialOrder(tasks.map(t=>t.id)),
    outcomes:{correctness:'external isolated value comparison',claimedCompletion:'explicit completion marker only; missing marker is unknown',resumes:'fresh attempt, retained separately; never best-of success',denominator:'every launched independent first attempt, including limits and interruptions'},
  }
  const protocol={...contents,id:hashBytes(JSON.stringify(contents)),preparedAt:new Date().toISOString()}
  await mkdir(join(root,'v2'),{recursive:true,mode:0o700})
  await writeFile(protocolPath(root),JSON.stringify(protocol,null,2)+'\n',{flag:'wx',mode:0o600})
  return protocol
}

export async function loadProtocol(root){
  const protocol=JSON.parse(await readFile(protocolPath(root),'utf8'))
  const {id,preparedAt,...contents}=protocol
  if(protocol.schemaVersion!==2||id!==hashBytes(JSON.stringify(contents))||protocol.capTwd!==300||protocol.maxRequestsPerTrial!==12||protocol.maxDurationMs!==600000||protocol.model!=='deepseek-official/deepseek-flash'||protocol.reasoningEffort!=='high')throw new Error('protocol identity or limits are invalid')
  await verifyFileManifest(protocol.files,{project,experiment:root})
  const image=await verifyLinuxImage()
  if(protocol.execution?.backend!=='linux'||protocol.execution.imageId!==image.imageId||protocol.execution.dependencyLocksSha256!==image.dependencyLocksSha256||JSON.stringify(protocol.execution.sourceManifest)!==JSON.stringify(image.manifest))throw new Error('protocol execution image changed')
  const pricing=await loadPricing(root)
  if(JSON.stringify(pricing)!==JSON.stringify(protocol.pricing))throw new Error('pricing changed after protocol preparation')
  return protocol
}
