import { describe, it, expect } from 'vitest'
import { appendNote, applyVoiceNote, flushClips, pickMime, VOICE_MAX_TRIES } from './voice-notes.js'
import { memoryQueue } from './voice-queue.js'
import { NOTE_MAX } from './history.js'

const START = 1795182623111
const clip = over => ({ id: 'c1', uid: 'u1', start: START, exId: '0085', entryIdx: 1, at: 1, mime: 'audio/mp4', blob: 'b', ...over })
const entries = () => [{ id: '0043', sets: [] }, { id: '0085', sets: [], note: 'было' }]

describe('appendNote', () => {
  it('puts the new text on its own line and keeps the cap', () => {
    expect(appendNote('', ' раз ')).toBe('раз')
    expect(appendNote('раз', 'два')).toBe('раз\nдва')
    expect(appendNote('раз', '  ')).toBe('раз')
    expect(appendNote('x'.repeat(NOTE_MAX), 'y').length).toBe(NOTE_MAX)
  })
})

describe('applyVoiceNote', () => {
  it('the workout in progress: the exercise the clip was recorded on', () => {
    const S = { active: { start: START, entries: entries() }, workouts: [] }
    expect(applyVoiceNote(S, clip({ text: 'тяжело' }))).toBe('active')
    expect(S.active.entries[1].note).toBe('было\nтяжело')
  })

  it('finds the exercise by id when it moved, and falls back to the session note when it was removed', () => {
    const S = { active: { start: START, entries: [{ id: '0085', sets: [] }] }, workouts: [] }
    applyVoiceNote(S, clip({ text: 'a' }))
    expect(S.active.entries[0].note).toBe('a')
    applyVoiceNote(S, clip({ exId: 'gone', text: 'b' }))
    expect(S.active.note).toBe('b')
  })

  it('a finished workout: the saved entry, stamped so the edit wins the sync', () => {
    const w = { id: 'w', start: START, entries: entries() }
    const S = { active: null, workouts: [{ id: 'old', start: 1, entries: [] }, w] }
    expect(applyVoiceNote(S, clip({ text: 'потом' }), 42)).toBe('workout')
    expect(w.entries[1].note).toBe('было\nпотом')
    expect(w._ts).toBe(42)
  })

  it('the saved workout open in the editor gets it in both places', () => {
    const w = { id: 'w', start: START, entries: entries() }
    const S = { active: { start: START, editingWorkoutId: 'w', entries: entries() }, workouts: [w] }
    expect(applyVoiceNote(S, clip({ text: 'x' }), 5)).toBe('workout')
    expect(w.entries[1].note).toBe('было\nx')
    expect(S.active.entries[1].note).toBe('было\nx')
  })

  it('a discarded workout has nowhere to put it', () => {
    const S = { active: { start: 7, entries: [] }, workouts: [] }
    expect(applyVoiceNote(S, clip({ text: 'x' }))).toBe(null)
    expect(applyVoiceNote(S, clip({ text: '' }))).toBe('empty')
  })
})

describe('flushClips', () => {
  const setup = async clips => {
    const queue = memoryQueue()
    for (const c of clips) await queue.put(c)
    const written = []
    return { queue, written, write: c => written.push(c.text) }
  }

  it('sends the account’s clips oldest first, writes the text, removes the clip', async () => {
    const { queue, written, write } = await setup([clip({ id: 'b', at: 2 }), clip({ id: 'a', at: 1 }), clip({ id: 'z', uid: 'other' })])
    const r = await flushClips({ uid: 'u1', queue, write, post: async c => 'text ' + c.id })
    expect(r).toEqual({ done: 2, dropped: 0, left: 0 })
    expect(written).toEqual(['text a', 'text b'])
    expect((await queue.all()).map(c => c.id)).toEqual(['z'])
  })

  it('offline: stops and keeps every clip in order', async () => {
    const { queue, written, write } = await setup([clip({ id: 'a', at: 1 }), clip({ id: 'b', at: 2 })])
    const r = await flushClips({ uid: 'u1', queue, write, post: async () => { throw new Error('network') } })
    expect(r).toEqual({ done: 0, dropped: 0, left: 2 })
    expect(written).toEqual([])
    expect((await queue.all()).length).toBe(2)
  })

  it('a clip whose text came back earlier is written without sending it again', async () => {
    const { queue, written, write } = await setup([clip({ text: 'уже есть', blob: null })])
    let sent = 0
    await flushClips({ uid: 'u1', queue, write, post: async () => { sent++; return 'no' } })
    expect(sent).toBe(0)
    expect(written).toEqual(['уже есть'])
  })

  it('refused for good: dropped; refused by the API: dropped after a few runs', async () => {
    const { queue, write } = await setup([clip({ id: 'big' })])
    const r = await flushClips({ uid: 'u1', queue, write, post: async () => { throw Object.assign(new Error('x'), { status: 413 }) } })
    expect(r.dropped).toBe(1)

    await queue.put(clip({ id: 'bad' }))
    const fail = async () => { throw Object.assign(new Error('x'), { status: 502 }) }
    for (let i = 1; i < VOICE_MAX_TRIES; i++) {
      expect((await flushClips({ uid: 'u1', queue, write, post: fail })).left).toBe(1)
    }
    expect((await flushClips({ uid: 'u1', queue, write, post: fail })).dropped).toBe(1)
    expect(await queue.all()).toEqual([])
  })
})

describe('pickMime', () => {
  it('Safari’s mp4 first, nothing when the browser cannot say', () => {
    expect(pickMime({ isTypeSupported: m => m === 'audio/mp4' || m === 'audio/webm' })).toBe('audio/mp4')
    expect(pickMime({ isTypeSupported: m => m.startsWith('audio/webm') })).toBe('audio/webm;codecs=opus')
    expect(pickMime(undefined)).toBe('')
  })
})
