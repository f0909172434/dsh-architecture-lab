import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { judge } from '../src/judge/index.mjs'
import { encode } from '../src/judge/codec.mjs'
import { runIsolatedNode, seatbeltProfile } from '../src/isolation/seatbelt.mjs'

const supported = process.platform === 'darwin'
const isolatedTest = (name, fn) => test(name, { skip: !supported && 'macOS kernel boundary required' }, fn)
const project = fileURLToPath(new URL('../', import.meta.url))
import { references } from './reference-solutions.mjs'

async function temporary(fn) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'architecture-judge-test-')))
  try { return await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('typed values cannot collapse undefined, nonfinite numbers, negative zero and null', () => {
  const values = [undefined, null, NaN, Infinity, -Infinity, -0, 0, '0', false, [], {}]
  assert.equal(new Set(values.map(x => JSON.stringify(encode(x)))).size, values.length)
  assert.deepEqual(encode({ b: 2, a: 1 }), encode({ a: 1, b: 2 }))
  const cycle = {}; cycle.self = cycle
  assert.throws(() => encode(cycle), /cyclic/)
})

isolatedTest('all six reference implementations pass and all original defects fail', async () => {
  await temporary(async root => {
    for (const [id, source] of Object.entries(references)) {
      await writeFile(join(root, 'index.mjs'), source)
      const good = await judge(id, root)
      assert.equal(good.pass, true, `${id}: ${JSON.stringify(good)}`)
      const bad = await judge(id, join(project, 'tasks', id, 'fixture'))
      assert.equal(bad.status, 'failed', `${id}: ${JSON.stringify(bad)}`)
      assert.ok(bad.failedCases?.length, `${id}: original defect must fail a value comparison`)
    }
  })
})

isolatedTest('early exits, forged pass flags, incomplete output, exceptions and resource exhaustion fail closed', async () => {
  await temporary(async root => {
    const sources = [
      'process.exit(0)',
      `console.log('not-json'); process.exit(0)`,
      `console.log(JSON.stringify({pass:true,protocol:'architecture-lab-values-v1',results:[]})); process.exit(0)`,
      `console.log(JSON.stringify({protocol:'architecture-lab-values-v1',results:Array(7).fill({kind:'value',value:['number',0]})})); process.exit(0)`,
      'export const wrongName = () => 0',
      'export const serviceFee = () => { throw new Error("bad") }',
      'export const serviceFee = () => undefined',
      'export const serviceFee = () => NaN',
      'while (true) {}',
      'process.stdout.write("x".repeat(1024*1024));',
    ]
    for (const source of sources) {
      await writeFile(join(root, 'index.mjs'), source)
      const result = await judge('stale-fee', root, { timeoutMs: 750 })
      assert.equal(result.pass, false, source)
      assert.equal(result.status, 'failed', JSON.stringify(result))
    }
  })
})

isolatedTest('judge cannot read siblings, expected values, or symlink escapes; cannot write or fork', async () => {
  await temporary(async root => {
    const workspace = join(root, 'workspace'); await mkdir(workspace)
    const secret = join(root, 'other-trial.txt'); await writeFile(secret, 'dummy-private-marker')
    await symlink(secret, join(workspace, 'escape'))
    await writeFile(join(workspace, 'helper.mjs'), 'export const value = 42')
    const script = join(workspace, 'probe.mjs')
    await writeFile(script, `
      import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
      import {spawnSync} from 'node:child_process';
      import {value} from './helper.mjs';
      const attempt = fn => {try {fn();return 'ALLOWED'} catch(e){return e.code}};
      console.log(JSON.stringify({
        positive:value,
        sibling:attempt(()=>readFileSync(${JSON.stringify(secret)})),
        expectations:attempt(()=>readFileSync(${JSON.stringify(join(project, 'tasks/cases.mjs'))})),
        symlink:attempt(()=>readFileSync('./escape')),
        enumeration:attempt(()=>readdirSync(${JSON.stringify(root)})),
        outsideWrite:attempt(()=>writeFileSync(${JSON.stringify(secret)},'changed')),
        insideWrite:attempt(()=>writeFileSync('./helper.mjs','changed')),
        fork:spawnSync(process.execPath,['-e','process.exit(0)']).error?.code,
        inheritedSecret:process.env.ARCHITECTURE_TEST_SECRET ?? null,
        injectedLoader:process.env.NODE_OPTIONS ?? null
      }));
    `)
    const previous = process.env.ARCHITECTURE_TEST_SECRET
    process.env.ARCHITECTURE_TEST_SECRET = 'dummy-environment-marker'
    let result
    try { result = await runIsolatedNode({ script, cwd: workspace }) }
    finally { previous === undefined ? delete process.env.ARCHITECTURE_TEST_SECRET : process.env.ARCHITECTURE_TEST_SECRET = previous }
    assert.equal(result.status, 0, result.stderr)
    const probe = JSON.parse(result.stdout)
    assert.equal(probe.positive, 42)
    for (const key of ['sibling', 'expectations', 'symlink', 'enumeration', 'outsideWrite', 'insideWrite', 'fork']) {
      assert.ok(['EPERM', 'EACCES'].includes(probe[key]), `${key}: ${probe[key]}`)
    }
    assert.equal(probe.inheritedSecret, null)
    assert.equal(probe.injectedLoader, null)
    assert.equal(await readFile(secret, 'utf8'), 'dummy-private-marker')
    assert.equal(await readFile(join(workspace, 'helper.mjs'), 'utf8'), 'export const value = 42')
  })
})

isolatedTest('judge network is denied even for a reachable loopback listener', async () => {
  const server = createServer(socket => socket.end())
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await temporary(async root => {
      const script = join(root, 'probe.mjs')
      await writeFile(script, `import {connect} from 'node:net';
        const s=connect({host:'127.0.0.1',port:${server.address().port}});
        s.on('connect',()=>{console.log('ALLOWED');s.destroy()});
        s.on('error',e=>console.log(e.code));
        s.setTimeout(500,()=>{console.log('TIMEOUT');s.destroy()});`)
      const result = await runIsolatedNode({ script, cwd: root })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout.trim(), /^(EPERM|EACCES)$/)
    })
  } finally { await new Promise(resolve => server.close(resolve)) }
})

isolatedTest('unsafe grants and invalid broker ports are rejected', async () => {
  for (const path of ['/', '/Users', '/private', tmpdir()]) {
    await assert.rejects(seatbeltProfile({ readOnly: [path] }), /broad/)
  }
  await assert.rejects(seatbeltProfile({ readOnly: ['relative'] }), /absolute/)
  await assert.rejects(seatbeltProfile({ loopbackPort: 0 }), /port/)
  await temporary(async root => {
    await assert.rejects(seatbeltProfile({ executables: [root] }), /files/)
    const link = join(root, 'broad-link'); await symlink('/', link)
    await assert.rejects(seatbeltProfile({ readOnly: [link] }), /broad/)
  })
})

test('unsupported hosts cannot silently run an unrestricted judge', { skip: supported }, async () => {
  const result = await judge('stale-fee', process.cwd())
  assert.equal(result.pass, false)
  assert.equal(result.status, 'unavailable')
})
