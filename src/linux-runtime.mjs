import { readFile } from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { project } from './runtime.mjs'

export const executionBackend=()=>process.env.DSH_ARCH_LAB_BACKEND??'linux'

/** Dedicated Lima state only; never inherits provider credentials or SSH agents. */
export async function linuxRuntime() {
  const config=JSON.parse(await readFile(join(project,'containers/runtime.json'),'utf8'))
  const installation=join(project,'state/tools',`lima-${config.limaVersion}`)
  const binary=join(installation,'bin/limactl')
  const env={PATH:`${join(installation,'bin')}:/usr/bin:/bin:/usr/sbin:/sbin`,HOME:process.env.HOME,LIMA_HOME:join(project,'state/linux-vm'),TMPDIR:process.env.TMPDIR??'/tmp'}
  const args=command=>['shell','--workdir','/',config.vmName,...command]
  return {
    config,binary,env,
    guest(command,options={}){return execFileSync(binary,args(command),{env,encoding:'utf8',timeout:30_000,maxBuffer:4*1024*1024,...options})},
    spawnGuest(command){return spawn(binary,args(command),{env,stdio:['pipe','pipe','pipe']})},
  }
}
