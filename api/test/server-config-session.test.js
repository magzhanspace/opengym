/* GET /api/config: the flags the login screen and the pre-login boot need (invite_only for the
   invite field, allow_guest for "continue without account") are public, there is nobody to
   authenticate at the point they are read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_cfg_1';

const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-config-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'C', created: new Date().toISOString() }], creds: [], subs: [], invites: []
  }));
  // MEDIA_UPLOADS=0: the answers below are compared whole, and they are about the login flags. The public media block has its own tests in server-media.test.js.
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', INVITE_ONLY: '1', ALLOW_GUEST: '0', MEDIA_UPLOADS: '0', ...env }
  });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const port = await boundPort(child, () => log);
  return { api: `http://127.0.0.1:${port}`, dataDir };
}

test('GET /api/config: the login flags are public, and a session adds only its own flags', async t => {
  const h = await startServer(t);
  const config = headers => fetch(`${h.api}/api/config`, headers ? { headers } : undefined).then(r => r.json());

  // Nobody signed in: what the login screen and boot() actually read, and nothing else.
  assert.deepEqual(await config(), { invite_only: true, allow_guest: false, signed_in: false });

  // A session cookie, and the paired mobile app's Bearer token, are both a session.
  assert.deepEqual(await config({ Cookie: `gymsid=${mint(UID)}` }), { invite_only: true, allow_guest: false, signed_in: true, api_tokens: true });
  assert.deepEqual(await config({ Authorization: `Bearer ${mint(UID)}` }), { invite_only: true, allow_guest: false, signed_in: true, api_tokens: true });

  // A signature that does not verify is a stranger, not a session.
  const forged = await config({ Cookie: 'gymsid=u_cfg_1:99999999999999:0.notarealmac' });
  assert.deepEqual(forged, { invite_only: true, allow_guest: false, signed_in: false });
});

/* The console of every guest start showed "GET /api/me 401": the session cookie is HttpOnly, so
   the app had to ask to learn that nobody is signed in. `signed_in` is that answer, on the route
   the app reads first anyway. It has to say exactly what /api/me would: a `false` beside a
   session that /api/me accepts would leave a signed-in browser on the sign-in screen. And
   /api/me keeps its 401: paired phones, older apps and scripts read the status. */
test('GET /api/config: signed_in says what GET /api/me would answer, and /api/me keeps its 401', async t => {
  const h = await startServer(t);
  const both = async headers => {
    const cfg = await fetch(`${h.api}/api/config`, headers ? { headers } : undefined).then(r => r.json());
    const me = await fetch(`${h.api}/api/me`, headers ? { headers } : undefined);
    return { signedIn: cfg.signed_in, me: me.status, body: await me.json() };
  };
  const expired = (() => {   // a correctly signed cookie whose time is up
    const payload = `${UID}:${Date.now() - 1000}:0`;
    return `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
  })();
  const cases = [
    ['nobody', undefined, false],
    ['a cookie', { Cookie: `gymsid=${mint(UID)}` }, true],
    ['a paired phone', { Authorization: `Bearer ${mint(UID)}` }, true],
    ['a forged cookie', { Cookie: 'gymsid=u_cfg_1:99999999999999:0.notarealmac' }, false],
    ['an expired cookie', { Cookie: `gymsid=${expired}` }, false],
    ['a profile that does not exist', { Cookie: `gymsid=${mint('u_nobody')}` }, false]
  ];
  for (const [who, headers, yes] of cases) {
    const r = await both(headers);
    assert.equal(r.signedIn, yes, `${who}: signed_in`);
    assert.equal(r.me, yes ? 200 : 401, `${who}: /api/me status is what it always was`);
    if (yes) assert.equal(r.body.user.id, UID); else assert.deepEqual(r.body, { error: 'not signed in' });
  }
});

test('GET /api/config: DEFAULT_LANG is public when set, absent when unset or malformed (#303)', async t => {
  const set = await startServer(t, { DEFAULT_LANG: 'pt-BR' });
  const anon = await fetch(`${set.api}/api/config`).then(r => r.json());
  assert.deepEqual(anon, { invite_only: true, allow_guest: false, signed_in: false, default_lang: 'pt-BR' }, 'the sign-in screen can read it');

  const bad = await startServer(t, { DEFAULT_LANG: '<script>' });
  assert.equal('default_lang' in await fetch(`${bad.api}/api/config`).then(r => r.json()), false);

  const unset = await startServer(t, { DEFAULT_LANG: '' });
  assert.equal('default_lang' in await fetch(`${unset.api}/api/config`).then(r => r.json()), false);
});
