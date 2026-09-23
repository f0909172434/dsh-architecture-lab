import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('guest cleanup rejects wrong identities, credentials and uncertain daemon state',()=>{
  execFileSync('python3',['-B','containers/test_supervisor.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'pipe'})
})
