/* POST /api/transcribe: a voice note's clip goes to the transcription API and its text comes back.
   The API is a local stand-in here (TRANSCRIBE_URL), which records what it was sent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { clipExtension, hintOf, transcribe, voiceConfig } from '../transcribe.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_voice_1';
const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function fakeOpenAI(t, answer = { status: 200, body: { text: ' Тяжело на последнем подходе ' } }) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, type: req.headers['content-type'], body: Buffer.concat(chunks).toString('latin1') });
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  return { url: `http://127.0.0.1:${srv.address().port}/v1/audio/transcriptions`, seen };
}

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-voice-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'V', created: new Date().toISOString() }], creds: [], subs: [], invites: []
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', MEDIA_UPLOADS: '0', OPENAI_API_KEY: '', ...env }
  });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const port = await boundPort(child, () => log);
  return { api: `http://127.0.0.1:${port}`, log: () => log };
}

const clip = Buffer.from('fake aac bytes, the stand-in does not decode them');
const post = (api, { auth = true, type = 'audio/mp4', body = clip, headers = {} } = {}) => fetch(api + '/api/transcribe', {
  method: 'POST',
  headers: { 'content-type': type, ...(auth ? { authorization: `Bearer ${mint(UID)}` } : {}), ...headers },
  body
});

test('without a key the route is off and /api/config says nothing about voice', async t => {
  const { api } = await startServer(t);
  assert.equal((await post(api)).status, 404);
  const cfg = await (await fetch(api + '/api/config')).json();
  assert.equal(cfg.voice, undefined);
});

test('with a key: the clip goes to the API with the model, language and hint, the text comes back trimmed', async t => {
  const openai = await fakeOpenAI(t);
  const { api, log } = await startServer(t, { OPENAI_API_KEY: 'sk-test', TRANSCRIBE_URL: openai.url, TRANSCRIBE_LANGUAGES: 'ru' });
  assert.equal((await (await fetch(api + '/api/config')).json()).voice, true);

  const r = await post(api, { headers: { 'x-opengym-hint': encodeURIComponent('Румынская тяга') } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: 'Тяжело на последнем подходе' });

  assert.equal(openai.seen.length, 1);
  const sent = openai.seen[0];
  assert.equal(sent.auth, 'Bearer sk-test');
  assert.match(sent.type, /^multipart\/form-data/);
  assert.match(sent.body, /filename="clip\.m4a"/);
  assert.match(sent.body, /name="model"\r\n\r\ngpt-transcribe/);
  assert.match(sent.body, /name="languages\[\]"\r\n\r\nru/);
  assert.ok(sent.body.includes(Buffer.from('Румынская тяга').toString('latin1')), 'the hint is in the prompt');
  assert.ok(sent.body.includes(clip.toString('latin1')), 'the clip itself');
  // Nothing of the words goes to the log.
  assert.ok(!log().includes('Тяжело'));
});

test('refusals: no session, not audio, the API failing', async t => {
  const openai = await fakeOpenAI(t, { status: 400, body: { error: { message: 'Invalid file format.' } } });
  const { api } = await startServer(t, { OPENAI_API_KEY: 'sk-test', TRANSCRIBE_URL: openai.url });
  assert.equal((await post(api, { auth: false })).status, 401);
  assert.equal((await post(api, { type: 'application/json', body: '{}' })).status, 415);
  const r = await post(api);
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /transcription failed \(400\)/);
});

test('a clip past 4 MiB is refused with 413', async t => {
  const openai = await fakeOpenAI(t);
  const { api } = await startServer(t, { OPENAI_API_KEY: 'sk-test', TRANSCRIBE_URL: openai.url });
  const r = await post(api, { body: Buffer.alloc(4 * 1024 * 1024 + 1) });
  assert.equal(r.status, 413);
  assert.equal(openai.seen.length, 0);
});

test('helpers: content types, hints, config', async () => {
  assert.equal(clipExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.equal(clipExtension('audio/webm;codecs=opus'), 'webm');
  assert.equal(clipExtension('video/mp4'), null);
  assert.equal(hintOf(encodeURIComponent('Bench\npress')), 'Bench press');
  assert.equal(hintOf('%E0%A4%A'), '');
  assert.equal(voiceConfig({}), null);
  assert.deepEqual(voiceConfig({ OPENAI_API_KEY: ' k ', TRANSCRIBE_LANGUAGES: 'ru, en' }).languages, ['ru', 'en']);
  // whisper-1 takes one `language`, not `languages[]`.
  let form;
  await transcribe({ audio: clip, contentType: 'audio/ogg' }, { key: 'k', model: 'whisper-1', languages: ['ru', 'en'], url: 'http://x' },
    { fetch: async (_u, init) => { form = init.body; return new Response(JSON.stringify({ text: 'ok' }), { status: 200 }); } });
  assert.deepEqual(form.getAll('language'), ['ru']);
  assert.deepEqual(form.getAll('languages[]'), []);
});
