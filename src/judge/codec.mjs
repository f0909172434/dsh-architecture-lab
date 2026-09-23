/** Preserve distinctions JSON normally collapses (undefined, NaN, null, -0).
 * This module contains no task expectations and can be read by the worker.
 */
export function encode(value, seen = new WeakSet()) {
  if (value === null) return ['null']
  if (value === undefined) return ['undefined']
  if (typeof value === 'number') return ['number', Number.isNaN(value) ? 'NaN' : Object.is(value, -0) ? '-0' : !Number.isFinite(value) ? String(value) : value]
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value]
  if (typeof value !== 'object') throw new Error('unsupported return type')
  if (seen.has(value)) throw new Error('cyclic return value')
  seen.add(value)
  try {
    if (Array.isArray(value)) return ['array', Array.from(value, (item) => encode(item, seen))]
    return ['object', Object.keys(value).sort().map((key) => [key, encode(value[key], seen)])]
  } finally { seen.delete(value) }
}
