// The phone app's side of lib/catalogue-extra.js. Imported first in main.jsx: the exercises kept
// from the last start are registered before the store loads the saved profile. startCatalogueExtra
// then fetches the server's current list once the app is drawn. Web builds do nothing here.
import { MOBILE } from './mobile.js'
import { bootFromLocal, syncCatalogueExtra } from './catalogue-extra.js'
import { nativeFetch } from './capacitor-fetch.js'
import { loadRemoteFile } from './mobile.js'
import { DEFAULT_SERVER } from './remote.js'

if (MOBILE) bootFromLocal()

/** The paired server's list, or this build's default server's when the app is not paired. */
export async function startCatalogueExtra() {
  if (!MOBILE) return
  let base = DEFAULT_SERVER
  try {
    const r = await loadRemoteFile()
    if (r?.mode === 'remote' && r.base) base = r.base
  } catch { /* not paired: the default server */ }
  try { await syncCatalogueExtra({ base, fetchImpl: nativeFetch }) } catch { /* the kept copy stays */ }
}
