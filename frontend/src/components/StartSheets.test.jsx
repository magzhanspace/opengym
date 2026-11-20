// @vitest-environment happy-dom
// #930: Start can pick which workout, today's first; #976: a planned session can open on a preview
// with Start at its foot. Neither starts anything on its own.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { bindUI } from './ui.jsx'
import { todayISO } from '../lib/format.js'

const started = vi.hoisted(() => [])
const menus = vi.hoisted(() => [])
vi.mock('../sheets.jsx', () => ({ startFlow: (ids, opts) => started.push(opts?.lead ? { ids, lead: opts.lead.ex.map(x => x.id) } : ids), menuSheet: m => menus.push(m) }))
const navs = vi.hoisted(() => [])
vi.mock('../lib/nav.js', () => ({ closeThenNav: (close, to) => { close(); navs.push(to) } }))
import { startPickerSheet, startOrPreview, startPlanned, previewSheet, previewsStart } from './StartSheets.jsx'
import TabBar, { START_HOLD_MS } from './TabBar.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {}, useLocation: () => ({ pathname: '/home' }) }))

bindUI(useUI)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const wd = new Date(todayISO() + 'T12:00:00').getDay()
beforeEach(() => {
  started.length = 0
  menus.length = 0
  navs.length = 0
  const S = structuredClone(DEF)
  // The picker and leftovers tests below are about what starts: the preview (on by default in this
  // fork) is switched off for them and covered on its own in 'the preview (#976)'.
  S.previewStart = false
  S.routines = [
    { id: 'push', name: 'Push', emoji: null, ex: [{ id: '0025', sets: 3, reps: 8, w: 60 }] },
    { id: 'pull', name: 'Pull', emoji: null, ex: [{ id: '0027', sets: 3, reps: 10 }] },
    { id: 'mob', name: 'Morning mobility', emoji: null, ex: [{ id: '1162', sets: 2, reps: 12 }] },
  ]
  S.week = { [wd]: ['push'], [(wd + 1) % 7]: ['pull'] }
  S.weighIn = false
  useStore.setState({ S, user: { id: 1, name: 'x' } })
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const renderTop = () => { const sh = useUI.getState().sheets.at(-1); act(() => root.render(sh.render(() => useUI.getState().closeSheet(sh.id)))) }
const rowTitles = sel => [...host.querySelectorAll(sel + ' .lrow-t')].map(e => e.textContent)
const click = text => act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.querySelector('.lrow-t')?.textContent === text).click())

