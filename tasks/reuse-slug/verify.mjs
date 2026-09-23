import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { slugify } = await import(pathToFileURL(process.argv[2] + '/index.mjs'))
assert.equal(slugify('  Café   au Lait  '), 'cafe-au-lait')
assert.equal(slugify('Hello\tWorld'), 'hello-world')
assert.equal(slugify('A--B'), 'a-b')
