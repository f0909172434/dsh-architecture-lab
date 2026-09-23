// Exercises the real Cordis/DSH command registry without a browser, API key,
// positional model prompt or access to the formal DSH home.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { harness, project } from '../src/runtime.mjs'

const runtime=await harness(),root=await mkdtemp(join(project,'state/management-commands-'))
const home=join(root,'home'),profile=join(home,'profiles/probe'),workspace=join(root,'workspace')
await mkdir(join(profile,'node_modules'),{recursive:true});await mkdir(workspace)
await symlink(project,join(profile,'node_modules/dsh-architecture-lab'))
await writeFile(join(profile,'package.json'),JSON.stringify({name:'architecture-command-probe',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless','dsh-architecture-lab'],patchReload:'startup'}}}))
await writeFile(join(profile,'cordis.yml'),'[]\n')
const probe=join(home,'probe.mjs')
await writeFile(probe,`
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const {readRegistry}=await import(pathToFileURL(${JSON.stringify(join(project,'src/registry.mjs'))}).href);
const root=${JSON.stringify(root)};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const inject=['commands','agents','sessions'];
export function apply(ctx){
  ctx.on('llm/stream',()=>{throw new Error('management probe forbids model dispatch')},{global:true});
  const run=async()=>{
    await ctx.get('loader')?.await();
    const {agent}=await ctx.agents.create({sessionId:'session-management-probe',meta:{cwd:${JSON.stringify(workspace)}},agentOptions:{provider:'deepseek-official',model:'deepseek-flash',reasoningEffort:'high'}});
    await agent.whenIdle();
    const execute=async action=>{
      const response=await ctx.commands.execute(agent,'/architecture-lab '+action,[],new AbortController().signal);
      assert.equal(response?.result?.kind,'success',JSON.stringify(response));return response.result.text;
    };
    assert.match(await execute('status'),/目前配方/);
    await execute('select C');assert.equal(readRegistry(root).selectedRecipe,'C');
    const denied=await ctx.commands.execute(agent,'/architecture-lab start A stale-fee 1',[],new AbortController().signal);
    assert.equal(denied?.result?.kind,'error');assert.match(denied.result.text,/實機試驗暫停/);
    await execute('check A 1');
    let completed;
    for(let i=0;i<400;i++){
      completed=readRegistry(root).runs.find(row=>row.recipe==='A'&&row.repetition===1);
      if(completed&&completed.status!=='running')break;await wait(50);
    }
    assert.equal(completed?.status,'completed',JSON.stringify(completed));assert.equal(completed.backend,'linux');assert.equal(completed.cleanupVerified,true);assert.equal(completed.test.pass,true);
    const path=join(root,'export with spaces.json');
    await execute('export '+JSON.stringify(path));
    const exported=JSON.parse(await readFile(path,'utf8'));assert.equal(exported.runs.length,1);assert.equal(exported.comparisonReady,false);
    const report=JSON.parse(await execute('report'));assert.equal(report.runs[0].runId,completed.runId);
    await ctx.sessions.flush(agent.session);
    process.stdout.write('ARCHITECTURE_COMMAND_PROBE='+JSON.stringify({commands:['status','select','start-held','check','export','report'],realRegistry:true,realIsolatedTools:true,paidRequests:0,graphicalAcceptance:false})+'\\n');
    ctx.get('appExit')(0);
  };run().catch(error=>{console.error(error);ctx.get('appExit')(1)});
}
`)
await writeFile(join(profile,'cordis.patch.yml'),[
  ...['headless-runner','headless-startup','session-title-llm','skill-filesystem'].map(id=>`- id: ${id}\n  disabled: true`),
  '- id: settings\n  config:\n    watch: false',
  '- id: credentials\n  config:\n    watch: false',
  `- insert:\n    - id: management-command-probe\n      name: ${JSON.stringify(probe)}`,
].join('\n')+'\n')
const child=spawn(process.execPath,[runtime.bin,'--profile','probe'],{cwd:workspace,env:{PATH:process.env.PATH,HOME:home,DSH_HOME:home,DSH_ARCH_LAB_ROOT:root},stdio:['ignore','pipe','pipe']})
let stdout='',stderr=''
child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk)
const timer=setTimeout(()=>child.kill('SIGTERM'),45000)
const status=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer)
await writeFile(join(root,'process.json'),JSON.stringify({status,stdout,stderr},null,2)+'\n')
assert.equal(status,0,stderr)
const line=stdout.split('\n').find(line=>line.startsWith('ARCHITECTURE_COMMAND_PROBE='))
assert.ok(line,'native management command probe must return evidence')
const facts=JSON.parse(line.slice('ARCHITECTURE_COMMAND_PROBE='.length))
await writeFile(join(root,'acceptance.json'),JSON.stringify(facts,null,2)+'\n')
console.log(JSON.stringify({root,...facts}))
