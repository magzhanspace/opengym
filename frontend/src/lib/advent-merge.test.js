// What stays of the advent calendar: an older profile's S.advent still merges between devices
// (lib/advent-merge.js), the Christmas theme itself is gone.
import { describe, expect, it } from 'vitest'
import { mergeAdvent } from './advent-merge.js'
import { mergeStates } from './sync-merge.js'

describe('two devices', () => {
  it('merge by union for the same year; the later year wins', () => {
    const a = { year: 2026, opened: [1, 2], done: [1] }, b = { year: 2026, opened: [2, 5], done: [5] }
    expect(mergeAdvent(a, b)).toEqual({ year: 2026, opened: [1, 2, 5], done: [1, 5] })
    expect(mergeAdvent(b, a)).toEqual(mergeAdvent(a, b))
    expect(mergeAdvent(a, { year: 2027, opened: [1], done: [] })).toEqual({ year: 2027, opened: [1], done: [] })
    expect(mergeAdvent(undefined, a)).toEqual(a)
    expect(mergeAdvent(undefined, 'junk')).toBeUndefined()
  })

  it('in the full sync merge, a door opened on either copy stays open, whichever changed it last', () => {
    const T = 1_800_000_000_000
    const base = { unit: 'kg', workouts: [], routines: [], bodyweight: [] }
    const phone = { ...base, _ts: T + 10, advent: { year: 2026, opened: [1, 3], done: [3] }, edited: { advent: T + 10 } }
    const laptop = { ...base, _ts: T + 20, advent: { year: 2026, opened: [1, 2], done: [] }, edited: { advent: T + 20 } }
    for (const out of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) {
      expect(out.advent).toEqual({ year: 2026, opened: [1, 2, 3], done: [3] })
    }
    // a copy without a calendar takes the other's
    expect(mergeStates({ ...base, _ts: T + 30 }, phone).advent).toEqual(phone.advent)
  })
})


describe('a 1.4.4 copy and a 1.4.5 one', () => {
  it('merge: doors and done by union, the higher count of a door, finished doors drop their count', () => {
    const old = { year: 2026, opened: [1, 2, 3], done: [1] }
    const now = { year: 2026, opened: [2, 3], done: [], reps: { 2: 20, 3: 10 } }
    expect(mergeAdvent(old, now)).toEqual({ year: 2026, opened: [1, 2, 3], done: [1], reps: { 2: 20, 3: 10 } })
    expect(mergeAdvent(now, { ...now, reps: { 2: 30 }, done: [3] })).toEqual({ year: 2026, opened: [2, 3], done: [3], reps: { 2: 30 } })
    // what a 1.4.4 device keeps of a 1.4.5 calendar (its own cleanAdvent drops reps) still merges
    const { reps, ...as144 } = mergeAdvent(old, now)
    expect(mergeAdvent(as144, now)).toEqual(mergeAdvent(old, now))
  })

  it('in the full sync merge, counts survive whichever copy changed last', () => {
    const T = 1_800_000_000_000
    const base = { unit: 'kg', workouts: [], routines: [], bodyweight: [] }
    const phone = { ...base, _ts: T + 10, advent: { year: 2026, opened: [1], done: [], reps: { 1: 30 } }, edited: { advent: T + 10 } }
    const laptop = { ...base, _ts: T + 20, advent: { year: 2026, opened: [1, 2], done: [] }, edited: { advent: T + 20 } }
    for (const out of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) {
      expect(out.advent).toEqual({ year: 2026, opened: [1, 2], done: [], reps: { 1: 30 } })
    }
  })
})
