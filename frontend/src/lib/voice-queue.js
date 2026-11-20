/* Where voice-note clips wait for their text (lib/voice-notes.js): IndexedDB database
 * 'opengym-voice', object store 'clips', one record per clip keyed by its id —
 * { id, uid, start, exId, entryIdx, hint, at, ms, mime, blob, text?, tries? }.
 *
 * Its own database rather than lib/media-store.js: a clip is not a file of the profile, it is never
 * synced or kept, and it goes once its text is written. Where IndexedDB cannot be opened (some
 * private windows) the clips live in memory and are sent at once or lost with the tab. */

const DB = 'opengym-voice'
const STORE = 'clips'

const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

export function memoryQueue() {
  const m = new Map()
  return {
    persistent: false,
    async put(c) { m.set(c.id, { ...c }) },
    async all() { return [...m.values()].map(c => ({ ...c })) },
    async patch(id, fields) { const c = m.get(id); if (c) m.set(id, { ...c, ...fields }) },
    async remove(id) { m.delete(id) },
  }
}

export function idbQueue({ idb = globalThis.indexedDB } = {}) {
  let opening = null
  const open = () => opening || (opening = new Promise((resolve, reject) => {
    if (!idb) { reject(new Error('no IndexedDB')); return }
    const r = idb.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('blocked'))
  }))
  const store = async mode => (await open()).transaction(STORE, mode).objectStore(STORE)
  return {
    persistent: true,
    async put(c) { await req((await store('readwrite')).put(c)) },
    async all() { return await req((await store('readonly')).getAll()) },
    async patch(id, fields) {
      const s = await store('readwrite')
      const c = await req(s.get(id))
      if (c) await req(s.put({ ...c, ...fields }))
    },
    async remove(id) { await req((await store('readwrite')).delete(id)) },
    async ready() { await open() },
  }
}

// The device's queue: IndexedDB, or memory when it will not open.
let shared = null
export async function voiceQueue() {
  if (shared) return shared
  const q = idbQueue()
  try { await q.ready(); shared = q } catch { shared = memoryQueue() }
  return shared
}
