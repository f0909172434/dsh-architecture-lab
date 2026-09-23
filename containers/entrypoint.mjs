import { mkdir, symlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { versions } from './src/runtime.mjs'

const [recipe,prompt]=process.argv.slice(2)
if(!['A','B','C','D'].includes(recipe)||typeof prompt!=='string')throw new Error('invalid trial entry')
const modules='/home/lab/profiles/trial/node_modules'
await mkdir(modules,{recursive:true})
if(['B','D'].includes(recipe)){
  await mkdir(modules+'/@kenz1117',{recursive:true})
  await symlink('/opt/lab/upstream/dsh-engram',modules+'/@kenz1117/dsh-engram')
}
if(['C','D'].includes(recipe))await symlink('/opt/lab/upstream/dsh-plan-and-execute',modules+'/dsh-plan-and-execute')
await mkdir('/home/lab/empty-git-template',{recursive:true})
await new Promise((resolve,reject)=>{
  const git=spawn('git',['init','--quiet','--initial-branch=trial','--template=/home/lab/empty-git-template','/work'],{stdio:'inherit',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1'}})
  git.once('error',reject);git.once('close',code=>code===0?resolve():reject(new Error('trial repository initialization failed')))
})
const pins=await versions()
const child=spawn(process.execPath,[`/opt/lab/state/runtime/${pins.harness}/node_modules/@deepseek-ai/dsh/lib/bin.js`,'--profile','trial',prompt],{cwd:'/work',stdio:'inherit'})
child.once('error',()=>process.exit(1));child.once('close',(code,signal)=>process.exit(signal?1:code??1))
process.on('SIGTERM',()=>child.kill('SIGTERM'))
