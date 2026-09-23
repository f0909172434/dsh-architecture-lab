import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { selectedRecipe: 'A', trials: [], run: null }
    throw error
  }
}

export async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n')
  await rename(temporary, path)
}

export async function markInterrupted(path) {
  const state = await readState(path)
  if (state.run?.status === 'running') {
    if (Number.isInteger(state.run.pid)) {
      try { process.kill(state.run.pid, 0); return state } catch (error) {
        if (error.code !== 'ESRCH') return state
      }
    }
    state.run.status = 'interrupted'
    state.run.finishedAt = new Date().toISOString()
    await writeState(path, state)
  }
  return state
}
