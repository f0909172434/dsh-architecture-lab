import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { parseDay } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.equal(parseDay('2026-02-05'), Date.UTC(2026, 1, 5))
assert.equal(parseDay('2026-02-30'), null)
assert.equal(parseDay('bad'), null)
