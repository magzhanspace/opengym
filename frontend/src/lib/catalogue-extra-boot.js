// The phone app's side of lib/catalogue-extra.js. Imported first in main.jsx: the exercises kept
// from the last start are registered before the store loads the saved profile. startCatalogueExtra
// then fetches the server's current list once the app is drawn. Web builds do nothing here.
import { MOBILE } from './mobile.js'
import { bootFromLocal, syncCatalogueExtra, currentIds } from './catalogue-extra.js'
import { nativeFetch } from './capacitor-fetch.js'
import { loadRemoteFile } from './mobile.js'
import { DEFAULT_SERVER } from './remote.js'

if (MOBILE) bootFromLocal()

// The paired server, or this build's default server when the app is not paired.
async function serverBase() {
  try {
    const r = await loadRemoteFile()
    if (r?.mode === 'remote' && r.base) return r.base
  } catch { /* not paired */ }
  return DEFAULT_SERVER
}

/** At start: the list again only if the server's changed. */
export async function startCatalogueExtra() {
  if (!MOBILE) return
  try { await syncCatalogueExtra({ base: await serverBase(), fetchImpl: nativeFetch }) } catch { /* the kept copy stays */ }
}

/** Settings → Update exercises: the list downloaded now. → syncCatalogueExtra's answer. */
export async function updateCatalogueExtra() {
  const before = new Set(currentIds())
  const out = await syncCatalogueExtra({ base: await serverBase(), fetchImpl: nativeFetch, force: true })
  return { ...out, added: out.ids.filter(id => !before.has(id)).length }
}
