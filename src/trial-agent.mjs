// Loaded only in the dedicated jailed runtime. Management UI/model calls remain
// held by plugin.mjs; this adapter accepts only a scoped loopback broker token.
import { completionInstructionFor } from './completion-protocol.mjs'
export const name = 'architecture-lab-trial-agent'
export const inject = ['systemPrompt']
export function validateTrialEnvironment(env=process.env) {
  const endpoint = new URL(env.DEEPSEEK_BASE_URL ?? 'https://invalid.example')
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || !/^[a-f0-9]{64}$/.test(env.DEEPSEEK_API_KEY ?? '')) throw new Error('trial requires a scoped local broker')
}
export function pinTrialRequest(options) {
  if (options.provider !== 'deepseek-official' || options.model !== 'deepseek-flash') throw new Error('trial model route is not pinned')
  // Engram's rewrite client omits effort. Pin this known auxiliary call to the
  // same model/effort and broker; do not silently change explicitly set routes.
  if (options.purpose === 'engram-rewrite' && options.reasoningEffort === undefined) options.reasoningEffort = 'high'
  if (options.reasoningEffort !== 'high') throw new Error('trial model route is not pinned')
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1 || options.maxTokens > 4096) throw new Error('trial output limit is not pinned')
}
export function apply(ctx,{purpose='research'}={}) {
  validateTrialEnvironment()
  const instruction=completionInstructionFor(purpose)
  ctx.systemPrompt.section({name:'architecture-lab:completion',order:90,text:()=>instruction})
  ctx.on('agent/request', async (_request, next) => ({ ...(await next()), maxTokens: 4096 }), { global: true })
  ctx.on('llm/stream', (options, next) => {
    pinTrialRequest(options)
    return next()
  }, { global: true })
}
