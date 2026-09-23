import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { runIsolatedProcess } from '../src/isolation/process.mjs'

const onMac = (name, fn) => test(name, { skip: process.platform !== 'darwin' }, fn)
async function temporary(fn) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'architecture-tree-test-')))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

onMac('read/write isolation follows shell children and rejects links to another trial', async () => temporary(async root => {
  const workspace = join(root, 'workspace'); await mkdir(workspace)
  const secret = join(root, 'sibling.txt'); await writeFile(secret, 'dummy-other-trial')
  const script = join(workspace, 'probe.mjs')
  await writeFile(script, `
    import {readFileSync,writeFileSync,linkSync,symlinkSync} from 'node:fs';
    import {spawnSync} from 'node:child_process';
    const attempt=fn=>{try {return fn()}catch(e){return e.code}};
    writeFileSync('local.txt','local-positive');
    const child=spawnSync('/bin/bash',['--noprofile','--norc','-c','/bin/cat local.txt'],{encoding:'utf8'});
    const leak=spawnSync('/bin/bash',['--noprofile','--norc','-c',${JSON.stringify(`/bin/cat '${secret}'`)}],{encoding:'utf8'});
    symlinkSync(${JSON.stringify(secret)},'symbolic');
    console.log(JSON.stringify({
      positive:child.stdout, childStatus:child.status, childStderr:child.stderr, childError:child.error?.code, leakStatus:leak.status, leaked:leak.stdout,
      symbolic:attempt(()=>readFileSync('symbolic','utf8')),
      hardlink:attempt(()=>{linkSync(${JSON.stringify(secret)},'hard');return readFileSync('hard','utf8')}),
      writeOutside:attempt(()=>writeFileSync(${JSON.stringify(secret)},'changed'))
    }));`)
  const result = await runIsolatedProcess({ args: [script], cwd: workspace, readWrite: [workspace], executables: ['/bin/bash', '/bin/cat'] })
  assert.equal(result.status, 0, result.stderr)
  const probe = JSON.parse(result.stdout)
  assert.equal(probe.positive, 'local-positive',JSON.stringify(probe))
  assert.equal(probe.childStatus, 0)
  assert.notEqual(probe.leakStatus, 0)
  assert.equal(probe.leaked, '')
  for (const key of ['symbolic', 'hardlink', 'writeOutside']) assert.ok(['EPERM','EACCES'].includes(probe[key]), JSON.stringify(probe))
  assert.equal(await readFile(secret, 'utf8'), 'dummy-other-trial')
}))

onMac('only the assigned broker port is reachable', async () => temporary(async root => {
  const servers = [createServer((_req,res) => res.end('broker-positive')), createServer((_req,res) => res.end('other-server'))]
  for (const server of servers) await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const script=join(root,'probe.mjs')
    await writeFile(script, `const result={};
      for(const [name,port] of Object.entries(${JSON.stringify({allowed:servers[0].address().port,denied:servers[1].address().port})})) {
        try{result[name]=await (await fetch('http://127.0.0.1:'+port)).text()}
        catch(e){result[name]=e.cause?.code ?? e.code}
      }
      console.log(JSON.stringify(result));`)
    const result=await runIsolatedProcess({args:[script],cwd:root,readOnly:[root],loopbackPort:servers[0].address().port})
    assert.equal(result.status,0,result.stderr)
    const probe=JSON.parse(result.stdout)
    assert.equal(probe.allowed,'broker-positive')
    assert.ok(['EPERM','EACCES'].includes(probe.denied),JSON.stringify(probe))
  } finally {
    for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  }
}))

onMac('cancel and timeout terminate a running child process group', async () => temporary(async root => {
  const script=join(root,'probe.mjs')
  await writeFile(script, `import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    console.log(child.pid);setInterval(()=>{},1000);`)
  for(const mode of ['timeout','cancelled']) {
    const controller=new AbortController()
    const timer=mode==='cancelled'?setTimeout(()=>controller.abort(),300):null
    let result
    try{result=await runIsolatedProcess({args:[script],cwd:root,readOnly:[root],timeoutMs:mode==='timeout'?300:3000,signal:controller.signal})}
    finally{if(timer)clearTimeout(timer)}
    assert.equal(result.reason,mode)
    const pid=Number(result.stdout.trim())
    assert.ok(Number.isInteger(pid)&&pid>0,result.stderr)
    // The killed grandchild can briefly remain a zombie pending reaping. A
    // follow-up process inspection is used instead of treating PID existence
    // alone as evidence it is still running.
    const {spawnSync}=await import('node:child_process')
    const status=spawnSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).stdout.trim()
    assert.ok(status===''||status.startsWith('Z'),status)
  }
}))

onMac('timeout and exit do not resignal a terminated group', async () => temporary(async root => {
  const originalKill=process.kill
  const groupSignals=[]
  process.kill=function(pid,signal){
    if(pid<0&&signal==='SIGKILL'){
      if(groupSignals.includes(pid))throw Object.assign(new Error('simulated macOS zombie-group EPERM'),{code:'EPERM'})
      groupSignals.push(pid)
    }
    return originalKill.call(process,pid,signal)
  }
  try{
    const result=await runIsolatedProcess({args:['-e','console.log("running");setInterval(()=>{},1000)'],cwd:root,readOnly:[root],timeoutMs:300})
    assert.equal(result.reason,'timeout')
    assert.match(result.stdout,/running/)
    assert.equal(groupSignals.length,1)
  }finally{process.kill=originalKill}
}))
