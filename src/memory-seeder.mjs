import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const name = 'architecture-lab-memory-seeder'
export const inject = ['tools']

export function apply(ctx) {
  ctx.on('llm/stream',()=>{throw new Error('memory seeding forbids model calls')},{global:true})
  const exit = ctx.get('appExit')
  if (typeof exit !== 'function') throw new Error('memory seeder requires appExit')
  const run = async () => {
    await ctx.get('loader')?.await()
    const file = process.env.DSH_ARCH_SEED_FILE
    if (!file) throw new Error('DSH_ARCH_SEED_FILE is required')
    const records = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(records) || records.length < 1 || records.length > 10) throw new Error('seed file must contain 1-10 records')
    for (const record of records) {
      if (typeof record.content !== 'string' || !['fact', 'preference', 'decision', 'episode', 'skill'].includes(record.kind)) throw new Error('invalid seed record')
      const result = await ctx.tools.execute({
        callId: `seed-${randomUUID()}`,
        name: 'engram_save',
        arguments: { content: record.content, kind: record.kind, scope: 'user' },
        signal: new AbortController().signal,
      })
      if (result.isError || !result.value?.id) throw new Error(`engram_save failed: ${JSON.stringify(result).slice(0, 1000)}`)
    }
    process.stdout.write(JSON.stringify({ saved: records.length }) + '\n')
    exit(0)
  }
  run().catch((error) => { process.stderr.write(`[architecture-lab] ${error.message}\n`); exit(1) })
}
