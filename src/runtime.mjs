import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const project = fileURLToPath(new URL('../', import.meta.url))
export async function versions() { return JSON.parse(await readFile(join(project, 'versions.json'), 'utf8')) }
export async function harness() {
  const pinned = await versions()
  const runtimeRoot = join(project, 'state', 'runtime', pinned.harness)
  const packageRoot = join(runtimeRoot, 'node_modules', '@deepseek-ai/dsh')
  let installed
  try { installed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) }
  catch { throw new Error('pinned isolated Harness is not installed; run npm run runtime') }
  if (installed.version !== pinned.harness) throw new Error('isolated Harness version mismatch')
  return { version: installed.version, root: runtimeRoot, bin: join(packageRoot, 'lib/bin.js') }
}

/** Templates are JSON or YAML with double-quoted paths, so JSON escaping also
 * handles spaces, apostrophes, backslashes and quotes without shell evaluation.
 */
export function renderProfile(text, { projectRoot, stateRoot }) {
  const escape = value => JSON.stringify(value).slice(1, -1)
  return text.replaceAll('__PROJECT_ROOT__', () => escape(projectRoot)).replaceAll('__LAB_ROOT__', () => escape(stateRoot))
}
