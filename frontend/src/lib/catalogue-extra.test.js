import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { parseExtra, cleanRow, bootFromLocal, syncCatalogueExtra } from './catalogue-extra.js'
import { registerCatalogueExtra, EXIDX, CATALOGUE, allExercises, imgSrc, gifSrc, exOr } from './exercises.js'
import { _setLangState, exerciseNameFor, instrFor, descFor, instrTranslated } from './i18n-core.js'

const b64 = s => Buffer.from(s, 'latin1').toString('base64')
const WEBP = b64('RIFF\x10\0\0\0WEBPVP8 \0\0\0\0')
const MP4 = b64('\0\0\0\x18ftypisom\0\0\0\0')
const row = (id, extra = {}) => ({
  id, n: 'test toe lift ' + id, bp: 'lower legs', eq: 'body weight', tg: 'calves', mg: 'feet', sm: ['feet'],
  img: id + '.webp', gif: id + '.mp4', cat: 'rehab', st: ['Lift.', 'Lower.'], desc: 'A toe lift.',
  tr: { ru: { n: 'подъём пальцев ' + id, d: 'Подъём пальцев.', st: ['Поднимите.', 'Опустите.'] } },
  still: WEBP, clip: MP4, ...extra,
})

beforeEach(() => { registerCatalogueExtra([]); _setLangState('en') })

describe('the server file', () => {
  it('reads the file the build writes for the server', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../../../catalogue/media-own/extra.json', import.meta.url), 'utf8'))
    const rows = parseExtra(data, true)
    expect(rows.map(r => r.id)).toEqual(data.rows.map(r => r.id))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.tr.ru.n).toBeTruthy()
  })

  it('drops a row that is not an exercise with its own two files', () => {
    expect(cleanRow(row('12a4'), true)).toBe(null)
    expect(cleanRow(row('99001', { img: '../x.webp' }), true)).toBe(null)
    expect(cleanRow(row('99001', { still: MP4 }), true)).toBe(null)
    expect(cleanRow(row('99001', { clip: WEBP }), true)).toBe(null)
    expect(cleanRow(row('99001', { clip: 'not base64!' }), true)).toBe(null)
    expect(cleanRow(row('99001', { still: undefined }), true)).toBe(null)
    expect(cleanRow(row('99001', { still: undefined, clip: undefined }), false)).toMatchObject({ id: '99001' })
  })

  it('keeps only known fields, one row per id, and refuses another version', () => {
    const rows = parseExtra({ v: 1, rows: [row('99001', { evil: '<script>' }), row('99001'), row('99002')] }, true)
    expect(rows.map(r => r.id)).toEqual(['99001', '99002'])
    expect(rows[0].evil).toBeUndefined()
    expect(parseExtra({ v: 2, rows: [row('99001')] }, true)).toBe(null)
  })
})

describe('registering', () => {
  it('adds exercises the bundle lacks and replaces the previous set', () => {
    registerCatalogueExtra([row('99001'), row('99002')])
    expect(EXIDX['99001'].n).toBe('test toe lift 99001')
    expect(allExercises({}).some(e => e.id === '99002')).toBe(true)
    registerCatalogueExtra([row('99002')])
    expect(EXIDX['99001']).toBeUndefined()
    expect(exOr('99001').missing).toBe(true)
    expect(CATALOGUE.filter(e => e.id === '99002')).toHaveLength(1)
  })

  it('never replaces an exercise the bundle has', () => {
    const own = EXIDX['0001']
    registerCatalogueExtra([{ ...row('0001'), n: 'something else' }])
    expect(EXIDX['0001']).toBe(own)
    expect(CATALOGUE.filter(e => e.id === '0001')).toHaveLength(1)
  })

  it('shows the files kept on the phone, else the usual path', () => {
    registerCatalogueExtra([row('99001'), { ...row('99002'), imgUrl: 'capacitor://localhost/_capacitor_file_/c/99002.webp', gifUrl: 'capacitor://localhost/_capacitor_file_/c/99002.mp4' }])
    expect(imgSrc(EXIDX['99002'])).toBe('capacitor://localhost/_capacitor_file_/c/99002.webp')
    expect(gifSrc(EXIDX['99002'])).toMatch(/99002\.mp4$/)
    expect(imgSrc(EXIDX['99001'])).toBe('exercise-media/still/99001.webp')
  })

  it('reads its own Russian name, steps and description', () => {
    registerCatalogueExtra([row('99001')])
    const ex = EXIDX['99001']
    expect(exerciseNameFor(ex)).toBe('test toe lift 99001')
    expect(instrFor(ex)).toEqual(['Lift.', 'Lower.'])
    _setLangState('ru', {}, {}, {}, false)
    expect(exerciseNameFor(ex)).toBe('подъём пальцев 99001')
    expect(instrFor(ex)).toEqual(['Поднимите.', 'Опустите.'])
    expect(instrTranslated(ex)).toBe(true)
    expect(descFor(ex)).toBe('Подъём пальцев.')
  })
})

