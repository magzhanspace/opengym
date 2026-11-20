// @vitest-environment happy-dom
// #303: DEFAULT_LANG from /api/config sets the language of a fresh copy — the sign-in screen,
// and a profile created from it — and nothing else. A copy saved before the mark existed keeps
// its language even when that is the old default, 'en': it may well have been chosen.
//
// The language worked out for such a copy is the device's own and is never written into the
// synced state: two devices with browsers in different languages would otherwise push their
// answers over each other on every sync round.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

import { api } from '../lib/api.js'
import { effectiveLang } from '../lib/default-lang.js'
import { useStore, freshState, DEF } from './useStore.js'

const clone = v => JSON.parse(JSON.stringify(v))
const nav = langs => Object.defineProperty(navigator, 'languages', { value: langs, configurable: true })
const shown = () => { const { S, config } = useStore.getState(); return effectiveLang(S, config) }
const puts = () => api.mock.calls.filter(([, o]) => o?.method === 'PUT')

beforeEach(() => { localStorage.clear(); api.mockReset(); nav(['en-US']); useStore.setState({ config: null }) })
afterEach(() => { localStorage.clear(); useStore.setState({ S: clone(DEF), user: null, ready: false, config: null }) })

describe('instance default language', () => {
  it('a fresh copy is marked as not having picked a language; DEF is not', () => {
    expect(freshState().langAuto).toBe(true)
    expect(DEF.langAuto).toBeUndefined()
  })






})
