#!/usr/bin/env node
/* Import a workout export (Hevy, Strong, FitNotes, ...) into a profile on the server, the way the
 * app's Settings → Data & backup → Import from another app does: the same parser and merge
 * (lib/import-apps.js parseImportFile, lib/import-csv.js mergeImport), then PUT /api/data with the
 * revision it read, so the server stamps the change and every device merges it.
 *
 *   OPENGYM_URL=https://gym.example.com OPENGYM_TOKEN=<bearer> node scripts/operator/import-file.mjs export.csv [--write]
 *
 * The token is a session for the profile (api/scripts/operator-session.mjs). Without --write it
 * only prints what would be imported. Days that already have a workout are left alone, so running
 * it twice adds nothing the second time. */
import fs from 'node:fs'
import { parseImportFile, mergeImportedRoutines } from '../../frontend/src/lib/import-apps.js'
import { mergeImport } from '../../frontend/src/lib/import-csv.js'
import { choiceOpts } from '../../frontend/src/lib/import-choices.js'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const write = args.includes('--write')
const base = (process.env.OPENGYM_URL || '').replace(/\/+$/, '')
const token = (process.env.OPENGYM_TOKEN || '').trim()
if (!file || !base || !token) {
  console.error('usage: OPENGYM_URL=... OPENGYM_TOKEN=... import-file.mjs <file> [--write]')
  process.exit(2)
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
async function api(path, init = {}) {
  const res = await fetch(base + path, { ...init, headers, redirect: 'manual' })
  const body = await res.json().catch(() => null)
  if (!res.ok && res.status !== 409) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${JSON.stringify(body)}`)
  return { status: res.status, body }
}

const text = fs.readFileSync(file, 'utf8')
let got = await api('/api/data')
for (let attempt = 1; attempt <= 3; attempt++) {
  const doc = got.body?.state
  if (!doc || typeof doc !== 'object') throw new Error('the profile has no synced data yet: sign in on a device once')
  const S = structuredClone(doc)
  const parsed = parseImportFile(text, choiceOpts(S, {}))
  if (!parsed || parsed.error) throw new Error(`could not read ${file}: ${parsed?.error || 'unknown format'}`)
  const res = mergeImport(S, parsed)
  const plans = parsed.kind !== 'bodyweight' && parsed.routines?.routines?.length ? mergeImportedRoutines(S, parsed.routines) : null
  console.error(`${parsed.source}: ${parsed.workouts?.length ?? 0} workouts in the file, ${res.added} new` +
    (plans ? `, ${plans.added} routines` : '') +
    (parsed.unmatchedNames?.length ? `; own exercises for: ${parsed.unmatchedNames.join(', ')}` : ''))
  if (!write) { console.error('dry run, nothing saved (pass --write)'); process.exit(0) }
  if (!res.added && !plans?.added) { console.error('nothing new to save'); process.exit(0) }
  const put = await api('/api/data', { method: 'PUT', body: JSON.stringify({ state: S, baseRev: got.body.rev ?? 0, ...(typeof doc._wid === 'string' ? { baseWid: doc._wid } : {}) }) })
  if (put.status !== 409) { console.error(`saved, revision ${put.body?.rev}`); process.exit(0) }
  console.error('another device wrote in between, merging again')
  got = { status: 200, body: { state: put.body.state, rev: put.body.rev } }
}
throw new Error('gave up after 3 conflicts')
