import { join } from 'node:path'
import { project } from '../runtime.mjs'

// Experiment output directories are selectable; the user's single NT$300
// allowance is not. A new data root must never create fresh live headroom.
export const authoritativeBudgetRoot=join(project,'state')
export function ledgerRootFor(experimentRoot,mode){
  if(mode==='live')return authoritativeBudgetRoot
  if(mode==='offline')return join(experimentRoot,'v2','offline-budget')
  throw new Error('unknown accounting mode')
}
