// Settings → Integrations (v1.4.4): which card shows where, and what it says.
import { describe, expect, it } from 'vitest'
import { cardState, directory, CARDS, WORKS_WITH, PILL } from './integrations.js'

const web = { mobile: false, platform: null, user: null, demo: false, health: null }
const ids = ctx => directory(ctx).flatMap(c => c.cards.map(x => x.id))

describe('the directory', () => {
  it('a guest in a browser sees the phone-only stores as such, and MCP as needing a server', () => {
    expect(cardState('apple-health', web)).toEqual({ status: 'device', action: null })
    expect(cardState('health-connect', web)).toEqual({ status: 'device', action: null })
    expect(cardState('mcp', web)).toEqual({ status: 'server', action: null })
    expect(directory(web).map(c => c.id)).toEqual(['health', 'training', 'ai'])
  })

  it('a phone reading only vitals or sport counts as connected, not off', () => {
    const android = { ...web, mobile: true, platform: 'android' }
    for (const k of ['readBody', 'readVitals', 'readSport']) expect(cardState('health-connect', { ...android, health: { status: 'available', [k]: true } }).status).toBe('connected')
  })

  it('a phone shows its own store only, by what the store says', () => {
    const android = { ...web, mobile: true, platform: 'android', health: { status: 'available', on: false } }
    expect(cardState('apple-health', android)).toBeNull()
    expect(cardState('health-connect', android)).toEqual({ status: 'off', action: 'connect' })
    expect(cardState('health-connect', { ...android, health: { status: 'available', readHr: true } }).status).toBe('connected')
    expect(cardState('health-connect', { ...android, health: { status: 'available', on: true, error: 'permission' } })).toEqual({ status: 'attention', action: 'manage' })
    expect(cardState('health-connect', { ...android, health: { status: 'missing' } })).toEqual({ status: 'off', action: 'connect' })
    expect(cardState('health-connect', { ...android, health: { status: 'unsupported' } }).status).toBe('device')
    const ios = { ...web, mobile: true, platform: 'ios', health: { status: 'available', on: true } }
    expect(cardState('health-connect', ios)).toBeNull()
    expect(cardState('apple-health', ios).status).toBe('connected')
    // A phone kept local: MCP needs a server.
    expect(cardState('mcp', ios).status).toBe('server')
  })

  it('MCP opens for a signed-in profile', () => {
    expect(cardState('mcp', { ...web, user: { id: 'u1' } })).toEqual({ status: null, action: 'open' })
  })

  it('the demo has no Hevy key to spend and no server', () => {
    const demo = { ...web, demo: true }
    expect(cardState('hevy', demo)).toBeNull()
    expect(cardState('mcp', demo).status).toBe('server')
  })

  it('every card says what it does, and the "works with" list has no Connect of its own', () => {
    for (const c of CARDS) { expect(c.desc).toBeTruthy(); expect(c.syncs.length).toBeGreaterThan(0) }
    expect(WORKS_WITH.map(w => w.name)).toEqual(['Garmin', 'COROS', 'Polar', 'Fitbit', 'Samsung Health', 'Oura', 'Withings', 'Renpho'])
    expect(WORKS_WITH.every(w => ['hr', 'weight', 'both'].includes(w.reads))).toBe(true)
    expect(Object.keys(PILL)).toEqual(['connected', 'off', 'attention', 'device', 'server'])
  })
})
