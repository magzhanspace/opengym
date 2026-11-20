// @vitest-environment happy-dom
// A tap on today's plan on Home shows the workout first (#976, on by default in this fork): the
// exercises with the sets and weights the session will open with, and Start at its foot. Nothing
// starts until Start; with "Preview before starting" switched off the tap starts at once.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { bindUI } from '../components/ui.jsx'
import { startFlow } from '../sheets.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(), menuSheet: vi.fn(),
}))

bindUI(useUI)
const routines = [{ id: 'r1', name: 'Push', emoji: null, ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }] }]

let host, root, sheetHost, sheetRoot
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  nav.mockClear(); startFlow.mockClear()
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  sheetHost = document.createElement('div'); document.body.appendChild(sheetHost); sheetRoot = createRoot(sheetHost)
})
afterEach(() => { act(() => { root.unmount(); sheetRoot.unmount() }); host.remove(); sheetHost.remove() })

const setS = (over = {}) => useStore.setState(s => ({
  S: {
    ...s.S, routines, dayPlan: {}, workouts: [], active: null, weighIn: false,
    week: { 0: ['r1'], 1: ['r1'], 2: ['r1'], 3: ['r1'], 4: ['r1'], 5: ['r1'], 6: ['r1'] }, ...over,
  },
  user: null,
}))
const mount = () => act(() => root.render(<Home />))
const tapToday = () => act(() => { host.querySelector('[data-tour="today"]').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const renderTop = () => {
  const sh = useUI.getState().sheets.at(-1)
  act(() => sheetRoot.render(sh.render(() => useUI.getState().closeSheet(sh.id))))
}

describe('Home — today’s plan opens on its preview', () => {
  it('shows the workout, and Start starts it', () => {
    const { previewStart: _p, ...rest } = useStore.getState().S
    useStore.setState({ S: rest })
    setS(); mount()
    tapToday()
    expect(startFlow).not.toHaveBeenCalled()
    expect(useUI.getState().sheets).toHaveLength(1)
    renderTop()
    expect(sheetHost.querySelector('h3').textContent).toBe('Push')
    expect(sheetHost.querySelectorAll('.preview-list li')).toHaveLength(1)
    act(() => [...sheetHost.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start Push').click())
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('starts at once when the preview is switched off', () => {
    setS({ previewStart: false }); mount()
    tapToday()
    expect(startFlow).toHaveBeenCalledWith(['r1'])
    expect(useUI.getState().sheets).toHaveLength(0)
  })
})
