// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { convertWeight, parseSpokenWeight, todayRoutineIds, weightInRange } from './voice.js'

// What Assistant-style links hand over (opengym://weigh-in?w=78.2) and the routines planned today.
describe('parseSpokenWeight', () => {
  it('reads numbers as assistants pass them', () => {
    expect(parseSpokenWeight('78.2')).toEqual({ w: 78.2, unit: null })
    expect(parseSpokenWeight('78,2')).toEqual({ w: 78.2, unit: null })
    expect(parseSpokenWeight(' 80 kg ')).toEqual({ w: 80, unit: 'kg' })
    expect(parseSpokenWeight('80 kilos')).toEqual({ w: 80, unit: 'kg' })
    expect(parseSpokenWeight('170 lbs')).toEqual({ w: 170, unit: 'lb' })
    expect(parseSpokenWeight('170 pounds')).toEqual({ w: 170, unit: 'lb' })
    expect(parseSpokenWeight(72)).toEqual({ w: 72, unit: null })
  })

  it('refuses what is not a weight', () => {
    for (const v of ['', 'abc', '-5', '0', '78.2 stone', '1e3', '78..2', null, undefined, NaN, Infinity, -3, {}]) {
      expect(parseSpokenWeight(v), String(v)).toBeNull()
    }
  })
})

describe('convertWeight', () => {
  it('converts both ways to a tenth', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5)
    expect(convertWeight(170, 'lb', 'kg')).toBe(77.1)
    expect(convertWeight(78.24, 'kg', 'kg')).toBe(78.2)
    expect(Number.isNaN(convertWeight('x', 'kg', 'kg'))).toBe(true)
  })

  it('knows a body weight from a mishearing', () => {
    expect(weightInRange(78, 'kg')).toBe(true)
    expect(weightInRange(2, 'kg')).toBe(false)
    expect(weightInRange(30, 'lb')).toBe(false)
    expect(weightInRange(1600, 'lb')).toBe(false)
  })
})

describe('todayRoutineIds', () => {
  it('is today’s plan, without the empty routines', () => {
    const iso = '2026-10-28'
    const wd = new Date(iso + 'T12:00:00').getDay()
    const S = { routines: [{ id: 'r1', ex: [{ id: 'squat' }] }, { id: 'r2', ex: [] }, { id: 'r3', ex: [{ id: 'row' }] }], week: { [wd]: ['r1', 'r2'] }, dayPlan: {} }
    expect(todayRoutineIds(S, iso)).toEqual(['r1'])
    expect(todayRoutineIds({ ...S, dayPlan: { [iso]: 'rest' } }, iso)).toEqual([])
    expect(todayRoutineIds({ ...S, dayPlan: { [iso]: 'r3' } }, iso)).toEqual(['r3'])
    expect(todayRoutineIds(null, iso)).toEqual([])
  })
})

