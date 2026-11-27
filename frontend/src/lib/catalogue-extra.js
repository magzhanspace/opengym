// Exercises added on the server after this app was built (this fork's own, catalogue/media-own),
// so the iPhone app learns them with a server deploy instead of a new TestFlight build.
//
// The server serves exercise-media/extra.json (scripts/catalogue/build.mjs): { v: 1, rows } where a
// row is what EXDB would carry for the exercise, plus its text (st, desc, tr.<lang>.{n, d, st}) and
// its 180 px still and clip as base64. The media come inline because the server's /exercise-media/
// answers same-origin only (web/nginx.conf.template, the licence), which the app's WebView is not.
//
// On the phone:
//   - the rows without media are kept in localStorage and registered at module load, before the
//     store reads the saved profile, so a routine that uses one never shows "Unknown exercise";
//   - the same rows and the media are also kept as files (Library/opengym-catalogue/), the copy
//     that survives the WebView's storage being cleared; the files are what the app shows
//     (Capacitor.convertFileSrc, the way lib/media-store-fs.js shows a custom exercise's video);
//   - at each start the file is fetched again through native HTTP (no CORS for capacitor://).
// A row the bundle already has is ignored (lib/exercises.js registerCatalogueExtra), so a build
// that ships an exercise itself never uses this copy of it. Web builds never run any of this: the
// PWA is built from the same catalogue the server serves.
import { registerCatalogueExtra } from './exercises.js'
import { refreshCatalogueText } from './i18n.js'

export const EXTRA_PATH = '/exercise-media/extra.json'
const LS_KEY = 'gym_catalogue_extra_v1'
const DIR = 'opengym-catalogue'
const ROWS_FILE = DIR + '/rows.json'
const MAX_ROWS = 500
const MAX_B64 = 4 * 1024 * 1024
const ID_RE = /^\d{4,6}$/
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/

const str = (v, max = 2000) => typeof v === 'string' && v.length > 0 && v.length <= max
const strs = (v, max = 40) => Array.isArray(v) && v.length <= max && v.every(s => str(s))
const bytesOf = b64 => { try { return atob(b64.slice(0, 24)) } catch { return '' } }
// The first bytes say what a file is: a WebP is RIFF....WEBP, an MP4 has 'ftyp' at byte 4.
const isWebp = b64 => { const s = bytesOf(b64); return s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WEBP' }
const isMp4 = b64 => bytesOf(b64).slice(4, 8) === 'ftyp'

function textOf(tr) {
  if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return undefined
  const out = {}
  for (const [lang, t] of Object.entries(tr)) {
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang) || !t || typeof t !== 'object') continue
    const o = {}
    if (str(t.n, 200)) o.n = t.n
    if (str(t.d)) o.d = t.d
    if (strs(t.st)) o.st = t.st
    if (Object.keys(o).length) out[lang] = o
  }
  return Object.keys(out).length ? out : undefined
}

/** One row as the app keeps it, or null. `withMedia`: the still and the clip must be there. */
export function cleanRow(r, withMedia) {
  if (!r || typeof r !== 'object' || !ID_RE.test(r.id) || !str(r.n, 200) || !str(r.bp, 60) || !str(r.eq, 60) || !str(r.tg, 60)) return null
  if (r.img !== r.id + '.webp' || r.gif !== r.id + '.mp4') return null
  const row = {
    id: r.id, n: r.n, bp: r.bp, eq: r.eq, tg: r.tg, mg: typeof r.mg === 'string' ? r.mg : '',
    sm: strs(r.sm) ? r.sm : [], img: r.img, gif: r.gif,
  }
  if (str(r.cat, 60)) row.cat = r.cat
  if (r.hd === 1) row.hd = 1
  if (r.ds === 1) row.ds = 1
  if (str(r.mk, 60)) row.mk = r.mk
  if (strs(r.nd, 4)) row.nd = r.nd
  if (strs(r.st)) row.st = r.st
  if (str(r.desc)) row.desc = r.desc
  const tr = textOf(r.tr)
  if (tr) row.tr = tr
  if (withMedia) {
    if (typeof r.still !== 'string' || typeof r.clip !== 'string' || r.still.length > MAX_B64 || r.clip.length > MAX_B64) return null
    if (!B64_RE.test(r.still) || !B64_RE.test(r.clip) || !isWebp(r.still) || !isMp4(r.clip)) return null
    row.still = r.still
    row.clip = r.clip
  }
  return row
}

