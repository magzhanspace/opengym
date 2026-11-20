// @vitest-environment happy-dom
// Settings → Integrations (v1.4.4): the cards by platform and server, the webhook add / test /
// retry / disconnect flow against a mocked API, and the way in from the Settings search.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  user: null, config: null, MOBILE: false, health: null, sheets: [], navs: [], toast: null, calls: [], answers: {}, confirm: null, menu: null,
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ S: {}, user: mocks.user, config: mocks.config })
  const useStore = selector => (selector ? selector(snap()) : snap())
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: mocks.toast, openSheet: render => { mocks.sheets.push(render); return { close: vi.fn() } } })
  const useUI = selector => (selector ? selector(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => (...a) => mocks.navs.push(a), useLocation: () => ({ pathname: '/settings/integrations', search: mocks.search || '' }) }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null
    mocks.calls.push([path.split('?')[0], body])
    const a = mocks.answers[path.split('?')[0]]
    if (a instanceof Error) throw a
    return typeof a === 'function' ? a(body) : a ?? {}
  }),
  appBase: () => '/',
}))
vi.mock('../lib/mobile.js', () => ({ get MOBILE() { return mocks.MOBILE } }))
vi.mock('../lib/demo.js', () => ({ DEMO: false }))
vi.mock('../lib/health-sync.js', () => ({
  healthStatus: () => Promise.resolve(mocks.health ? { status: mocks.health.status, platform: mocks.health.platform } : { status: 'unsupported' }),
  loadHealth: () => Promise.resolve(mocks.health || {}),
  onHealthChange: () => () => {},
  disableHealth: vi.fn(async () => ({})),
  disableRead: vi.fn(async () => ({})),
}))
vi.mock('../lib/clipboard.js', () => ({ copyText: vi.fn(async () => true) }))
vi.mock('../sheets.jsx', () => ({
  importFromApp: vi.fn(), importFromHevy: vi.fn(),
  confirmSheet: o => { mocks.confirm = o },
  menuSheet: o => { mocks.menu = o },
}))
vi.mock('../components/CsvExportSheet.jsx', () => ({ csvExportSheet: vi.fn() }))

import IntegrationsPage from './Integrations.jsx'
import { importFromHevy } from '../sheets.jsx'
import { searchSettings } from './settings-pages.js'

let host, root, sheetHost, sheetRoot
beforeEach(() => {
  Object.assign(mocks, { search: '', user: null, config: null, MOBILE: false, health: null, sheets: [], navs: [], calls: [], answers: {}, confirm: null, menu: null, toast: vi.fn() })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  sheetHost = document.createElement('div'); document.body.appendChild(sheetHost); sheetRoot = createRoot(sheetHost)
})
afterEach(() => {
  act(() => { root.unmount(); sheetRoot.unmount() })
  host.remove(); sheetHost.remove()
})

const mount = async (props = {}) => {
  await act(async () => { root.render(<IntegrationsPage {...props} />) })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
const card = id => host.querySelector(`[data-card="${id}"]`)
const pill = id => card(id)?.querySelector('.intg-pill')?.textContent
const action = id => card(id)?.querySelector('.intg-act')
const closeSheet = vi.fn()
const showSheet = async () => {
  await act(async () => { sheetRoot.render(<>{mocks.sheets.at(-1)(closeSheet)}</>) })
  await act(async () => { await Promise.resolve() })
}
const sheetBtn = text => [...sheetHost.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('the cards', () => {
  it('a guest in a browser: the health stores live in the phone app, MCP needs a server, nothing fake to connect', async () => {
    await mount()
    expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).toEqual(['Health & devices', 'Works with', 'Training apps', 'AI & API'])
    expect(pill('apple-health')).toBe('Not available on this device')
    expect(pill('health-connect')).toBe('Not available on this device')
    expect(action('apple-health')).toBeNull()
    expect(pill('mcp')).toBe('Needs your server')
    expect(card('coach')).toBeNull()
    // Works with: names only, each a way to the explanation, none a Connect button.
    const chips = [...host.querySelectorAll('.intg-chip')].map(b => b.textContent)
    expect(chips).toEqual(['Garmin', 'COROS', 'Polar', 'Fitbit', 'Samsung Health', 'Oura', 'Withings', 'Renpho'])
    act(() => host.querySelector('.intg-chip').click())
    await showSheet()
    expect(sheetHost.textContent).toContain('Garmin saves to Apple Health on iPhone or Health Connect on Android.')
    expect(sheetHost.textContent).toContain('Install the openGym app on your phone to use this.')
    // Screen readers hear the name and the state in one go.
    expect(card('mcp').querySelector('.intg-open').getAttribute('aria-label')).toBe('MCP server, Needs your server')
  })

  it('on Android: Health Connect only, off until set up on its page; imports open their sheets', async () => {
    mocks.MOBILE = true
    mocks.health = { status: 'available', platform: 'android', on: false }
    await mount({ android: true })
    expect(card('apple-health')).toBeNull()
    expect(pill('health-connect')).toBe('Off')
    act(() => action('health-connect').click())
    expect(mocks.navs).toEqual([['/settings/health-connect']])
    act(() => action('hevy').click())
    expect(importFromHevy).toHaveBeenCalled()
    // The detail sheet says what it does.
    act(() => card('health-connect').querySelector('.intg-open').click())
    await showSheet()
    expect(sheetHost.textContent).toContain('Finished workouts and weigh-ins go to Health Connect.')
    expect(sheetHost.textContent).toContain('Last sync')
  })

  it('on iPhone, connected Apple Health offers Disconnect, which asks what happens to what it wrote', async () => {
    mocks.MOBILE = true
    mocks.health = { status: 'available', platform: 'ios', on: true, at: Date.now() - 60000 }
    await mount({ ios: true })
    expect(card('health-connect')).toBeNull()
    expect(pill('apple-health')).toBe('Connected')
    act(() => card('apple-health').querySelector('.intg-open').click())
    await showSheet()
    act(() => sheetBtn('Disconnect').click())
    expect(mocks.menu.title).toBe('Disconnect Apple Health?')
    expect(mocks.menu.items.map(i => i.label)).toEqual(['Stop, keep what it wrote', 'Stop and remove what it wrote'])
  })
})

describe('the Settings search', () => {
  it('finds the page and its cards by what people type', () => {
    const ctx = { user: null, mobile: false, demo: false }
    const tr = s => s
    expect(searchSettings('integrations', ctx, tr)[0]).toMatchObject({ page: 'integrations', isPage: true })
    expect(searchSettings('garmin', ctx, tr).map(h => h.title)).toContain('Garmin')
    // On a phone the health store is its own page, found under Integrations.
    const phone = searchSettings('healthkit', { mobile: true, ios: true }, tr)
    expect(phone[0]).toMatchObject({ page: 'apple-health', trail: 'Settings' })
  })
})
