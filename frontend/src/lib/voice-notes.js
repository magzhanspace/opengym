/* Voice notes: a clip recorded on an exercise during a workout becomes text in that exercise's
 * note. The clip waits on the device (lib/voice-queue.js) until the server has turned it into text
 * (POST /api/transcribe), which may be after the workout is finished and saved, so a clip is keyed
 * by the session's `start` (kept on the saved workout) and the exercise id, not by where it sat.
 *
 * The order in flushClips is what keeps a note from being written twice: the text is saved on the
 * clip first, then written into the state, then the clip is removed. A run that stops between the
 * last two writes the text again on the next run; one that stops before keeps the audio. */
import { NOTE_MAX } from './history.js'
import { stampWorkout } from './sync-merge.js'

export const VOICE_MAX_MS = 3 * 60 * 1000
export const VOICE_BITS = 32000
// A clip the server keeps refusing (a format the API will not read) is dropped after this many runs.
export const VOICE_MAX_TRIES = 5

// What this browser's MediaRecorder can make, Safari's mp4 first: the API reads all of them.
const MIMES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
export function pickMime(MR = globalThis.MediaRecorder) {
  if (typeof MR?.isTypeSupported !== 'function') return ''
  return MIMES.find(m => { try { return MR.isTypeSupported(m) } catch { return false } }) || ''
}

// The new text on a line of its own under what was there, within the note's cap.
export function appendNote(prev, text) {
  const was = typeof prev === 'string' ? prev.trim() : ''
  const add = typeof text === 'string' ? text.trim() : ''
  if (!add) return was
  return (was ? was + '\n' + add : add).slice(0, NOTE_MAX)
}

function entryFor(entries, clip) {
  if (!Array.isArray(entries)) return null
  const at = entries[clip.entryIdx]
  if (at && at.id === clip.exId) return at
  return entries.find(e => e && e.id === clip.exId) || null
}

/**
 * Writes a clip's text into the state (a draft, mutated). The workout in progress if the clip was
 * recorded in it, else the saved workout with the same start: the exercise's note, or the
 * workout's own note when the exercise was removed since. A saved workout is stamped so the edit
 * wins the sync (stampWorkout). Returns where it went, or null when the workout is gone
 * (discarded): then there is nothing to attach it to.
 */
export function applyVoiceNote(S, clip, now = Date.now()) {
  const text = typeof clip?.text === 'string' ? clip.text.trim() : ''
  if (!text) return 'empty'
  let where = null
  const A = S.active
  const live = A && A.start === clip.start
  if (live && !A.editingWorkoutId) {
    const e = entryFor(A.entries, clip)
    if (e) e.note = appendNote(e.note, text)
    else A.note = appendNote(A.note, text)
    return 'active'
  }
  const w = Array.isArray(S.workouts) ? S.workouts.find(x => x && x.start === clip.start) : null
  if (w) {
    const e = entryFor(w.entries, clip)
    if (e) e.note = appendNote(e.note, text)
    else w.note = appendNote(w.note, text)
    stampWorkout(w, now)
    where = 'workout'
  }
  // The saved workout open in the editor: its copy is what Save writes back, so it gets the text too.
  if (live) {
    const e = entryFor(A.entries, clip)
    if (e) e.note = appendNote(e.note, text)
    else A.note = appendNote(A.note, text)
    where = where || 'active'
  }
  return where
}

/**
 * Sends the waiting clips of the signed-in account to the server and writes their text in, oldest
 * first. `post(clip)` answers the text or throws with the server's `status` (none when offline).
 * Stops at the first clip that could not be sent for a reason that may pass (offline, timeout,
 * the server busy or rate-limited), so the rest keep their order. Returns { done, dropped, left }.
 */
export async function flushClips({ uid, queue, post, write, now = Date.now }) {
  const out = { done: 0, dropped: 0, left: 0 }
  const clips = (await queue.all()).filter(c => c && c.uid === uid).sort((a, b) => (a.at || 0) - (b.at || 0))
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]
    let text = typeof c.text === 'string' ? c.text : null
    if (text == null) {
      try {
        text = String(await post(c) ?? '')
      } catch (e) {
        const st = Number(e?.status) || 0
        // Refused for good: not audio, too long, empty, or a format the API keeps refusing.
        const final = st === 400 || st === 413 || st === 415 || (st === 502 && (c.tries || 0) + 1 >= VOICE_MAX_TRIES)
        if (final) { await queue.remove(c.id); out.dropped++; continue }
        if (st === 502) await queue.patch(c.id, { tries: (c.tries || 0) + 1 })
        out.left = clips.length - i
        return out
      }
      await queue.patch(c.id, { text, blob: null })
    }
    write({ ...c, text }, now())
    await queue.remove(c.id)
    out.done++
  }
  return out
}
