// openGym Offline (lib/build-caps.js) in Settings: nothing that needs a network is a page or a
// search hit.
import { describe, expect, it } from 'vitest'
import { pageVisible, searchSettings } from './settings-pages.js'

const tr = s => s
const phone = { mobile: true, android: true, mod: () => true, user: null }
const offline = { ...phone, offline: true }

describe('Settings in openGym Offline', () => {
  it('has no token pages', () => {
    expect(pageVisible('api-tokens', { ...offline, user: { id: 'u' }, apiTokens: true })).toBe(false)
  })

  it('finds no row that would need the network', () => {
    const titles = (q, c) => searchSettings(q, c, tr).map(h => h.title)
    expect(titles('hevy', offline)).not.toContain('Import from Hevy')
    expect(titles('hevy', offline)).not.toContain('Hevy')
    expect(titles('hevy', phone)).toContain('Import from Hevy')
    expect(titles('check for updates', offline)).toEqual([])
  })
})
