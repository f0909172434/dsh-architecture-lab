import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project, versions } from './runtime.mjs'

const components={
  engram:{directory:'dsh-engram',patch:'dsh-engram-0.7.12-user-source.patch'},
  planner:{directory:'dsh-plan-and-execute',patch:'dsh-plan-and-execute-0.5.0-rc3.patch'},
}
export async function verifyDependencyBuild(name){
  const component=components[name]
  if(!component)throw new Error('unknown patched dependency')
  const pins=await versions()
  const record=JSON.parse(await readFile(join(project,'state/patches',`${name}-build.json`),'utf8'))
  if(record.harness!==pins.harness||record.version!==pins[name]||record.revision!==pins[`${name}Revision`])throw new Error(`${name} build version differs from pinned runtime`)
  for(const [key,path] of [
    ['patchSha256',join(project,'patches',component.patch)],
    ['bundleSha256',join(project,'upstream',component.directory,'lib/index.js')],
    ['lockSha256',join(project,'upstream',component.directory,'pnpm-lock.yaml')],
  ]){
    const hash=createHash('sha256').update(await readFile(path)).digest('hex')
    if(hash!==record[key])throw new Error(`${name} ${key} changed; rebuild before running`)
  }
  return record
}
