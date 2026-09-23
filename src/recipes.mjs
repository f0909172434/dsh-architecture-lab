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
  const rows = []
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const rotated = ['A', 'B', 'C', 'D'].slice((repetition - 1) % 4)
    rotated.push(...['A', 'B', 'C', 'D'].slice(0, (repetition - 1) % 4))
    for (const taskId of taskIds) for (const id of rotated) rows.push({ taskId, recipe: id, repetition })
  }
  return rows
}
