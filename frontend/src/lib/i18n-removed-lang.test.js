// This fork ships English and Russian only (FORK.md). A profile or a DEFAULT_LANG saved with a
// language the app no longer has must open in English: no crash, no raw keys.
import { describe, it, expect, afterEach } from 'vitest'
import { _setLangState, getLang, t, LANGS, DATE_LOCALES } from './i18n-core.js'

afterEach(() => _setLangState('en', {}, null, null))

describe('a removed language', () => {
  it('falls back to English when set or saved', () => {
    _setLangState('de', { Weight: 'Gewicht' }, null, null)
    expect(getLang()).toBe('en')
    expect(t('Weight')).toBe('Weight')
  })
  it('still speaks Russian', () => {
    _setLangState('ru', { Weight: 'Вес' }, null, null)
    expect(getLang()).toBe('ru')
    expect(t('Weight')).toBe('Вес')
  })
  it('offers exactly English and Russian, each with a date locale', () => {
    expect(Object.keys(LANGS).sort()).toEqual(['en', 'ru'])
    for (const l of Object.keys(LANGS)) expect(DATE_LOCALES[l]).toBeTruthy()
  })
})
