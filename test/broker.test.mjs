import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { committedTwd, reserveDispatch, settleDispatch, dispatchBound } from '../src/broker/accounting.mjs'
import { startOfflineBroker, startModelBroker, streamUsage } from '../src/broker/server.mjs'

const pricing = () => ({ provider: 'deepseek-official', model: 'deepseek-flash', source: 'https://api-docs.deepseek.com/quick_start/pricing/', fxSource: 'https://open.er-api.com/v6/latest/USD', checkedAt: new Date().toISOString(), inputUsdPerMillion: .3, cacheHitUsdPerMillion: .006, outputUsdPerMillion: 1.2, usdTwd: 31.7 })
const body = () => ({ model: 'deepseek-flash', reasoning_effort: 'high', thinking: { type: 'enabled' }, max_tokens: 4096, stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: '修正程式' }] })
const usage = { prompt_tokens: 100, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20, completion_tokens: 10, total_tokens: 110 }
const sse = raw => `data: ${JSON.stringify({ choices: [{ delta: { content: 'offline result' } }], usage: raw })}\n\ndata: [DONE]\n\n`
async function ledger(root) { return JSON.parse(await readFile(join(root, 'budget.json'), 'utf8')) }
async function temporary(fn) {
  const root = await mkdtemp(join(tmpdir(), 'architecture-broker-test-'))
  try { await writeFile(join(root, 'pricing.json'), JSON.stringify(pricing())); await fn(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

async function setup(root, handler, durationMs) {
  const received = []
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    received.push({ auth: req.headers.authorization, body: JSON.parse(raw), url: req.url })
    handler(req, res)
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const broker = await startOfflineBroker({ root, trialId: 'offline-trial', endpoint: `http://127.0.0.1:${upstream.address().port}/chat/completions`, durationMs })
  return {
    broker, received,
    call: (payload = body(), token = broker.token, path = '/chat/completions') => fetch(broker.baseURL + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }),
    async close() { await broker.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) },
  }
}

test('raw SSE usage requires one complete well-formed metered stream', () => {
  assert.equal(streamUsage(sse(usage)).complete, true)
  for (const text of [sse(usage).replace('data: [DONE]\n\n', ''), sse(null), sse(usage) + 'data: {}\n\n', 'data: not-json\n\n' + sse(usage), sse(usage).replace('data: [DONE]', `data: ${JSON.stringify({usage})}\n\ndata: [DONE]`), sse(usage).slice(0, -2)]) {
    assert.equal(streamUsage(text).complete, false, text)
  }
})

test('v2 settles verified dispatches without releasing historical or uncertain reservations', async () => temporary(async root => {
  const historical = { id: 'old', trialId: 'old', reservedTwd: 235.29, actualTwd: .68, status: 'metered' }
  await writeFile(join(root, 'budget.json'), JSON.stringify({ capTwd: 300, entries: [historical] }))
  const p = pricing()
  const known = await reserveDispatch(root, 'new', body(), p)
  await settleDispatch(root, known.id, usage, { complete: true, requestId: 'fake-id' })
  const unknown = await reserveDispatch(root, 'new', body(), p)
  await settleDispatch(root, unknown.id, usage, { complete: false })
  const result = await ledger(root)
  assert.deepEqual(result.entries[0], historical)
  assert.equal(result.entries[1].actualTwd, .01)
  assert.equal(result.entries[2].status, 'unmetered')
  assert.equal(committedTwd(result), 235.29 + .01 + unknown.reservedTwd)
  assert.ok(known.reservedTwd < 1)
  assert.equal(result.entries[1].usage.inputTokens, 20)
  assert.equal(result.entries[1].usage.cacheReadTokens, 80)
  await assert.rejects(settleDispatch(root, known.id, usage, { complete: true }), /unknown/)
}))

test('actual dispatch counts persist across broker restart and stop the thirteenth HTTP request', async () => temporary(async root => {
  let totalReceived = 0
  for (const count of [6, 6]) {
    const state = await setup(root, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'x-request-id': 'fake-id' }); res.end(sse(usage)) })
    try {
      for (let i = 0; i < count; i++) {
        const response = await state.call()
        assert.equal(response.status, 200); assert.match(await response.text(), /offline result/)
      }
      totalReceived += state.received.length
      if (totalReceived === 12) {
        const denied = await state.call(); assert.equal(denied.status, 502); await denied.text()
        assert.equal(state.received.length, 6)
      }
      assert.ok(state.received.every(row => row.auth === 'Bearer offline-dummy-credential'))
      assert.ok(state.received.every(row => row.body.model === 'deepseek-flash'))
    } finally { await state.close() }
  }
  const result = await ledger(root)
  assert.equal(result.entries.length, 12)
  assert.ok(result.entries.every(row => row.status === 'metered' && row.actualTwd === .01))
}))

