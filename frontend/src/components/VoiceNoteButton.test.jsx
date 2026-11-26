// @vitest-environment happy-dom
// The mic beside an exercise's name: there only when the server takes voice notes and the browser
// can record; a tap records, a tap again stops and keeps the clip for the server to turn into text.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const m = vi.hoisted(() => ({ state: { user: { id: 'u1' }, config: { voice: true }, S: {} }, put: [], toast: null }))
vi.mock('../store/useStore.js', () => {
  const useStore = sel => sel(m.state)
  useStore.getState = () => m.state
  useStore.subscribe = () => () => {}
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: m.toast }) } }))
vi.mock('../lib/voice-queue.js', () => ({
  voiceQueue: async () => ({ put: async c => { m.put.push(c) }, all: async () => m.put, patch: async () => {}, remove: async () => {} }),
}))

class FakeRecorder {
  static isTypeSupported = t => t === 'audio/mp4'
  constructor(stream, opts) { this.stream = stream; this.mimeType = opts.mimeType; this.state = 'inactive' }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['aac'], { type: 'audio/mp4' }) })
    this.onstop?.()
  }
}

const { default: VoiceNoteButton, MyNote, VoiceNoteStatus, voiceOnlyNow } = await import('./VoiceNoteButton.jsx')
const { useVoice, startVoiceNotes } = await import('../lib/voice-live.js')
const { useStore } = await import('../store/useStore.js')
startVoiceNotes(useStore)

let host, root, tracks
beforeEach(() => {
  m.state = { user: { id: 'u1' }, config: { voice: true }, S: {} }
  m.put = []
  m.toast = vi.fn()
  tracks = { stopped: 0 }
  globalThis.MediaRecorder = FakeRecorder
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { tracks.stopped++ } }] }) },
  })
  useVoice.setState({ rec: null, pending: 0, waiting: [] })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  delete globalThis.MediaRecorder
  vi.useRealTimers()
})

const draw = () => act(() => root.render(<VoiceNoteButton entryIdx={1} exId="0085" start={100} hint="RDL" label="RDL" />))

describe('VoiceNoteButton', () => {
  it('is not there when the server has no voice notes, or the browser cannot record', () => {
    m.state = { ...m.state, config: {} }
    draw()
    expect(host.querySelector('button')).toBe(null)
    expect(voiceOnlyNow()).toBe(false)

    m.state = { ...m.state, config: { voice: true } }
    delete globalThis.MediaRecorder
    draw()
    expect(host.querySelector('button')).toBe(null)
  })

  it('records on a tap and keeps the clip on a tap again', async () => {
    draw()
    expect(voiceOnlyNow()).toBe(true)
    const btn = () => host.querySelector('button')
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    await act(async () => { btn().click() })
    expect(useVoice.getState().rec).toMatchObject({ start: 100, exId: '0085', entryIdx: 1 })
    expect(btn().className).toContain('rec')
    vi.setSystemTime(Date.now() + 5000)
    await act(async () => { btn().click() })
    await act(async () => {})
    expect(useVoice.getState().rec).toBe(null)
    expect(tracks.stopped).toBe(1)
    expect(m.put).toHaveLength(1)
    expect(m.put[0]).toMatchObject({ uid: 'u1', start: 100, exId: '0085', entryIdx: 1, hint: 'RDL', mime: 'audio/mp4' })
    expect(m.toast).toHaveBeenCalled()
  })

  it("today's note is its own card, and a clip still waiting for text shows where it will land", () => {
    m.state = { ...m.state, S: { active: { start: 100 } } }
    const open = vi.fn()
    act(() => root.render(<><MyNote note="Колено тянет" onOpen={open} /><VoiceNoteStatus exId="0085" entryIdx={1} /></>))
    const note = host.querySelector('button.my-note')
    expect(note.textContent).toBe('Колено тянет')
    act(() => note.click())
    expect(open).toHaveBeenCalled()
    expect(host.querySelector('.vn-wait')).toBe(null)

    act(() => useVoice.setState({ waiting: [{ start: 100, exId: '0085', entryIdx: 1 }, { start: 100, exId: '0085', entryIdx: 1 }, { start: 100, exId: '0001', entryIdx: 0 }] }))
    expect(host.querySelector('.vn-wait').textContent).toMatch(/2/)
    act(() => useVoice.setState({ waiting: [{ start: 99, exId: '0085', entryIdx: 1 }] }))
    expect(host.querySelector('.vn-wait')).toBe(null)
  })

  it('a refused microphone says so and records nothing', async () => {
    navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }) }
    draw()
    await act(async () => { host.querySelector('button').click() })
    expect(useVoice.getState().rec).toBe(null)
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/microphone is off/i))
  })

  it('any other failure names the error instead of blaming the permission', async () => {
    navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('AudioSession category is not compatible with audio capture.'), { name: 'InvalidStateError' }) }
    draw()
    await act(async () => { host.querySelector('button').click() })
    expect(useVoice.getState().rec).toBe(null)
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/InvalidStateError: AudioSession category/))
    expect(m.toast).not.toHaveBeenCalledWith(expect.stringMatching(/microphone is off/i))
  })

  // WebKit (iOS 17+) refuses the mic while the page's audio session is 'ambient', which the app
  // keeps it at (lib/sound.js setPlayOnSilent): a clip takes 'play-and-record' and gives it back.
  it('takes the play-and-record audio session for the clip and gives the old one back', async () => {
    const session = { type: 'ambient' }
    Object.defineProperty(globalThis.navigator, 'audioSession', { configurable: true, value: session })
    let typeAtCapture = null
    const gum = navigator.mediaDevices.getUserMedia
    navigator.mediaDevices.getUserMedia = async c => { typeAtCapture = session.type; return gum(c) }
    try {
      draw()
      const btn = () => host.querySelector('button')
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
      await act(async () => { btn().click() })
      expect(typeAtCapture).toBe('play-and-record')
      expect(session.type).toBe('play-and-record')
      vi.setSystemTime(Date.now() + 5000)
      await act(async () => { btn().click() })
      await act(async () => {})
      expect(session.type).toBe('ambient')

      // A refused mic gives it back too.
      navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }) }
      await act(async () => { btn().click() })
      expect(session.type).toBe('ambient')
    } finally { delete globalThis.navigator.audioSession }
  })
})
