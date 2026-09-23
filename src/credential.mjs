import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

/** Read only the isolated store through one descriptor. Neither logs nor child
 * environments receive this value. Reject links and permissive file modes. */
export async function readIsolatedCredential(home) {
  let handle
  try {
    handle = await open(join(home, '.credentials.yaml'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const file = await handle.stat()
    if (!file.isFile() || (file.mode & 0o077) !== 0 || file.size > 65536) throw new Error('invalid store')
    const contents = await handle.readFile('utf8')
    const refs = contents.match(/^refs:\s*\n((?:^  [^\n]+\n?)*)/m)?.[1] ?? ''
    const key = refs.match(/^  DEEPSEEK_API_KEY: (sk-[^\s]+)\s*$/m)?.[1]
    if (!key) throw new Error('missing key')
    return key
  } catch {
    throw new Error('isolated credential unavailable or permissions are too broad')
  } finally {
    await handle?.close()
  }
}

export async function hasIsolatedCredential(home) {
  try { await readIsolatedCredential(home); return true }
  catch { return false }
}
