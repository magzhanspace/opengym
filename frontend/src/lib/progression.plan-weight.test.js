import { describe, it, expect } from 'vitest'
import { readSession, nextPrescription } from './progression.js'
import { createRoutine, updateRoutine } from './routine-write.js'
import { EXDB, isAssisted } from './exercises.js'

// This fork: a weight set in the plan after the last session wins (slot `wAt`), and a heavy
// opener in front of the real sets is not the working weight.
const LIFT = EXDB.find(e => e.bp !== 'cardio' && !['upper legs', 'lower legs', 'back', 'hips', 'glutes'].includes(e.bp) && !['body weight', 'band', 'resistance band'].includes(e.eq) && !isAssisted(e.id)).id
const set = (w, r) => ({ w, r, done: true })
const day = (d, start, sets, target = { sets: 3, reps: 6, weight: 70 }) => ({
  d, start, end: start + 3600e3, entries: [{ id: LIFT, target, planned: { sets: 3, reps: 6, weight: 70 }, sets }],
})
const T22 = Date.parse('2026-11-22T12:00:00Z')

describe('readSession working weight', () => {
  it('skips a heavy opener that did not reach the reps', () => {
    const s = readSession({ id: LIFT, target: { sets: 3, reps: 6 }, sets: [set(80, 2), set(70, 6), set(70, 5)] })
    expect(s.weight).toBe(70)
    expect(s.ok).toBe(false)
  })
  it('keeps the top weight when it reached the reps', () => {
    expect(readSession({ id: LIFT, target: { sets: 3, reps: 6 }, sets: [set(80, 6), set(80, 6), set(80, 4)] }).weight).toBe(80)
  })
  it('falls back to the heaviest set when none reached the reps', () => {
    expect(readSession({ id: LIFT, target: { sets: 3, reps: 6 }, sets: [set(80, 3), set(75, 4), set(70, 5)] }).weight).toBe(80)
  })
  it('uses the bottom of a rep range', () => {
    expect(readSession({ id: LIFT, target: { sets: 2, reps: 10, repsMin: 6 }, sets: [set(80, 6), set(70, 10)] }).weight).toBe(80)
  })
  it('reads an import without its own plan as before', () => {
    expect(readSession({ id: LIFT, sets: [set(80, 2), set(70, 6)] }, { sets: 3, reps: 6 }).weight).toBe(80)
  })
})

describe('plan weight newer than the last session', () => {
  const S = { unit: 'kg', workouts: [day('2026-11-22', T22, [set(80, 6), set(80, 6), set(80, 6)])] }
  const cfg = { id: LIFT, sets: 3, reps: 6, weight: 70, prog: 'linear' }

  it('opens at the plan when the weight was set after the session', () => {
    const p = nextPrescription(S, { ...cfg, wAt: T22 + 5 * 3600e3 }, null)
    expect(p.weight).toBe(70)
    expect(p.kind).toBe('hold')
    expect(p.why[0]).toMatch(/Weight set in the plan/)
  })
  it('progresses from history when the stamp is older than the session', () => {
    const p = nextPrescription(S, { ...cfg, wAt: T22 - 3600e3 }, null)
    expect(p.weight).toBeGreaterThan(80)
  })
  it('progresses from history with no stamp at all', () => {
    expect(nextPrescription(S, cfg, null).weight).toBeGreaterThan(80)
  })
  it('compares an import with only a date against the end of that day', () => {
    const old = { unit: 'kg', workouts: [{ d: '2026-11-22', entries: [{ id: LIFT, target: { sets: 3, reps: 6, weight: 80 }, sets: [set(80, 6), set(80, 6), set(80, 6)] }] }] }
    expect(nextPrescription(old, { ...cfg, wAt: Date.parse('2026-11-22T10:00:00') }, null).weight).toBeGreaterThan(80)
    expect(nextPrescription(old, { ...cfg, wAt: Date.parse('2026-11-23T10:00:00') }, null).weight).toBe(70)
  })
  it('gives the plan weight on a first session too', () => {
    expect(nextPrescription({ unit: 'kg', workouts: [] }, { ...cfg, wAt: T22 }, null).weight).toBe(70)
  })
})

describe('routine-write stamps the plan weight', () => {
  it('stamps a new slot with a weight, and keeps the stamp when the weight is sent again', () => {
    const S = { unit: 'kg', routines: [] }
    const { routine } = createRoutine(S, { name: 'A', exercises: [{ exercise: LIFT, sets: 3, reps: 6, weight: 70 }] })
    const at = routine.ex[0].wAt
    expect(at).toBeGreaterThan(0)
    routine.ex[0].wAt = 1
    updateRoutine(S, routine.id, { exercises: [{ exercise: LIFT, sets: 4, weight: 70 }] })
    expect(S.routines[0].ex[0].wAt).toBe(1)
    updateRoutine(S, routine.id, { exercises: [{ exercise: LIFT, weight: 65 }] })
    expect(S.routines[0].ex[0].wAt).toBeGreaterThan(1)  })
})
