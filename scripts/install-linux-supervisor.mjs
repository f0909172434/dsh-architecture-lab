import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project } from '../src/runtime.mjs'
import { linuxRuntime } from '../src/linux-runtime.mjs'

const runtime=await linuxRuntime()
runtime.guest(['sudo','install','-d','-m','0755','/opt/dsh-architecture-lab'])
runtime.guest(['sudo','install','-d','-m','0700','/var/lib/dsh-architecture-lab/runs'])
for(const file of ['supervisor.py','receipt.py','cleanup.py','launch.py','bridge-lease.py','files.py']) {
  const contents=await readFile(join(project,'containers',file))
  runtime.guest(['sudo','tee',`/opt/dsh-architecture-lab/${file}`],{input:contents})
  runtime.guest(['sudo','chmod','0644',`/opt/dsh-architecture-lab/${file}`])
}
runtime.guest(['sudo','python3','-m','compileall','-q','/opt/dsh-architecture-lab'])
console.log('Installed root-owned guest supervisor and systemd cleanup handler.')
