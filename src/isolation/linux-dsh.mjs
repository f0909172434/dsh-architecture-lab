import { remainingTrialMs } from '../deadline.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { join, dirname, posix } from 'node:path'
import { project, versions } from '../runtime.mjs'
import { linuxRuntime } from '../linux-runtime.mjs'
import { openLinuxBridge } from '../linux-bridge.mjs'
import { runLinuxProcess } from '../linux-process.mjs'

const MAX_FILE=8*1024*1024,MAX_TOTAL=48*1024*1024,MAX_FILES=2048
export function validateExchange(files){
  if(!Array.isArray(files)||files.length>MAX_FILES)throw new Error('invalid container file manifest')
  let total=0;const seen=new Set()
  return files.map(item=>{
    if(typeof item?.path!=='string'||item.path.includes('\\')||item.path.includes('\0')||posix.isAbsolute(item.path)||item.path.split('/').some(part=>!part||part==='.'||part==='..')||!['workspace','home','memory'].includes(item.path.split('/')[0])||seen.has(item.path))throw new Error('invalid container file path')
    seen.add(item.path)
    if(typeof item.content!=='string')throw new Error('invalid container file data')
    const bytes=Buffer.from(item.content,'base64');total+=bytes.length
    if(bytes.toString('base64')!==item.content||bytes.length>MAX_FILE||total>MAX_TOTAL)throw new Error('invalid container file size or encoding')
    return {path:item.path,bytes}
  })
}

export async function verifyLinuxImage({allowUnaccepted=false}={}){
  const record=JSON.parse(await readFile(join(project,'state/linux-vm/runtime-image.json'),'utf8'))
  if(!/^sha256:[a-f0-9]{64}$/.test(record.imageId)||(!allowUnaccepted&&!record.accepted))throw new Error('Linux DSH image is not accepted')
  if(!record.manifest?.some(file=>file.path==='entrypoint.mjs'))throw new Error('Linux image is missing the DSH entry point')
  if(record.dependencyLocksSha256!==createHash('sha256').update(await readFile(join(project,'state/linux-vm/runtime-dependency-locks.json'))).digest('hex'))throw new Error('Linux dependency lock evidence changed')
  for(const file of record.manifest){
    const name=file.path
    if(typeof name!=='string'||name.includes('..')||name.startsWith('/'))throw new Error('invalid image source manifest')
    const source=name.startsWith('models/')?join(project,'state/engram',name):['Dockerfile','relay.mjs','entrypoint.mjs'].includes(name)?join(project,'containers',name):join(project,name)
    if(createHash('sha256').update(await readFile(source)).digest('hex')!==file.sha256)throw new Error(`Linux image source changed: ${name}; rebuild required`)
  }
  const runtime=await linuxRuntime()
  // The supervisor is outside the image. Verify the installed trusted code as
  // well, so a source manifest cannot silently refer to an older guest runtime.
  const supervisorFiles=['supervisor.py','receipt.py','cleanup.py','launch.py','bridge-lease.py','files.py']
  const installed=runtime.guest(['sudo','sha256sum',...supervisorFiles.map(file=>`/opt/dsh-architecture-lab/${file}`)]).trim().split('\n')
  for(const [index,file] of supervisorFiles.entries()){
    const expected=createHash('sha256').update(await readFile(join(project,'containers',file))).digest('hex')
    if(installed[index]?.split(/\s+/)[0]!==expected)throw new Error('Linux supervisor source changed; reinstall required')
  }
  const image=JSON.parse(runtime.guest(['sudo','docker','image','inspect',record.imageId]))[0]
  if(image.Id!==record.imageId)throw new Error('Linux image identity mismatch')
  return record
}

export async function exportLinuxDshWorld(root,runId){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId))throw new Error('invalid container export identity')
  const runtime=await linuxRuntime()
  const exported=JSON.parse(runtime.guest(['sudo','python3','/opt/dsh-architecture-lab/files.py','export',runId],{maxBuffer:MAX_TOTAL*2,stdio:['pipe','pipe','pipe']}))
  for(const file of validateExchange(exported)){
    const target=join(root,...file.path.split('/'))
    await mkdir(dirname(target),{recursive:true});await writeFile(target,file.bytes,{flag:'wx',mode:0o600})
  }
  await mkdir(join(root,'workspace'),{recursive:true,mode:0o700})
}

