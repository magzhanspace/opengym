// @vitest-environment happy-dom
// effectiveLang: the language a copy is shown in on this device, and the cached instance default
// (rememberDefaultLang) that stands in for /api/config until it answers, so a boot does not flash
// the browser's language first.
import { beforeEach, describe, expect, it } from 'vitest'
import { effectiveLang, rememberDefaultLang, browserLangs } from './default-lang.js'

const auto = { lang: 'en', langAuto: true }

beforeEach(() => localStorage.clear())

describe('effectiveLang', () => {
  it('falls back to English for a copy with no usable lang', () => {
    expect(effectiveLang(null, null, ['it'])).toBe('en')
    expect(effectiveLang({ lang: '' }, null, [])).toBe('en')
  })
  it('reads a remembered "no default" as no default, not as unknown', () => {
    rememberDefaultLang({})
    expect(localStorage.getItem('gym_default_lang')).toBe('')
    expect(effectiveLang(auto, null, ['ru'])).toBe('ru')
  })
})

describe('browserLangs', () => {
  it('lists navigator.languages without blanks', () => {
    const langs = browserLangs()
    expect(Array.isArray(langs)).toBe(true)
    expect(langs.every(Boolean)).toBe(true)
  })
})
