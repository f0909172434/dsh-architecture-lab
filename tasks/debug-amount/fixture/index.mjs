export function normalizeAmount(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
