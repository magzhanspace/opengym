// @vitest-environment happy-dom
// #976: a workout paused on the phone tells the watch when, so its clock stands still; a running
// one sends nothing new, so an older watch reads the snapshot exactly as before.
import { beforeEach, expect, it } from 'vitest'
import { buildSnapshot, _resetWatchSync } from './watch-sync.js'

const S = pausedAt => ({
  unit: 'kg', restSec: 90, routines: [], workouts: [],
  active: { id: 'w-1', name: 'Push', cur: 0, d: '2026-11-03', start: 1000, ...(pausedAt ? { pausedAt } : {}),
    entries: [{ id: '0025', target: { sets: 1, reps: 5, weight: 60, mode: 'reps' }, sets: [{ w: 60, r: 5, done: false }] }] },
})
beforeEach(() => { localStorage.clear(); _resetWatchSync() })

it('sends pausedAt only while paused', () => {
  expect(buildSnapshot(S(5000)).active.pausedAt).toBe(5000)
  expect('pausedAt' in buildSnapshot(S()).active).toBe(false)
})
