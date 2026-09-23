export function parseDay(day) {
  const date = new Date(day + 'T00:00:00')
  return Number.isNaN(date.valueOf()) ? null : date.valueOf()
}
