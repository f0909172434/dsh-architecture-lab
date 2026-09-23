// This process is untrusted after importing the candidate. It receives inputs
// only. The parent retains every expected value and makes the pass/fail decision.
import { pathToFileURL } from 'node:url'
import { encode } from './codec.mjs'

const stringify = JSON.stringify.bind(JSON)
const write = process.stdout.write.bind(process.stdout)
let input = ''
for await (const chunk of process.stdin) input += chunk
const request = JSON.parse(input)
const candidate = await import(pathToFileURL(process.argv[2]).href)
const fn = candidate[request.exportName]
if (typeof fn !== 'function') throw new Error('required export is not a function')
const results = []
for (const args of request.inputs) {
  try { results.push({ kind: 'value', value: encode(await fn(...args)) }) }
  catch { results.push({ kind: 'error' }) }
}
write(stringify({ protocol: 'architecture-lab-values-v1', results }) + '\n')
