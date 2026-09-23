import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { serviceFee } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.equal(serviceFee(10000), 800)
assert.equal(serviceFee(101), 8)
assert.equal(serviceFee(106), 8)
