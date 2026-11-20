#!/usr/bin/env node
/* Operator access: a short-lived bearer session for one profile, signed with this instance's
 * DATA_DIR/secret. For the server's owner, who can read that file anyway, to write to a profile
 * through PUT /api/data the way a device does (so the change is stamped and every device merges
 * it), without signing in with the profile's passkey.
 *
 *   docker compose exec -T api node --input-type=module - Magzhan 15 < api/scripts/operator-session.mjs
 *   DATA_DIR=./data node api/scripts/operator-session.mjs Magzhan 15
 *
 * Arguments: the profile's name or id, and the lifetime in minutes (default 15, at most 60).
 * Only the token goes to stdout. It is a kind `b` (bearer) session at the user's current session
 * version, so "Sign out everywhere" ends it like any other. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [who, minutesArg] = process.argv.slice(2)
if (!who) {
  console.error('usage: operator-session.mjs <profile name or id> [minutes]')
  process.exit(2)
}
const minutes = Math.min(Math.max(Number(minutesArg) || 15, 1), 60)
const DATA = process.env.DATA_DIR || '/data'
const secret = fs.readFileSync(path.join(DATA, 'secret'), 'utf8').trim()
const db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'))
const matches = (db.users || []).filter(u => u.id === who || u.name === who)
if (matches.length !== 1) {
  console.error(matches.length ? `"${who}" names ${matches.length} profiles; pass the id` : `no profile "${who}"`)
  process.exit(1)
}
const user = matches[0]
if (user.disabled) { console.error(`profile "${who}" is disabled`); process.exit(1) }
const exp = Date.now() + minutes * 60000
const payload = `${user.id}:${exp}:${user.sv || 0}:b`
const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
process.stdout.write(`${payload}.${mac}\n`)
console.error(`operator session for ${user.name} (${user.id}), ${minutes} min`)
