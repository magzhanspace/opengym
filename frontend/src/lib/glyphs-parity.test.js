// #311: the plan validator (api/shared/validate.js) keeps a routine glyph only when it is one a
// routine can hold (or a legacy emoji). A glyph the app shows and the server does not know would
// be reset by every imported plan.
import { describe, it, expect } from 'vitest'
import { GLYPHS, KNOWN_GLYPHS, glyphOf } from './glyphs.js'
import { ICON_NAMES } from '../components/Icon.jsx'
import { ROUTINE_GLYPHS, LEGACY_ROUTINE_GLYPHS, glyphStr } from '../../../api/shared/glyphs.js'

describe('routine glyphs', () => {
  it('the server offers exactly the glyphs the picker offers, each a real icon', () => {
    expect([...ROUTINE_GLYPHS].sort()).toEqual([...GLYPHS].sort())
    ROUTINE_GLYPHS.forEach(g => expect(ICON_NAMES).toContain(g))
  })
  it('the server keeps every icon key a routine can hold, and the app shows each as itself', () => {
    expect([...ROUTINE_GLYPHS, ...LEGACY_ROUTINE_GLYPHS].sort()).toEqual([...KNOWN_GLYPHS].sort())
    KNOWN_GLYPHS.forEach(g => {
      expect(glyphStr(g)).toBe(g)
      expect(glyphOf(g)).toBe(g)
    })
  })
})
