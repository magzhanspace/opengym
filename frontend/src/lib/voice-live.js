/* The voice-note recorder and the run that turns waiting clips into text (lib/voice-notes.js).
 * One clip at a time, on the exercise its mic was tapped on. A clip stops on the second tap, after
 * VOICE_MAX_MS, or when the app goes to the background (iOS stops the microphone of a hidden page,
 * so what was said so far is kept rather than lost). */
import { create } from 'zustand'
import { api } from './api.js'
import { t } from './i18n-core.js'
import { useUI } from '../store/useUI.js'
import { applyVoiceNote, flushClips, pickMime, VOICE_BITS, VOICE_MAX_MS } from './voice-notes.js'
import { voiceQueue } from './voice-queue.js'
import { holdMicSession, releaseMicSession } from './sound.js'

// rec: the clip being recorded ({ start, exId, entryIdx, at }), pending: clips waiting for text.
export const useVoice = create(() => ({ rec: null, pending: 0 }))

let storeRef = null
let current = null
let flushing = null
const MIN_MS = 700   // a tap and a tap again is a slip, not a note

const toast = msg => { try { useUI.getState().toast(msg) } catch { /* no UI under test */ } }
const uid = () => storeRef?.getState().user?.id ?? null

export function voiceSupported() {
  return typeof globalThis.MediaRecorder === 'function' && !!globalThis.navigator?.mediaDevices?.getUserMedia
}

async function countPending() {
  const me = uid()
  try { useVoice.setState({ pending: me ? (await (await voiceQueue()).all()).filter(c => c.uid === me).length : 0 }) } catch { /* nothing to show */ }
}

/** Starts a clip for this exercise of the workout in progress. Throws when the mic is refused. */
export async function startVoice({ start, exId, entryIdx, hint }) {
  if (current) return
  const me = uid()
  if (!me) return
  holdMicSession()
  let stream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch (e) { releaseMicSession(); throw e }
  const mime = pickMime()
  let mr
  try { mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: VOICE_BITS }) }
  catch (e) { stream.getTracks().forEach(tr => tr.stop()); releaseMicSession(); throw e }
  const chunks = []
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
  const at = Date.now()
  current = { mr, stream, chunks, at, mime: mr.mimeType || mime, meta: { uid: me, start, exId, entryIdx, hint: String(hint || '').slice(0, 200) } }
  current.timer = setTimeout(() => { stopVoice() }, VOICE_MAX_MS)
  mr.start(1000)
  useVoice.setState({ rec: { start, exId, entryIdx, at } })
}

/** Stops the clip being recorded, keeps it on the device and tries to turn it into text. */
export function stopVoice() {
  const c = current
  if (!c) return Promise.resolve(null)
  current = null
  clearTimeout(c.timer)
  useVoice.setState({ rec: null })
  return new Promise(resolve => {
    let ended = false
    const finish = async () => {
      if (ended) return
      ended = true
      c.stream.getTracks().forEach(tr => tr.stop())
      releaseMicSession()
      const ms = Date.now() - c.at
      const type = String(c.mime || c.chunks[0]?.type || 'audio/mp4').split(';')[0].trim()
      const blob = new Blob(c.chunks, { type })
      if (ms < MIN_MS || !blob.size) { resolve(null); return }
      const id = globalThis.crypto?.randomUUID?.() || `${c.at}-${Math.random().toString(36).slice(2)}`
      const clip = { id, ...c.meta, at: c.at, ms, mime: type, blob }
      try { await (await voiceQueue()).put(clip) }
      catch { toast(t('The voice note could not be saved on this device.')); resolve(null); return }
      await countPending()
      toast(globalThis.navigator?.onLine === false
        ? t('Voice note saved. It turns into text once you are online.')
        : t('Voice note saved, turning it into text…'))
      resolve(clip)
      flushVoice()
    }
    c.mr.onstop = finish
    try { if (c.mr.state !== 'inactive') c.mr.stop(); else finish() } catch { finish() }
  })
}

/** Sends the waiting clips, if this server takes them; one run at a time. */
export function flushVoice() {
  if (flushing) return flushing
  const st = storeRef?.getState()
  if (!st?.user || !st.config?.voice) return Promise.resolve(null)
  flushing = (async () => {
    try {
      const queue = await voiceQueue()
      const r = await flushClips({
        uid: st.user.id,
        queue,
        post: async c => (await api('/api/transcribe', {
          method: 'POST',
          body: c.blob,
          timeout: 90000,
          headers: { 'Content-Type': c.mime, ...(c.hint ? { 'X-OpenGym-Hint': encodeURIComponent(c.hint) } : {}) },
        })).text,
        write: (clip, now) => storeRef.getState().update(s => { applyVoiceNote(s, clip, now) }),
      })
      if (r.done) toast(r.done === 1 ? t('Voice note added to the exercise note.') : t('{0} voice notes added to the notes.', r.done))
      if (r.dropped) toast(t('A voice note could not be turned into text.'))
      return r
    } catch { return null }
    finally { flushing = null; countPending() }
  })()
  return flushing
}

/** Wires the queue to the store: clips go out on start, when back online, once this server says
 * it takes them, and when a workout is finished. Returns the unsubscribe. */
export function startVoiceNotes(store) {
  storeRef = store
  const later = () => setTimeout(() => { flushVoice() }, 1500)
  const online = () => later()
  const hidden = () => { if (current && document.visibilityState === 'hidden') stopVoice() }
  const pagehide = () => { if (current) stopVoice() }
  window.addEventListener('online', online)
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('pagehide', pagehide)
  const unsub = store.subscribe((s, prev) => {
    const ready = s.user && s.config?.voice
    const wasReady = prev.user && prev.config?.voice
    if (ready && (!wasReady || s.user.id !== prev.user?.id)) { countPending(); later() }
    // The workout in progress was just finished or discarded: its clips have their place now.
    if (ready && prev.S?.active && !s.S?.active) later()
  })
  later()
  return () => { unsub(); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide) }
}