test('authentication, routes, unpriced payloads and stale prices dispatch nothing', async () => temporary(async root => {
  const state = await setup(root, (_req, res) => { res.end('unexpected') })
  try {
    for (const [payload, token, path, status] of [
      [body(), 'wrong', '/chat/completions', 401],
      [body(), state.broker.token, '/models', 404],
      [{ ...body(), model: 'another-model' }, state.broker.token, '/chat/completions', 400],
      [{ ...body(), max_tokens: 4097 }, state.broker.token, '/chat/completions', 400],
      [{ ...body(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: 'https://example.org' }] }] }, state.broker.token, '/chat/completions', 400],
    ]) {
      const response = await state.call(payload, token, path); assert.equal(response.status, status); await response.text()
    }
    await writeFile(join(root, 'pricing.json'), JSON.stringify({ ...pricing(), checkedAt: '2020-01-01' }))
    const stale = await state.call(); assert.equal(stale.status, 502); await stale.text()
    assert.equal(state.received.length, 0)
    await assert.rejects(readFile(join(root, 'budget.json')), { code: 'ENOENT' })
  } finally { await state.close() }
}))

test('malformed usage and redirected provider calls retain reservations without hidden retries', async () => temporary(async root => {
  let count = 0
  const state = await setup(root, (_req, res) => {
    count++
    if (count === 1) { res.writeHead(307, { Location: '/another-charge' }); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(sse({ ...usage, prompt_cache_hit_tokens: 500 }))
  })
  try {
    let response = await state.call(); assert.equal(response.status, 502); await response.text()
    response = await state.call(); assert.equal(response.status, 200); await response.text()
    assert.equal(count, 2)
    assert.ok((await ledger(root)).entries.every(row => row.status === 'unmetered'))
  } finally { await state.close() }
}))

test('budget and ten-minute limits survive restart; bound violations block further dispatch', async () => temporary(async root => {
  const p = pricing(), request = body()
  assert.ok(dispatchBound(request, p) > 0)
  await writeFile(join(root, 'budget.json'), JSON.stringify({ capTwd: 300, entries: [{ reservedTwd: 299.99, trialId: 'old', at: new Date().toISOString() }] }))
  await assert.rejects(reserveDispatch(root, 'new', request, p), /budget/)
  await writeFile(join(root, 'budget.json'), JSON.stringify({ capTwd: 300, entries: [{ reservedTwd: 1, trialId: 'expired', at: new Date(Date.now()-600_001).toISOString() }] }))
  await assert.rejects(reserveDispatch(root, 'expired', request, p), /deadline/)
  const call = await reserveDispatch(root, 'new', request, p)
  await settleDispatch(root, call.id, { ...usage, completion_tokens: 1_000_000, total_tokens: 1_000_100 }, { complete: true })
  assert.equal((await ledger(root)).entries.at(-1).boundExceeded, true)
  await assert.rejects(reserveDispatch(root, 'next', request, p), /audit/)
}))

test('closing a broker aborts pending calls while retaining unknown cost', async () => temporary(async root => {
  let started
  const arrived = new Promise(resolve => { started = resolve })
  const state = await setup(root, () => started())
  try {
    const pending = state.call().then(response => response.text(), () => 'aborted')
    await arrived
    await state.broker.close()
    await pending
    const result = await ledger(root)
    assert.equal(result.entries.length, 1)
    assert.equal(result.entries[0].status, 'unmetered')
  } finally { await state.close() }
}))

test('live broker remains held and offline broker rejects public endpoints', async () => {
  await assert.rejects(startModelBroker({}), /實機試驗暫停/)
  await assert.rejects(startOfflineBroker({ endpoint: 'https://api.deepseek.com/chat/completions' }), /loopback/)
})
