import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'architecture-lab-planner-runner'
export const inject = ['headlessStartup', 'agentDefaultModel', 'agents', 'sessions', 'commands', 'userQuestions']

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function phaseAt(cwd, id) {
  try { return JSON.parse(await readFile(join(cwd, '.pae', id, 'orchestrator.json'), 'utf8')).phase } catch { return null }
}

function lastOutcome(events) {
  return [...events].reverse().find((event) => event.type === 'turn/end')?.data?.reason
}

function lastText(events) {
  return [...events].reverse().find((event) => event.type === 'assistant/message')?.data?.message?.content?.filter((block) => block.type === 'text').map((block) => block.text).join('') ?? ''
}

export function apply(ctx) {
  // The batch protocol approves only the plugin's explicit plan-review gate.
  // Other questions must fail rather than silently impersonating a user.
  ctx.on('user-questions/request', (request, next) => {
    const answers = []
    for (const question of request.questions) {
      if (question.intent?.kind === 'plan-review') {
        answers.push({ id: question.id, selected: [question.intent.approve] })
      } else if (question.id?.startsWith('pae-') && question.options?.some((option) => option.label === '终止')) {
        process.stderr.write(`[architecture-lab] unexpected planning question: ${JSON.stringify(question)}\n`)
        answers.push({ id: question.id, selected: ['终止'] })
      } else return next()
    }
    return Promise.resolve({ answers })
  }, { global: true })

  const exit = ctx.get('appExit')
  if (typeof exit !== 'function') throw new Error('planner runner requires appExit')
  const run = async () => {
    await ctx.get('loader')?.await()
    const task = ctx.headlessStartup.task
    const selection = ctx.agentDefaultModel.currentSelection()
    if (selection.provider !== 'deepseek-official' || selection.model !== 'deepseek-flash' || selection.reasoningEffort !== 'high') throw new Error('model selection differs from pinned DeepSeek Flash/high')
    const cwd = process.cwd()
    const { agent } = await ctx.agents.create({
      sessionId: `session-${randomUUID()}`,
      meta: { cwd },
      agentOptions: { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort },
    })
    await agent.whenIdle()
    const result = await ctx.commands.execute(agent, `/plan-and-execute ${task}`, [], new AbortController().signal)
    if (result?.result?.kind !== 'success') throw new Error(`plan command failed: ${result?.result?.text ?? 'not found'}`)
    const deadline = Date.now() + 9 * 60_000
    let phase
    while (Date.now() < deadline) {
      await agent.whenIdle()
      phase = await phaseAt(cwd, String(agent.id))
      if (phase === 'completed' || phase === 'aborted') break
      const outcome = lastOutcome(agent.session.snapshotEvents())
      if (outcome?.kind === 'error' || outcome?.kind === 'aborted') break
      await wait(250)
    }
    await ctx.sessions.flush(agent.session)
    const events = agent.session.snapshotEvents()
    process.stdout.write(lastText(events) + '\n')
    process.stderr.write(`[architecture-lab] planning phase: ${phase ?? 'missing'}\n`)
    exit(phase === 'completed' && lastOutcome(events)?.kind === 'completed' ? 0 : 1)
  }
  run().catch((error) => { process.stderr.write(`[architecture-lab] ${error.message}\n`); exit(1) })
}