describe('the start picker (#930)', () => {
  it('has today first, then every other routine (unscheduled ones too), then freestyle', () => {
    startPickerSheet(); renderTop()
    expect(rowTitles('.start-today')).toEqual(['Push'])
    const all = rowTitles('.menu-list')
    expect(all).toEqual(['Push', 'Pull', 'Morning mobility', 'Freestyle workout (pick as you go)'])
    click('Morning mobility')
    expect(started).toEqual([['mob']])
    expect(useUI.getState().sheets).toHaveLength(0)
  })
  it('the Start tab: a tap starts today, a long press opens the picker, "Let me pick" asks every time', () => {
    vi.useFakeTimers()
    try {
      const onStart = vi.fn(), onPick = vi.fn()
      const btn = () => host.querySelector('[data-tour="start"]')
      act(() => root.render(<TabBar onStart={onStart} onPick={onPick} />))
      act(() => btn().click())
      expect(onStart).toHaveBeenCalledWith(['push'])
      act(() => btn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
      act(() => vi.advanceTimersByTime(START_HOLD_MS + 10))
      expect(onPick).toHaveBeenCalledTimes(1)
      act(() => btn().dispatchEvent(new PointerEvent('pointerup', { bubbles: true })))
      act(() => btn().click())   // the release of the hold starts nothing
      expect(onStart).toHaveBeenCalledTimes(1)
      act(() => useStore.getState().update(s => { s.startPick = 'ask' }))
      act(() => btn().click())
      expect(onPick).toHaveBeenCalledTimes(2)
      expect(onStart).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})

describe('the preview (#976)', () => {
  it('is on unless switched off: a profile that never chose previews, false starts at once', () => {
    expect(previewsStart({})).toBe(true)
    expect(previewsStart({ previewStart: true })).toBe(true)
    expect(previewsStart({ previewStart: false })).toBe(false)
    startOrPreview(['push'])
    expect(started).toEqual([['push']])
    act(() => useStore.getState().update(s => { delete s.previewStart }))
    startOrPreview(['push'])
    expect(started).toHaveLength(1)
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Push')
    const items = [...host.querySelectorAll('.pv-card')]
    expect(items).toHaveLength(1)
    expect(items[0].querySelector('.pv-s').textContent).toMatch(/^3 sets · /)
    expect(host.querySelector('.pv-dots')).toBe(null)
    click('Start Push')
    expect(started).toEqual([['push'], ['push']])
  })
  it('an explicit Start (tab bar, Start screen) skips the preview', () => {
    act(() => useStore.getState().update(s => { delete s.previewStart }))
    startPlanned(['push'])
    expect(started).toEqual([['push']])
    expect(useUI.getState().sheets).toHaveLength(0)
  })
  it('a picked workout opens on its preview too', () => {
    act(() => useStore.getState().update(s => { delete s.previewStart }))
    startPickerSheet(); renderTop()
    click('Morning mobility')
    expect(started).toEqual([])
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Morning mobility')
  })
  it('Edit opens the routine editor, for a single routine only', () => {
    previewSheet(['pull']); renderTop()
    click('Edit')
    expect(navs).toEqual(['/plan/r/pull'])
    expect(started).toEqual([])
    previewSheet(['push', 'pull']); renderTop()
    expect([...host.querySelectorAll('button')].some(b => b.textContent.trim() === 'Edit')).toBe(false)
  })
  it('shows each exercise as a card with its animation, dots to move between them', () => {
    previewSheet(['push', 'pull']); renderTop()
    const cards = [...host.querySelectorAll('.pv-card')]
    expect(cards.length).toBeGreaterThan(1)
    expect(cards[0].querySelector('.pv-n').textContent).toBe('1 / ' + cards.length)
    expect(cards.every(c => c.querySelector('.exmedia'))).toBe(true)
    const dots = [...host.querySelectorAll('.pv-dot')]
    expect(dots).toHaveLength(cards.length)
    expect(dots[0].getAttribute('aria-current')).toBe('true')
    const row = host.querySelector('.pv-cards')
    row.scrollTo = vi.fn()
    act(() => dots[1].click())
    expect(row.scrollTo).toHaveBeenCalled()
  })
  it('can swap to another workout from the preview', () => {
    previewSheet(['pull']); renderTop()
    click('Choose a different workout')
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('What are we training?')
  })
})

describe('the exercises you didn’t get to (#985)', () => {
  const yesterday = () => { const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
  const leftPull = () => useStore.setState(st => ({ S: { ...st.S,
    routines: st.S.routines.map(r => (r.id === 'pull' ? { ...r, ex: [{ id: '0027' }, { id: '0029' }, { id: '0031' }] } : r)),
    workouts: [{ id: 'w9', d: yesterday(), start: 1, routineIds: ['pull'], entries: [{ id: '0027', rid: 'pull', sets: [{ w: 40, r: 10, done: true }] }] }] } }))

  it('Start asks once: with them first, then today; the answer is remembered', () => {
    leftPull()
    startOrPreview(['push'])
    expect(started).toEqual([])
    const m = menus.at(-1)
    expect(m.title).toBe('You didn’t get to 2 exercises last time')
    expect(m.items[0].label).toBe('Start with the 2 exercises you didn’t get to')
    m.items[0].onClick()
    expect(started).toEqual([{ ids: ['push'], lead: ['0029', '0031'] }])
    expect(useStore.getState().S.leftoverSeen).toBe('w9')
    startOrPreview(['push'])
    expect(started.at(-1)).toEqual(['push'])                 // no second ask
    expect(menus).toHaveLength(1)
  })

  it('"Just today’s plan" lets them go, and today’s own routine is never offered twice', () => {
    leftPull()
    startOrPreview(['pull'])                                    // the same routine again: it has them anyway
    expect(menus).toHaveLength(0)
    expect(started).toEqual([['pull']])
    startOrPreview(['push'])
    menus.at(-1).items[1].onClick()
    expect(started.at(-1)).toEqual(['push'])
    expect(useStore.getState().S.leftoverSeen).toBe('w9')
  })

  it('the picker offers them on top, then today', () => {
    leftPull()
    startPickerSheet(); renderTop()
    expect(host.textContent).toContain('Start with the 2 exercises you didn’t get to')
    expect(host.textContent).toContain('then Push')
    click('Start with the 2 exercises you didn’t get to')
    expect(started).toEqual([{ ids: ['push'], lead: ['0029', '0031'] }])
  })
})
