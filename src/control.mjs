import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

/** Trial-specific capability prevents cancellation of an unrelated reused PID. */
export async function openControl(runId, abort) {
  const token = randomBytes(32).toString('hex')
  const server = createServer((req, res) => {
    const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401); res.end(); return }
    if(req.headers['x-architecture-run-id']!==runId){res.writeHead(409);res.end();return}
    if (req.url !== '/health' && req.url !== '/stop') { res.writeHead(404); res.end(); return }
    if ((req.url === '/health' && req.method !== 'GET') || (req.url === '/stop' && req.method !== 'POST')) { res.writeHead(405); res.end(); return }
    if (req.url === '/stop') abort()
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ runId, stopping: req.url === '/stop' }))
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    descriptor: { url: `http://127.0.0.1:${server.address().port}`, token },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) },
  }
}

export async function contactControl(active, action = 'health') {
  const endpoint = new URL(active.control?.url ?? 'https://invalid.example')
  if (!['health','stop'].includes(action) || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.pathname !== '/' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^[a-f0-9]{64}$/.test(active.control?.token ?? '')) throw new Error('invalid run control identity')
  const response = await fetch(`${endpoint.href}${action}`, { method: action === 'stop' ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(1500), headers: { Authorization: `Bearer ${active.control.token}`, 'x-architecture-run-id': active.runId } })
  if (response.status !== 200) throw new Error('run control identity rejected')
  const body = await response.json()
  if (body.runId !== active.runId) throw new Error('run control identity mismatch')
  return body
}
