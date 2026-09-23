import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadPricing } from '../budget.mjs'
import { assertLiveReady, assertDailyReady } from '../readiness.mjs'
import { reserveDispatch, settleDispatch } from './accounting.mjs'
import { authoritativeBudgetRoot } from './location.mjs'

const MAX_BODY = 1024 * 1024
const MAX_RESPONSE = 4 * 1024 * 1024
const allowedFields = new Set(['model', 'messages', 'stream', 'stream_options', 'thinking', 'reasoning_effort', 'tools', 'temperature', 'max_tokens', 'stop', 'dsh_plugin_packages'])

export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedFields.has(key))) throw new Error('unsupported request')
  if (body.stream !== true || body.stream_options?.include_usage !== true) throw new Error('metered streaming required')
  if (body.model !== 'deepseek-flash' || body.reasoning_effort !== 'high' || body.thinking?.type !== 'enabled') throw new Error('unpinned model or reasoning')
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 4096) throw new Error('invalid output limit')
  if (!Array.isArray(body.messages) || !body.messages.length) throw new Error('missing messages')
  for (const message of body.messages) {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) throw new Error('invalid role')
    if (message.content !== null && typeof message.content !== 'string') throw new Error('only text messages are priced')
    if (Object.keys(message).some(key => !['role', 'content', 'tool_calls', 'tool_call_id', 'reasoning_content', 'name'].includes(key))) throw new Error('unsupported message')
  }
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some(tool => tool?.type !== 'function'))) throw new Error('only function tools are supported')
  if (body.dsh_plugin_packages !== undefined) {
    const inventory=body.dsh_plugin_packages
    if (inventory?.version!==1 || !Array.isArray(inventory.packages) || inventory.packages.some(item=>typeof item?.name!=='string'||typeof item?.version!=='string')) throw new Error('invalid Harness package inventory')
  }
  return body
}

/** Parse only complete SSE events. A missing terminal marker, malformed event,
 * duplicate usage, or noncanonical usage keeps the entire reservation charged.
 */
export function streamUsage(text) {
  let usage, count = 0, done = false, malformed = false
  const events = text.replaceAll('\r\n', '\n').split('\n\n')
  if (events.at(-1).trim()) malformed = true
  for (const event of events.slice(0, -1)) {
    const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) continue
    if (done) { malformed = true; continue }
    if (data === '[DONE]') { done = true; continue }
    try {
      const chunk = JSON.parse(data)
      if (chunk.usage != null) { usage = chunk.usage; count++ }
      if (chunk.error) malformed = true
    } catch { malformed = true }
  }
  return { usage, complete: done && !malformed && count === 1 }
}

