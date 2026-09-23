// Loaded only in the dedicated jailed runtime. Management UI/model calls remain
// held by plugin.mjs; this adapter accepts only a scoped loopback broker token.
export const name = 'architecture-lab-trial-agent'
export const inject = []
export function validateTrialEnvironment(env=process.env) {
  const endpoint = new URL(env.DEEPSEEK_BASE_URL ?? 'https://invalid.example')
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || !/^[a-f0-9]{64}$/.test(env.DEEPSEEK_API_KEY ?? '')) throw new Error('trial requires a scoped local broker')
}
export function apply(ctx) {
  validateTrialEnvironment()
  ctx.on('agent/request', async (_request, next) => ({ ...(await next()), maxTokens: 4096 }), { global: true })
  ctx.on('llm/stream', (options, next) => {
    if (options.provider !== 'deepseek-official' || options.model !== 'deepseek-flash' || options.reasoningEffort !== 'high') throw new Error('trial model route is not pinned')
    return next()
  }, { global: true })
}
