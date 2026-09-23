import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

// DSH resolves this key from its own private credential store. The lab only
// checks availability here; it never copies the value into a child environment.
export async function hasIsolatedCredential(home) {
  try {
    const path = join(home, '.credentials.yaml')
    const [file, contents] = await Promise.all([stat(path), readFile(path, 'utf8')])
    if ((file.mode & 0o077) !== 0) return false
    const refs = contents.match(/^refs:\s*\n((?:^  [^\n]+\n?)*)/m)?.[1] ?? ''
    return /^  DEEPSEEK_API_KEY: sk-[^\s]+\s*$/m.test(refs)
  } catch {
    return false
  }
}
