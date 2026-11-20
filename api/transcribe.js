/* Voice notes: a short clip recorded during a workout, turned into text by OpenAI's transcription
 * API (POST /api/transcribe). The server only passes the clip through: nothing is stored, and
 * neither the audio nor the text is logged. Off unless OPENAI_API_KEY is set.
 *
 *   OPENAI_API_KEY        the key; without it the route answers 404 and /api/config has no `voice`
 *   TRANSCRIBE_MODEL      default gpt-transcribe
 *   TRANSCRIBE_LANGUAGES  optional, comma separated ("ru,en"): a hint, short clips are guessed
 *                         wrong without one
 *   TRANSCRIBE_URL        default https://api.openai.com/v1/audio/transcriptions (tests point it
 *                         at a local stand-in)
 */

export const VOICE_MAX_BYTES = 4 * 1024 * 1024   // about 3 minutes at the app's 32 kbit/s, under nginx's 5m
const HINT_MAX = 200

// What a browser's MediaRecorder makes (Safari: mp4/aac, Chrome and Firefox: webm or ogg/opus),
// mapped to a file name the API recognises the format by.
const TYPES = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav'
}

export function voiceConfig(env = process.env) {
  const key = String(env.OPENAI_API_KEY || '').trim()
  if (!key) return null
  return {
    key,
    model: String(env.TRANSCRIBE_MODEL || 'gpt-transcribe').trim(),
    languages: String(env.TRANSCRIBE_LANGUAGES || '').split(',').map(s => s.trim()).filter(Boolean),
    url: String(env.TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions').trim()
  }
}

// "audio/mp4;codecs=mp4a.40.2" → "m4a", or null for anything that is not a clip we take.
export function clipExtension(contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase()
  return TYPES[base] || null
}

// The exercise the clip is about, sent URL-encoded in a header so the API can spell its name.
export function hintOf(header) {
  if (typeof header !== 'string' || !header) return ''
  let s
  try { s = decodeURIComponent(header) } catch { return '' }
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, HINT_MAX)
}

// The whole body as one Buffer, refused past `max`. The rest of an oversized upload is read and
// dropped rather than the socket reset, so the client gets the 413 (see readBody in server.js).
export function readRaw(req, max = VOICE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0, over = false
    const chunks = []
    req.on('data', d => {
      size += d.length
      if (over) { if (size > 2 * max) req.destroy(); return }
      if (size > max) {
        over = true; chunks.length = 0
        reject(Object.assign(new Error('the clip is too long'), { status: 413 }))
        return
      }
      chunks.push(d)
    })
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks)) })
    req.on('error', e => { if (!over) reject(e) })
  })
}

// One clip → its text. Throws with `status` 502 when the API refuses or cannot be reached, with
// only the API's status in the message.
export async function transcribe({ audio, contentType, hint = '' }, cfg, { fetch = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const ext = clipExtension(contentType)
  if (!ext) throw Object.assign(new Error('not an audio clip'), { status: 415 })
  const form = new FormData()
  form.append('file', new Blob([audio], { type: String(contentType).split(';')[0].trim() }), `clip.${ext}`)
  form.append('model', cfg.model)
  const many = cfg.model === 'gpt-transcribe'
  for (const lang of cfg.languages.slice(0, many ? 5 : 1)) form.append(many ? 'languages[]' : 'language', lang)
  if (hint) form.append('prompt', `A note in a gym log about the exercise: ${hint}`)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  let r
  try {
    r = await fetch(cfg.url, { method: 'POST', headers: { authorization: `Bearer ${cfg.key}` }, body: form, signal: ctl.signal })
  } catch (e) {
    throw Object.assign(new Error(ctl.signal.aborted ? 'transcription timed out' : 'transcription service unreachable'), { status: 502 })
  } finally { clearTimeout(timer) }
  const body = await r.json().catch(() => null)
  if (!r.ok || !body || typeof body.text !== 'string') {
    throw Object.assign(new Error(`transcription failed (${r.status})`), { status: 502 })
  }
  return body.text.trim()
}
