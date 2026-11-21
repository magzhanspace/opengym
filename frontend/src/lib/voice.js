// Spoken and typed weights (v1.4.4): what an opengym://weigh-in?w=78.2 link carries
// (lib/widget-links.js) is read here, and the routines a "start today's workout" link starts.
// The Siri intents of the original app are not in this fork's iPhone app (FORK.md).
import { effectiveRoutines } from './history.js'
import { todayISO } from './format.js'

export const LB_PER_KG = 2.2046226218
// What a spoken number may be. Below this it was a mishearing ("two"), above it the sheet's own cap.
export const VOICE_MIN = { kg: 20, lb: 44 }
export const VOICE_MAX = { kg: 700, lb: 1500 }
const unitOf = u => (u === 'lb' ? 'lb' : 'kg')
const round1 = n => Math.round(n * 10) / 10

/** `w` in `from` as `to`, to a tenth. */
export function convertWeight (w, from, to) {
  const n = Number(w)
  if (!Number.isFinite(n)) return NaN
  if (unitOf(from) === unitOf(to)) return round1(n)
  return round1(unitOf(from) === 'kg' ? n * LB_PER_KG : n / LB_PER_KG)
}

export const weightInRange = (w, unit) => Number.isFinite(w) && w >= VOICE_MIN[unitOf(unit)] && w <= VOICE_MAX[unitOf(unit)]

/**
 * A weight as an assistant passes it: "78.2", "78,2", "78.2 kg", "170 lbs", "80 kilos".
 * { w, unit } (unit null when it says none), or null.
 */
export function parseSpokenWeight (input) {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? { w: input, unit: null } : null
  if (typeof input !== 'string') return null
  const m = /^\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*([a-z]*)\.?\s*$/i.exec(input)
  if (!m) return null
  const w = Number(m[1].replace(',', '.'))
  if (!(w > 0)) return null
  const word = m[2].toLowerCase()
  let unit = null
  if (word) {
    if (/^(kg|kgs|kilo|kilos|kilogram|kilograms|kilogramm|kilogramme|kilogrammes)$/.test(word)) unit = 'kg'
    else if (/^(lb|lbs|pound|pounds)$/.test(word)) unit = 'lb'
    else return null
  }
  return { w, unit }
}

/** The routines planned for `iso` that have exercises, as Home's today row starts them. */
export function todayRoutineIds (S, iso = todayISO()) {
  try {
    const st = { ...S, routines: S?.routines || [], week: S?.week || {}, dayPlan: S?.dayPlan || {} }
    return effectiveRoutines(st, iso).filter(r => r && (r.ex || []).length).map(r => r.id).filter(Boolean)
  } catch { return [] }
}
