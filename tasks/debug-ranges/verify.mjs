import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { mergeRanges } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.deepEqual(mergeRanges([[4, 6], [1, 4], [10, 11]]), [[1, 6], [10, 11]])
assert.deepEqual(mergeRanges([[1, 3], [2, 7]]), [[1, 7]])
assert.deepEqual(mergeRanges([]), [])
