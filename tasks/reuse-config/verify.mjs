import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { resolveConfig } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.deepEqual(resolveConfig({ mode: 'safe', flags: { a: true, b: false } }, { mode: 'fast', flags: { b: true } }), { mode: 'fast', flags: { a: true, b: true } })
assert.deepEqual(resolveConfig({ mode: 'safe', flags: { a: true } }, {}), { mode: 'safe', flags: { a: true } })
