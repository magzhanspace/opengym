// The shared printout shell (lib/print-doc.js).
import { afterEach, describe, expect, it } from 'vitest'
import { esc, paperFor, pageNumberContent, printShell, probeMarks, LOGO_SVG } from './print-doc.js'
import { _setLangState } from './i18n-core.js'

afterEach(() => _setLangState('en', {}, null, null))

describe('print-doc', () => {
  it('escapes what it prints', () => {
    expect(esc('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;')
  })




  it('probe marks only when asked', () => {
    expect(probeMarks(false).s('a')).toBe('')
    expect(probeMarks(true).s('a b')).toBe('<i class="probe">~s:a_b~</i>')
  })
})
