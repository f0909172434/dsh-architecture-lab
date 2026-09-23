import { DatabaseSync } from 'node:sqlite'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const registryPath = root => join(root, 'v2', 'registry.sqlite')
const empty = root => {
  let selectedRecipe='A'
  try {const selected=JSON.parse(readFileSync(join(root,'lab-state.json'),'utf8')).selectedRecipe;if(['A','B','C','D'].includes(selected))selectedRecipe=selected} catch(error){if(error.code!=='ENOENT')throw error}
  return {schemaVersion:2,revision:0,selectedRecipe,runs:[],active:null}
}

function parse(row,root) {
  if (!row) return empty(root)
  const state = JSON.parse(row.value)
  if (state.schemaVersion !== 2 || !Array.isArray(state.runs)) throw new Error('unsupported lab registry')
  return state
}

export function readRegistry(root) {
  const path = registryPath(root)
  if (!existsSync(path)) return empty(root)
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registry'").get())return empty(root)
    return parse(db.prepare('SELECT value FROM registry WHERE id = 1').get(),root)
  }
  finally { db.close() }
}

/** SQLite serializes independent CLI/UI writers and releases its transaction
 * lock on process death. Legacy JSON state and the real budget are untouched.
 * The callback is synchronous; no external work is performed inside a lock.
 */
export function updateRegistry(root, update) {
  const path = registryPath(root)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  try {
    chmodSync(path, 0o600)
    db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS registry (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
    db.exec('BEGIN IMMEDIATE')
    const state = parse(db.prepare('SELECT value FROM registry WHERE id=1').get(),root)
    const result = update(state)
    if (result && typeof result.then === 'function') throw new Error('registry callback must be synchronous')
    state.revision++
    db.prepare('INSERT INTO registry(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(state))
    db.exec('COMMIT')
    return result
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  } finally { db.close() }
}

export function visibleRegistry(state) {
  return { ...state, active: state.active ? { ...state.active, control: undefined } : null }
}
