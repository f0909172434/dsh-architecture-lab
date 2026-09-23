import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { normalizeAmount } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.equal(normalizeAmount('1,234.50'), 1234.5)
assert.equal(normalizeAmount('0'), 0)
assert.equal(normalizeAmount('abc'), null)
assert.equal(normalizeAmount('1,2,3'), null)