async function start({ root, trialId, apiKey, endpoint, durationMs = 600_000 }) {
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 600_000) throw new Error('invalid trial duration')
  if (typeof apiKey !== 'string' || !apiKey || /[\r\n]/.test(apiKey)) throw new Error('invalid provider credential')
  await loadPricing(root)
  const token = randomBytes(32).toString('hex')
  const deadline = Date.now() + durationMs
  const controllers = new Set(), jobs = new Set()
  let closing = false, busy = false
  const errorReply = (res, code, message) => {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: { message } }))
  }
  const handle = async (req, res) => {
    // Authenticate before reading bodies, allocating reservations, or forwarding.
    const auth = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return errorReply(res, 401, 'invalid trial token')
    if (req.method !== 'POST' || req.url !== '/chat/completions') return errorReply(res, 404, 'unsupported route')
    if (closing || Date.now() >= deadline) return errorReply(res, 410, 'trial deadline reached')
    if (busy) return errorReply(res, 409, 'one dispatch at a time')
    busy = true
    const controller = new AbortController(); controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()))
    const disconnect = () => { if (!res.writableFinished) controller.abort() }
    res.once('close', disconnect)
    // Also end incomplete request uploads on timeout/cancel.
    const abort = () => { if (!req.complete) req.destroy(); res.destroy() }
    controller.signal.addEventListener('abort', abort, { once: true })
    let reservation, rawUsage, complete = false, requestId, failed = false
    try {
      const bodyChunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY) { errorReply(res, 413, 'request too large'); return }
        bodyChunks.push(Buffer.from(chunk))
      }
      let body
      try {
        body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8'))
        validateRequest(body)
      } catch (error) {
        // Structural diagnostics only; no prompt text, credentials or provider
        // response is copied into validation diagnostics.
        await appendFile(join(root,'broker-rejections.jsonl'),JSON.stringify({
          at:new Date().toISOString(), reason: error instanceof SyntaxError ? 'invalid JSON' : error.message,
          fields:body && typeof body === 'object' ? Object.keys(body) : [],
          messageShapes:Array.isArray(body?.messages) ? body.messages.map(message=>({keys:Object.keys(message ?? {}),contentType:Array.isArray(message?.content)?'array':typeof message?.content})) : [],
        })+'\n',{mode:0o600})
        return errorReply(res, 400, 'invalid or unpriced request')
      }
      if (controller.signal.aborted || Date.now() >= deadline) return errorReply(res, 410, 'trial deadline reached')
      const pricing = await loadPricing(root)
      reservation = await reserveDispatch(root, trialId, body, pricing)
      const evidence = join(root, 'broker-evidence'); await mkdir(evidence, { recursive: true })
      await writeFile(join(evidence, `${reservation.id}.request.json`), JSON.stringify(body) + '\n', { flag: 'wx', mode: 0o600 })
      // Fetch does not retry HTTP requests. Redirects are errors so one recorded
      // dispatch can never silently become two requests or change destinations.
      const upstream = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
      requestId = upstream.headers.get('x-request-id')
      if (upstream.status !== 200 || !upstream.headers.get('content-type')?.startsWith('text/event-stream')) {
        await upstream.body?.cancel()
        throw new Error('provider response unavailable')
      }
      // Buffer the bounded response before returning it. Completion and durable
      // settlement precede delivery, so a retry cannot race an unsettled call.
      const chunks = []; let bytes = 0
      for await (const chunk of upstream.body) {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE) throw new Error('provider response too large')
        chunks.push(Buffer.from(chunk))
      }
      const output = Buffer.concat(chunks)
      const parsed = streamUsage(output.toString('utf8')); rawUsage = parsed.usage; complete = parsed.complete
      await writeFile(join(evidence, `${reservation.id}.sse`), output, { flag: 'wx', mode: 0o600 })
      await settleDispatch(root, reservation.id, rawUsage, { complete, requestId }); reservation = null
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); res.end(output)
    } catch {
      // Do not reflect provider bodies/errors, credentials, prompts or paths.
      failed = true
    } finally {
      if (reservation) {
        try { await settleDispatch(root, reservation.id, null, { complete: false, requestId }) }
        catch { /* Durable reserved entry remains charged if settlement fails. */ }
      }
      clearTimeout(timer); controllers.delete(controller); busy = false
      controller.signal.removeEventListener('abort', abort); res.off('close', disconnect)
      if (failed) errorReply(res, 502, 'dispatch stopped; inspect the private broker ledger')
    }
  }
  const server = createServer((req, res) => {
    const job = handle(req, res); jobs.add(job); job.finally(() => jobs.delete(job))
  })
  server.requestTimeout = durationMs; server.headersTimeout = Math.min(10_000, durationMs)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  return {
    baseURL: `http://127.0.0.1:${port}`, port, token,
    async close() {
      closing = true
      for (const controller of controllers) controller.abort()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      await Promise.allSettled([...jobs])
    },
  }
}

/** Live path stays gated until the whole DSH process is demonstrably jailed. */
export async function startModelBroker(options) {
  assertLiveReady()
  if(resolve(options.root)!==authoritativeBudgetRoot)throw new Error('live calls must use the original shared budget ledger')
  return start({ ...options, endpoint: 'https://api.deepseek.com/chat/completions' })
}

export async function startDailyModelBroker(options){
  assertDailyReady()
  if(resolve(options.root)!==authoritativeBudgetRoot||!/^daily-[a-f0-9-]{36}$/.test(options.trialId))throw new Error('daily calls require the original budget and a daily task identity')
  return start({...options,endpoint:'https://api.deepseek.com/chat/completions'})
}

/** No real key accepted and no public endpoint reachable through this helper. */
export async function startOfflineBroker({ root, trialId, endpoint, durationMs }) {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) throw new Error('offline provider must be loopback')
  return start({ root, trialId, endpoint: url.href, durationMs, apiKey: 'offline-dummy-credential' })
}