function fakeFs() {
  const files = new Map()
  const writes = []
  const FS = {
    async readFile({ path }) { if (!files.has(path)) throw new Error('no file'); return { data: files.get(path) } },
    async writeFile({ path, data }) { files.set(path, data); writes.push(path) },
    async mkdir() {},
    async stat({ path }) { if (!files.has(path)) throw new Error('no file'); return {} },
    async getUri({ path }) { return { uri: 'file:///lib/' + path } },
  }
  return { files, writes, deps: async () => ({ FS, Directory: { Library: 'LIBRARY' }, Encoding: { UTF8: 'utf8' }, convert: u => u.replace('file://', 'capacitor://localhost/_capacitor_file_') }) }
}
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const serve = (data, calls = []) => async url => { calls.push(url); return { ok: true, status: 200, json: async () => data } }

describe('syncing with the server', () => {
  it('keeps the files and the rows, and shows the files', async () => {
    const f = fakeFs(), storage = memStorage(), calls = []
    let told = 0
    const ids = await syncCatalogueExtra({ base: 'https://gym.example/', fetchImpl: serve({ v: 1, rows: [row('99001')] }, calls), deps: f.deps, storage, notify: () => told++ })
    expect(ids).toEqual(['99001'])
    expect(calls[0]).toMatch(/^https:\/\/gym\.example\/exercise-media\/extra\.json\?t=\d+$/)
    expect(f.files.get('opengym-catalogue/99001.webp')).toBe(WEBP)
    expect(f.files.get('opengym-catalogue/99001.mp4')).toBe(MP4)
    expect(gifSrc(EXIDX['99001'])).toBe('capacitor://localhost/_capacitor_file_/lib/opengym-catalogue/99001.mp4')
    expect(JSON.parse(storage.getItem('gym_catalogue_extra_v1')).rows[0].still).toBeUndefined()
    expect(told).toBeGreaterThan(0)

    // The next start: registered from localStorage before anything else, files not written again.
    registerCatalogueExtra([])
    expect(bootFromLocal(storage)).toBe(1)
    expect(EXIDX['99001']).toBeTruthy()
    f.writes.length = 0
    await syncCatalogueExtra({ base: 'https://gym.example', fetchImpl: serve({ v: 1, rows: [row('99001')] }), deps: f.deps, storage, notify: () => {} })
    expect(f.writes).toEqual(['opengym-catalogue/rows.json'])
  })

  it('offline, the kept copy stays; storage cleared, the file copy brings it back', async () => {
    const f = fakeFs(), storage = memStorage()
    await syncCatalogueExtra({ base: 'https://gym.example', fetchImpl: serve({ v: 1, rows: [row('99001')] }), deps: f.deps, storage, notify: () => {} })
    // A new start (fresh modules) with localStorage gone and no network: the files on the phone.
    vi.resetModules()
    const fresh = await import('./catalogue-extra.js')
    const lib = await import('./exercises.js')
    expect(fresh.bootFromLocal(memStorage())).toBe(0)
    expect(lib.EXIDX['99001']).toBeUndefined()
    const offline = async () => { throw new Error('offline') }
    const ids = await fresh.syncCatalogueExtra({ base: 'https://gym.example', fetchImpl: offline, deps: f.deps, storage: memStorage(), notify: () => {} })
    expect(ids).toEqual(['99001'])
    expect(lib.EXIDX['99001'].n).toBe('test toe lift 99001')
    expect(lib.imgSrc(lib.EXIDX['99001'])).toMatch(/opengym-catalogue\/99001\.webp$/)
  })

  it('a broken answer changes nothing', async () => {
    const f = fakeFs(), storage = memStorage()
    registerCatalogueExtra([row('99001')])
    await syncCatalogueExtra({ base: 'https://gym.example', fetchImpl: serve({ v: 1, rows: 'nope' }), deps: f.deps, storage, notify: () => {} })
    expect(storage.getItem('gym_catalogue_extra_v1')).toBe(null)
  })
})
