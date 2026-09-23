export const recipes = Object.freeze({
  A: { label: '原生 DSH', memory: false, planning: false },
  B: { label: '原生 DSH + Engram', memory: true, planning: false },
  C: { label: '原生 DSH + Plan-and-Execute', memory: false, planning: true },
  D: { label: '原生 DSH + Engram + Plan-and-Execute', memory: true, planning: true },
})

export function recipe(id) {
  if (!Object.hasOwn(recipes, id)) throw new Error(`未知配方 ${id}`)
  return { id, ...recipes[id] }
}

export function trialOrder(taskIds, repetitions = 3) {
  if(!Array.isArray(taskIds)||!taskIds.length||new Set(taskIds).size!==taskIds.length||taskIds.some(id=>typeof id!=='string'||!id))throw new Error('unique task identities required')
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>3)throw new Error('repetitions must be 1-3')
  const rows = []
  // Four Williams orders balance recipe positions and predecessor pairs in
  // each complete cycle. Eighteen task/repetition blocks leave two extra orders;
  // each recipe therefore occupies each position either four or five times.
  const orders=[['A','B','D','C'],['B','C','A','D'],['C','D','B','A'],['D','A','C','B']]
  let block=0
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    // Rotate the task list too, so a stopped later repetition does not always
    // favor the same task. This deterministic rule is frozen in the protocol.
    const offset=(repetition-1)%taskIds.length
    for (const taskId of [...taskIds.slice(offset),...taskIds.slice(0,offset)]) {
      for(const id of orders[block++%4])rows.push({taskId,recipe:id,repetition})
    }
  }
  return rows
}