/** Fresh guest data and a fresh host export tree; caller's seed tree is retained. */
export async function prepareLinuxDshWorld(root,broker,{recipe='A',memorySnapshot,workspace:seed,allowUnacceptedImage=false,purpose='research'}={}){
  if(!['A','B','C','D'].includes(recipe)||!seed)throw new Error('invalid Linux trial inputs')
  if(!['research','daily'].includes(purpose))throw new Error('invalid execution purpose')
  const image=await verifyLinuxImage({allowUnaccepted:allowUnacceptedImage}),runtime=await linuxRuntime(),pins=await versions()
  const runId=randomUUID(),home=join(root,'home'),workspace=join(root,'workspace')
  await mkdir(home);await mkdir(workspace)
  const files=[],memory=['B','D'].includes(recipe),planning=['C','D'].includes(recipe)
  const add=(path,content)=>files.push({path,content:Buffer.from(content).toString('base64')})
  async function collect(directory,prefix){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const path=join(directory,entry.name),meta=await lstat(path)
      if(meta.isSymbolicLink()||(!meta.isDirectory()&&!meta.isFile()))throw new Error('trial seed contains unsupported file type')
      if(meta.isDirectory())await collect(path,prefix+'/'+entry.name)
      else {if(meta.size>MAX_FILE)throw new Error('trial seed too large');add(prefix+'/'+entry.name,await readFile(path))}
    }
  }
  await collect(seed,'workspace')
  const bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless',...(memory?['@kenz1117/dsh-engram']:[]),...(planning?['dsh-plan-and-execute']:[])]
  add('home/settings.yaml','agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n  reasoningEffort: high\n')
  add('home/profiles/trial/package.json',JSON.stringify({name:'architecture-linux-trial',private:true,dsh:{profile:{bundles,patchReload:'startup'}}}))
  add('home/profiles/trial/cordis.yml','[]\n')
  const disabled=['session-title-llm','skill-filesystem','tool-subagent','tool-subagent-fork','tool-workflow','tool-ralph','tool-web']
  const patch=[...disabled.map(id=>`- id: ${id}\n  disabled: true`),
    '- id: settings\n  config:\n    watch: false','- id: credentials\n  config:\n    watch: false','- id: tools\n  config:\n    mode: native',
    ...(memory?['- id: dsh-engram\n  config:\n    dbDir: /memory\n    modelCacheDir: /opt/models\n    ingest: off\n    legacyMigration: conservative']:[]),
    ...(planning?['- id: headless-runner\n  disabled: true','- insert:\n    - id: architecture-planner-runner\n      name: /opt/lab/src/planner-runner.mjs']:[]),
    `- insert:\n    - id: architecture-trial-agent\n      name: /opt/lab/src/trial-agent.mjs\n      config:\n        purpose: ${purpose}`,
  ].join('\n')+'\n'
  add('home/profiles/trial/cordis.patch.yml',patch)
  if(memory){if(!memorySnapshot&&purpose==='research')throw new Error('memory snapshot required');if(memorySnapshot)add('memory/user.db',await readFile(memorySnapshot))}
  validateExchange(files)
  runtime.guest(['sudo','python3','/opt/dsh-architecture-lab/files.py','stage',runId],{input:JSON.stringify(files),maxBuffer:MAX_TOTAL*2})
  return {root,home,workspace,agentWorkspace:'/work',containerRunId:runId,containerImage:image.imageId,
    async run(prompt,{signal,timeoutMs=600_000}={}){
      let bridge
      try{
        bridge=await openLinuxBridge({runId,port:broker.port})
        const port=32222
        const result=await runLinuxProcess({runId,image:image.imageId,brokerBridge:true,timeoutMs:broker.deadlineAt?Math.min(timeoutMs,remainingTrialMs(broker.deadlineAt)):timeoutMs,
          ...(broker.deadlineAt?{deadlineAt:broker.deadlineAt}:{}),
          command:['node','/opt/lab/relay.mjs',String(port),'node','/opt/lab/entrypoint.mjs',recipe,prompt],
          env:{DSH_HOME:'/home/lab',DSH_PERMISSION_MODE:'danger-full-access',DEEPSEEK_BASE_URL:`http://127.0.0.1:${port}`,DEEPSEEK_API_KEY:broker.token}}, {signal})
        try {
          await exportLinuxDshWorld(root,runId)
        }catch{
          return {...result,status:1,reason:'invalid_artifacts',artifactError:'Container evidence could not be safely exported.',backend:'linux-container',harness:pins.harness,exportedWorkspace:workspace}
        }
        return {...result,backend:'linux-container',harness:pins.harness,exportedWorkspace:workspace}
      }finally{await bridge?.close()}
    },
  }
}