/** The rows of a catalogue file (with media) or of the kept copy (without), invalid ones dropped. */
export function parseExtra(data, withMedia) {
  if (!data || data.v !== 1 || !Array.isArray(data.rows) || data.rows.length > MAX_ROWS) return null
  const seen = new Set()
  return data.rows.map(r => cleanRow(r, withMedia)).filter(r => r && !seen.has(r.id) && seen.add(r.id))
}

const textRows = rows => rows.map(({ still, clip, ...r }) => r)
// A cheap fingerprint of a file's bytes, to write it again only when it changed.
const sigOf = b64 => b64.length + ':' + b64.slice(-48)

let current = { rows: [], urls: {} }
function apply(rows, urls = current.urls) {
  current = { rows, urls }
  registerCatalogueExtra(rows.map(r => ({ ...r, ...(urls[r.id] || {}) })))
}

/** The rows kept in localStorage, registered synchronously. → how many. */
export function bootFromLocal(storage = globalThis.localStorage) {
  try {
    const rows = parseExtra(JSON.parse(storage?.getItem(LS_KEY) || 'null'), false)
    if (rows?.length) { apply(rows); return rows.length }
  } catch { /* nothing kept, or unreadable: the file copy comes next */ }
  return 0
}

const fsDeps = async () => {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Capacitor } = await import('@capacitor/core')
  return { FS: Filesystem, Directory, Encoding, convert: u => Capacitor.convertFileSrc(u) }
}

/**
 * The kept files first (when localStorage had nothing), then the server's current file. Every
 * failure leaves what is already registered as it is. → the ids registered at the end.
 */
export async function syncCatalogueExtra({ base, fetchImpl, deps = fsDeps, storage = globalThis.localStorage, notify = refreshCatalogueText } = {}) {
  let d = null
  try { d = await deps() } catch { /* not the phone app */ }
  const opts = path => ({ path, directory: d.Directory.Library })
  const urlsFor = async rows => {
    const urls = {}
    for (const r of rows) {
      try {
        const [img, gif] = await Promise.all(['.webp', '.mp4'].map(async ext => d.convert((await d.FS.getUri(opts(DIR + '/' + r.id + ext))).uri)))
        await Promise.all(['.webp', '.mp4'].map(ext => d.FS.stat(opts(DIR + '/' + r.id + ext))))
        urls[r.id] = { imgUrl: img, gifUrl: gif }
      } catch { /* no file yet: the row shows without its picture */ }
    }
    return urls
  }
  let kept = null
  if (d) {
    try { kept = JSON.parse((await d.FS.readFile({ ...opts(ROWS_FILE), encoding: d.Encoding.UTF8 })).data) } catch { kept = null }
    const rows = (current.rows.length ? current.rows : parseExtra(kept, false)) || []
    if (rows.length) { apply(rows, await urlsFor(rows)); notify() }
  }
  if (!base || !fetchImpl) return Object.keys(current.urls)
  let fresh = null
  try {
    const res = await fetchImpl(base.replace(/\/+$/, '') + EXTRA_PATH + '?t=' + Date.now())
    if (res.ok) fresh = parseExtra(await res.json(), true)
  } catch { fresh = null }
  if (!fresh) return current.rows.map(r => r.id)
  const sigs = {}
  if (d) {
    const old = kept?.sigs || {}
    try { await d.FS.mkdir({ ...opts(DIR), recursive: true }) } catch { /* already there */ }
    for (const r of fresh) {
      const sig = sigOf(r.still) + '|' + sigOf(r.clip)
      try {
        if (old[r.id] !== sig) {
          await d.FS.writeFile({ ...opts(DIR + '/' + r.id + '.webp'), data: r.still })
          await d.FS.writeFile({ ...opts(DIR + '/' + r.id + '.mp4'), data: r.clip })
        }
        sigs[r.id] = sig
      } catch { /* that one shows without its picture until the next start */ }
    }
  }
  const rows = textRows(fresh)
  try { storage?.setItem(LS_KEY, JSON.stringify({ v: 1, rows })) } catch { /* full or blocked: the file copy stands */ }
  if (d) {
    try { await d.FS.writeFile({ ...opts(ROWS_FILE), data: JSON.stringify({ v: 1, rows, sigs }), encoding: d.Encoding.UTF8, recursive: true }) } catch { /* next start fetches again */ }
  }
  apply(rows, d ? await urlsFor(rows) : {})
  notify()
  return rows.map(r => r.id)
}
