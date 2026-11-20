// What is left of the advent calendar (the Christmas theme is gone): an older profile may still
// carry S.advent, and two devices' copies keep merging the way they always did (lib/sync-merge.js).
const DOORS = 24
const REPS_MAX = 999

const isDay = n => Number.isInteger(n) && n >= 1 && n <= DOORS
const days = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(isDay))].sort((a, b) => a - b)
function repsOf(v, opened) {
  const out = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, n] of Object.entries(v)) {
    const d = Number(k), c = Math.floor(Number(n))
    if (isDay(d) && opened.includes(d) && c > 0) out[d] = Math.min(c, REPS_MAX)
  }
  return out
}

/** The stored value made safe: { year, opened, done[, reps] }, or null for anything unusable. */
export function cleanAdvent(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const year = Number(v.year)
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null
  const opened = days(v.opened)
  // A door's thing is only ever done behind a door that is open, and a done door counts no more.
  const done = days(v.done).filter(d => opened.includes(d))
  const reps = repsOf(v.reps, opened)
  for (const d of done) delete reps[d]
  return Object.keys(reps).length ? { year, opened, done, reps } : { year, opened, done }
}

export function mergeAdvent(a, b) {
  const x = cleanAdvent(a), y = cleanAdvent(b)
  if (!x || !y) return x || y || undefined
  if (x.year !== y.year) return x.year > y.year ? x : y
  const reps = { ...(x.reps || {}) }
  for (const [d, n] of Object.entries(y.reps || {})) reps[d] = Math.max(reps[d] || 0, n)
  return cleanAdvent({ year: x.year, opened: [...x.opened, ...y.opened], done: [...x.done, ...y.done], reps })
}
