import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rename, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasIsolatedCredential, readIsolatedCredential } from '../src/credential.mjs'

test('credential store rejects broad permissions, symlinks and unrelated YAML sections', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lab-credential-test-'))
  const path=join(root,'.credentials.yaml'),synthetic='sk-synthetic-offline-test'
  try{
    await writeFile(path,`refs:\n  DEEPSEEK_API_KEY: ${synthetic}\n`,{mode:0o600})
    assert.equal(await readIsolatedCredential(root),synthetic)
    await chmod(path,0o644)
    assert.equal(await hasIsolatedCredential(root),false)
    await chmod(path,0o600)
    await rename(path,join(root,'source'))
    await symlink(join(root,'source'),path)
    await assert.rejects(readIsolatedCredential(root),/unavailable/)
    await rm(path)
    await writeFile(path,`other:\n  DEEPSEEK_API_KEY: ${synthetic}\n`,{mode:0o600})
    assert.equal(await hasIsolatedCredential(root),false)
  }finally{await rm(root,{recursive:true,force:true})}
})
