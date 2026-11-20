import { describe, it, expect } from 'vitest'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  baseLang, derivePack, dateLocale, getLang, t, _setLangState, exerciseNameClass, exerciseOwnNameClass, exerciseAsTypedClass, bindOwnExercise, exerciseNameFor, CASED_NAME_LANGS, RTL_LANGS
} from './i18n-core.js'
import { EXDB } from './exercises-data.js'



// EXDB stores English names lower-case and the UI title-cases them with CSS. German brings its
// own casing, and applying capitalize on top of it produced "Bankdrücken Mit Langhantel". The
// other packs are stored lower-case like EXDB, and without the class they read all lower-case.

// #290 took the title-casing off every translated name so German would keep its own, and the
// packs stored lower-case (pt-BR, hu, es, ru, it, fr) went lower-case everywhere with it. Which
// packs carry real casing is a list, so it is checked against what the packs actually hold: a
// new pack that is lower-case gets the casing without anyone remembering to add it, and one with
// real casing fails here until it is listed.
describe('title-casing per exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]
  // Share of names that start with a lower-case letter. A lower-case pack still has a few that
  // start upper-case for a reason of their own (EZ-rudas, L-sit, SkiErg), German has none.
  // Share of names that do not start with a capital. A script without case (Arabic, Devanagari,
  // Thai, Han...) has nothing to title-case, so such a name counts as lower-case: the capitalize
  // class stays on and does nothing to it.
  const lowerShare = names => {
    const firsts = Object.values(names).map(n => [...n][0]).filter(Boolean)
    return firsts.filter(c => c === c.toLocaleLowerCase()).length / firsts.length
  }


  for (const lang of EXERCISE_NAME_LANGS) {
    const cased = CASED_NAME_LANGS.includes(baseLang(lang))
    it(`${lang}: a translated name is ${cased ? 'left in its own casing' : 'title-cased like English'}`, () => {
      const names = packFor(baseLang(lang))
      const translated = EXDB.filter(e => names[e.id])
      _setLangState(lang, {}, null, names)
      for (const ex of translated) expect(exerciseNameClass(ex), `${lang} ${ex.id}`).toBe(cased ? '' : 'capitalize')
      // An exercise the pack does not cover shows the lower-case English title either way.
      const untranslated = EXDB.find(e => !names[e.id])
      if (untranslated) expect(exerciseNameClass(untranslated)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }
})

// The two per-language switches in Settings (the English name in parentheses, English names
// only) came with the Italian and French packs, but they have to hold for every pack the app
// ships — German too, which covers only part of the catalogue.
describe('English-name switches with every exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]

  it('ships a pack for every language listed as having one', () => {
    for (const lang of EXERCISE_NAME_LANGS) expect(packFor(lang), lang).toBeTruthy()
  })

  for (const lang of EXERCISE_NAME_LANGS) {
    it(`${lang}: parentheses off shows the translation alone, English only shows the English title`, () => {
      const names = packFor(lang)
      const ex = EXDB.find(e => names[e.id] && names[e.id].toLocaleLowerCase(lang) !== e.n.toLocaleLowerCase('en'))
      expect(ex, lang).toBeTruthy()
      _setLangState(lang, {}, null, names)
      // German keeps its own casing; a lower-case pack is title-cased like English.
      const translatedClass = CASED_NAME_LANGS.includes(lang) ? '' : 'capitalize'
      // A right-to-left language isolates the English part, brackets included (exerciseNameFor).
      const english = RTL_LANGS.has(lang) ? `\u2068(${ex.n})\u2069` : `(${ex.n})`
      expect(exerciseNameFor(ex)).toBe(`${names[ex.id]} ${english}`)
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, false)
      expect(exerciseNameFor(ex)).toBe(names[ex.id])
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, true, true)
      expect(exerciseNameFor(ex)).toBe(ex.n)
      // The English title is stored lower-case, so it gets the title-casing back with it.
      expect(exerciseNameClass(ex)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }

})
