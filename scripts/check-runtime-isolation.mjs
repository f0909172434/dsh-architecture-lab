// Credential-free native DSH backend probe. Does not send a positional prompt,
// load the formal home, or allow any network connection.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { harness, project } from '../src/runtime.mjs'
import { runIsolatedProcess } from '../src/isolation/process.mjs'

const runtime = await harness()
const root = await mkdtemp(join(project, 'state', 'runtime-boundary-'))
const home = join(root, 'home'), workspace = join(root, 'workspace')
const profile = join(home, 'profiles', 'probe')
await mkdir(profile, { recursive: true }); await mkdir(workspace)
const sibling = join(root, 'other-trial.txt')
await writeFile(sibling, 'synthetic-private-marker')
await writeFile(join(workspace, 'local.txt'), 'synthetic-local-marker')
await symlink(sibling, join(workspace, 'escape'))
const probePath = join(home, 'probe.mjs')
const quote = text => `'${text.replaceAll("'", "'\\''")}'`
await writeFile(probePath, `
export const inject=['fs','shell'];
export async function apply(ctx){
  ctx.on('llm/stream',()=>{throw new Error('offline probe forbids model dispatch')},{global:true});
    try {
      const read=async p=>{try{return {text:await ctx.fs.readText(await ctx.fs.resolve(p))}}catch(e){return {error:e.code??e.name}}};
      const shell=async command=>{try {const r=await ctx.shell.run(ctx.shell.resolve({command,workdir:${JSON.stringify(workspace)},timeoutMs:2000}));return {exitCode:r.exitCode,stdout:r.stdout,stderr:r.stderr}}catch(e){return {error:e.code??e.name}}};
      const result={
        local:await read(${JSON.stringify(join(workspace,'local.txt'))}),
        sibling:await read(${JSON.stringify(sibling)}),
        symlink:await read(${JSON.stringify(join(workspace,'escape'))}),
        judge:await read(${JSON.stringify(join(project,'tasks/cases.mjs'))}),
        shellLocal:await shell('/bin/cat local.txt'),
        shellSibling:await shell(${JSON.stringify(`/bin/cat ${quote(sibling)}`)})
      };
      process.stdout.write('ARCHITECTURE_PROBE='+JSON.stringify(result)+'\\n',()=>process.exit(0));
    }catch(e){console.error('probe failed:',e.message);process.exit(1)}
}
`)
await writeFile(join(profile,'package.json'), JSON.stringify({ name:'architecture-boundary-probe', private:true, dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless'],patchReload:'startup'}} }))
await writeFile(join(profile,'cordis.yml'),'[]\n')
await writeFile(join(profile,'cordis.patch.yml'), [
  '- id: headless-runner\n  disabled: true',
  '- id: headless-startup\n  disabled: true',
  '- id: session-title-llm\n  disabled: true',
  '- id: skill-filesystem\n  disabled: true',
  '- id: settings\n  config:\n    watch: false',
  '- id: credentials\n  config:\n    watch: false',
  '- id: sandbox-policy\n  config:\n    mode: danger-full-access',
  `- insert:\n    - id: offline-boundary-probe\n      name: ${JSON.stringify(probePath)}`,
].join('\n')+'\n')
// The outer kernel boundary owns confinement. DSH's inner shell policy must
// not attempt a second, unsupported Seatbelt application inside that boundary.
const result=await runIsolatedProcess({args:[runtime.bin,'--profile','probe'],cwd:workspace,home,readOnly:[join(runtime.root,'node_modules')],readWrite:[home,workspace],executables:['/bin/bash','/bin/cat'],env:{DSH_HOME:home,DSH_PERMISSION_MODE:'danger-full-access'},timeoutMs:15000})
await writeFile(join(root,'process.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({root,status:result.status,reason:result.reason,stderr:result.stderr.slice(-3000)}))
assert.equal(result.status,0,'DSH must successfully load and run the positive probe')
const line=result.stdout.split('\n').find(line=>line.startsWith('ARCHITECTURE_PROBE='))
assert.ok(line,'native DSH probe output is required')
const facts=JSON.parse(line.slice('ARCHITECTURE_PROBE='.length))
await writeFile(join(root,'evidence.json'),JSON.stringify(facts,null,2)+'\n')
assert.equal(facts.local.text,'synthetic-local-marker')
for(const key of ['sibling','symlink','judge']) assert.ok(facts[key].error && facts[key].text===undefined,`${key} must be denied`)
assert.equal(facts.shellLocal.exitCode,0,JSON.stringify(facts.shellLocal))
assert.ok(JSON.stringify(facts.shellLocal.stdout).includes('synthetic-local-marker'))
assert.notEqual(facts.shellSibling.exitCode,0)
assert.ok(!JSON.stringify(facts.shellSibling).includes('synthetic-private-marker'))
assert.equal(await readFile(sibling,'utf8'),'synthetic-private-marker')
console.log('Native DSH filesystem and shell boundary probes passed; no model request or credential used.')
