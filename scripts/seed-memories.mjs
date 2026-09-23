import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, stat, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tasks } from '../tasks/catalog.mjs'
import { harness } from '../src/runtime.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = process.env.DSH_ARCH_LAB_ROOT ?? join(project, 'state')
const modelCache = join(project,'state/engram/models')
const runtime = await harness()
const engram = join(project,'upstream/dsh-engram')
await stat(join(engram,'lib/index.js'))
const selected=process.argv[2] ? tasks.filter(item=>item.id===process.argv[2]) : tasks
if(!selected.length)throw new Error('unknown seed task')
for (const item of selected) {
  const snapshot = join(root, 'snapshots', item.id)
  try { await stat(join(snapshot, 'user.db')); console.log(`${item.id}: already seeded`); continue } catch {}
  const seedDir = join(root, 'seeding', item.id)
  await mkdir(seedDir, { recursive: true })
  const content = (await readFile(join(project, 'tasks', item.id, 'fixture', 'history.md'), 'utf8')).trim()
  const recordsPath = join(seedDir, 'records.json')
  await writeFile(recordsPath, JSON.stringify([{ kind: 'skill', content }], null, 2) + '\n')
  const home=join(seedDir,'credential-free-home'),profile=join(home,'profiles','seed')
  await mkdir(join(profile,'node_modules/@kenz1117'),{recursive:true})
  try { await symlink(engram,join(profile,'node_modules/@kenz1117/dsh-engram')) } catch(error) { if(error.code!=='EEXIST')throw error }
  await writeFile(join(profile,'package.json'),JSON.stringify({name:'architecture-memory-seed',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless','@kenz1117/dsh-engram'],patchReload:'startup'}}}))
  await writeFile(join(profile,'cordis.yml'),'[]\n')
  const patchPath = join(profile, 'cordis.patch.yml')
  await writeFile(patchPath, [
    '- id: headless-runner',
    '  disabled: true',
    '- id: headless-startup\n  disabled: true',
    '- id: session-title-llm\n  disabled: true',
    '- id: skill-filesystem\n  disabled: true',
    '- id: settings\n  config:\n    watch: false',
    '- id: credentials\n  config:\n    watch: false',
    '- id: dsh-engram',
    '  config:',
    `    dbDir: ${JSON.stringify(snapshot)}`,
    `    modelCacheDir: ${JSON.stringify(modelCache)}`,
    "    ingest: 'off'",
    "    legacyMigration: 'conservative'",
    '- insert:',
    '    - id: architecture-lab-memory-seeder',
    `      name: ${JSON.stringify(join(project,'src/memory-seeder.mjs'))}`,
    '',
  ].join('\n'))
  // A fresh credential-free home and a minimal environment. No positional
  // prompt and no global executable; this invokes only the local memory tool.
  const env = { PATH:process.env.PATH, HOME:home, DSH_HOME:home, DSH_ARCH_SEED_FILE:recordsPath }
  const result = spawnSync(process.execPath,[runtime.bin,'--profile','seed'],{cwd:seedDir,env,encoding:'utf8',timeout:120_000})
  if (result.status !== 0) throw new Error(`${item.id}: seed failed: ${(result.stderr ?? '').slice(-2000)}`)
  const db = await readFile(join(snapshot, 'user.db'))
  const metadata = { taskId: item.id, historySha256: createHash('sha256').update(content).digest('hex'), snapshotSha256: createHash('sha256').update(db).digest('hex'), seedOutput: result.stdout.trim(), createdAt: new Date().toISOString() }
  await writeFile(join(snapshot, 'snapshot.json'), JSON.stringify(metadata, null, 2) + '\n')
  console.log(`${item.id}: ${metadata.seedOutput}`)
}
