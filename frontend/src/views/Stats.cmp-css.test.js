// The Week view's done/planned figure (`.mrow .v.cmp`, #573) once shared its class name with a
// rule that put a line on top and 8px padding on it. The Stats rule resets both.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const strip = f => readFileSync(resolve(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (css, sel) => css.match(new RegExp('(^|})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))?.[2] || ''

describe('Stats Week figures keep clear of any other .cmp rule', () => {
  it('the Stats rule resets its border and padding', () => {
    const own = rule(strip('src/index.css'), '.mrow .v.cmp')
    expect(own).toMatch(/border-top:none/)
    expect(own).toMatch(/padding:0/)
  })
})

// Checked in Chrome at 320 and 360px: with "Exercises ›" in a Week row the muscle name shrank to
// 0px, and the Russian chip poked 27px out of the card. Russian, Spanish, French, Polish and four
// more had the middle fatigue zone's name cut to an ellipsis on a 320px phone.
describe('Stats rows and the fatigue bar on a narrow phone', () => {
  const css = strip('src/index.css')
  it('a row with the Exercises chip wraps it rather than squeezing the name away', () => {
    expect(rule(css, '.mrow.has-find')).toMatch(/flex-wrap:wrap/)
    expect(rule(css, '.mrow.has-find .nm')).toMatch(/min-width:\d+px/)
  })
  it('the fatigue zone names are never clipped', () => {
    const z = rule(css, '.fzones .z')
    expect(z).toBeTruthy()
    expect(z).not.toMatch(/overflow:hidden|text-overflow/)
  })
})

