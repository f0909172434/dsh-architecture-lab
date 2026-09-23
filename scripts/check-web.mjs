// Native HTTP/module integration only. No browser is opened, and this is not
// graphical acceptance. Uses an empty DSH home and a synthetic offline trial.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { harness, project } from '../src/runtime.mjs'

const runtime=await harness(),root=await mkdtemp(join(project,'state/web-acceptance-'))
const home=join(root,'home'),profile=join(home,'profiles/probe'),workspace=join(root,'workspace')
await mkdir(join(profile,'node_modules'),{recursive:true});await mkdir(workspace)
await symlink(project,join(profile,'node_modules/dsh-architecture-lab'))
await writeFile(join(profile,'package.json'),JSON.stringify({name:'architecture-web-probe',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-architecture-lab'],patchReload:'startup'}}}))
await writeFile(join(profile,'cordis.yml'),'[]\n')
const probe=join(home,'probe.mjs')
await writeFile(probe,`
import assert from 'node:assert/strict';
export const inject=['webServer','clientModules'];
export function apply(ctx){
  ctx.on('llm/stream',()=>{throw new Error('web probe forbids model dispatch')},{global:true});
  const run=async()=>{
    await ctx.get('loader')?.await();
    const origin='http://127.0.0.1:'+ctx.webServer.port;
    const page=await fetch(origin+'/architecture-lab');assert.equal(page.status,200);
    const html=await page.text(),token=html.match(/name="lab-token" content="([a-f0-9]{64})"/)?.[1];assert.ok(token);
    const module=ctx.clientModules.graph().entries.find(entry=>entry.id==='dsh-architecture-lab');assert.ok(module,'lab must be in the actual client graph');
    const bundle=await fetch(origin+module.url);assert.equal(bundle.status,200);assert.match(await bundle.text(),/sidebar.panellist/);
    const api=async(path,body)=>{
      const response=await fetch(origin+'/api/architecture-lab/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json','x-architecture-lab-token':token},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,value:await response.json()};
    };
    assert.equal((await api('action',{action:'select',recipe:'D'})).status,200);
    assert.equal((await api('state')).value.selectedRecipe,'D');
    assert.equal((await api('action',{action:'start',recipe:'A',taskId:'stale-fee',repetition:1})).status,400);
    assert.equal((await api('action',{action:'check',recipe:'A',repetition:1})).status,200);
    let row;
    for(let i=0;i<400;i++){row=(await api('state')).value.runs[0];if(row&&row.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,50));}
    assert.equal(row?.status,'completed',JSON.stringify(row));assert.equal(row.test.pass,true);assert.equal(row.claimedCompletion,true);assert.equal(row.paidRequests,0);
    const report=await api('report');assert.equal(report.value.runs[0].runId,row.runId);assert.equal(report.value.comparisonReady,false);
    const evidence=await api('evidence?runId='+row.runId+'&kind=record');assert.equal(evidence.value.runId,row.runId);
    process.stdout.write('ARCHITECTURE_WEB_PROBE='+JSON.stringify({nativeWebServer:true,clientModuleServed:true,controls:['select','paid-start-held','check','report','evidence'],realIsolatedTools:true,paidRequests:0,graphicalAcceptance:false})+'\\n');
    ctx.get('appExit')(0);
  };run().catch(error=>{console.error(error);ctx.get('appExit')(1)});
}
`)
await writeFile(join(profile,'cordis.patch.yml'),[
  ...['session-title-llm','skill-filesystem'].map(id=>`- id: ${id}\n  disabled: true`),
  '- id: settings\n  config:\n    watch: false',
  '- id: credentials\n  config:\n    watch: false',
  '- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: false\n    surfaceContext: false\n    trustedHosts: []',
  `- insert:\n    - id: web-integration-probe\n      name: ${JSON.stringify(probe)}`,
].join('\n')+'\n')
const child=spawn(process.execPath,[runtime.bin,'--profile','probe','--port','0','--no-open'],{cwd:workspace,env:{PATH:process.env.PATH,HOME:home,DSH_HOME:home,DSH_ARCH_LAB_ROOT:root},stdio:['ignore','pipe','pipe']})
let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x)
const timer=setTimeout(()=>child.kill('SIGTERM'),45000)
const status=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer)
await writeFile(join(root,'process.json'),JSON.stringify({status,stdout,stderr},null,2)+'\n')
assert.equal(status,0,stderr)
const line=stdout.split('\n').find(line=>line.startsWith('ARCHITECTURE_WEB_PROBE='));assert.ok(line,'native web evidence required')
const facts=JSON.parse(line.slice('ARCHITECTURE_WEB_PROBE='.length))
await writeFile(join(root,'acceptance.json'),JSON.stringify(facts,null,2)+'\n')
console.log(JSON.stringify({root,...facts}))
