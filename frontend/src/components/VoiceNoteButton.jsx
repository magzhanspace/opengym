// The mic beside an exercise's name during a workout: a tap starts a voice note on this exercise,
// a tap again stops it; the text lands in the exercise's note (lib/voice-live.js). Shown only when
// the server takes voice notes (GET /api/config `voice`) and the browser can record.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { startVoice, stopVoice, useVoice, voiceSupported } from '../lib/voice-live.js'
import { MOBILE } from '../lib/mobile.js'
import Icon from './Icon.jsx'

// What a failed start says: a refused mic points to where it is allowed, anything else names the
// error, so a screenshot of it tells what went wrong.
export function micFailure(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return MOBILE
      ? t('The microphone is off for openGym. Turn it on in iPhone Settings → openGym → Microphone.')
      : t('The microphone is off for openGym. Allow it in the browser settings.')
  }
  return t('The recording did not start ({0}).', [e?.name, e?.message].filter(Boolean).join(': ') || 'Error')
}

function Seconds({ at }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id) }, [])
  const s = Math.max(0, Math.floor((now - at) / 1000))
  return <span className="vn-sec">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

export default function VoiceNoteButton({ entryIdx, exId, start, hint, label }) {
  const on = useStore(s => !!(s.user && s.config?.voice))
  const rec = useVoice(s => s.rec)
  const [asking, setAsking] = useState(false)
  if (!on || !voiceSupported()) return null
  const mine = !!rec && rec.start === start && rec.exId === exId && rec.entryIdx === entryIdx
  const busyElsewhere = !!rec && !mine

  const tap = async () => {
    if (mine) { stopVoice(); return }
    if (busyElsewhere || asking) return
    setAsking(true)
    try { await startVoice({ start, exId, entryIdx, hint }) }
    catch (e) { useUI.getState().toast(micFailure(e)) }
    finally { setAsking(false) }
  }

  return <button type="button" className={'iconbtn vn-btn' + (mine ? ' rec' : '')} disabled={busyElsewhere}
    aria-label={mine ? t('Stop the voice note') : t('Voice note on {0}', label)}
    title={mine ? t('Stop the voice note') : t('Voice note')} onClick={tap}>
    <Icon name={mine ? 'stop' : 'mic'} />{mine && <Seconds at={rec.at} />}
  </button>
}

// Today's own note on an exercise, set apart from the plan's instruction and the other notes above
// it (they share the grey card): the mic or note icon in the accent colour and the text in full
// strength. A tap opens it to read, pin, edit or delete (exerciseNoteSheet).
export function MyNote({ note, onOpen, className = 'exnote' }) {
  const voice = useVoiceOnly()
  if (!note) return null
  return <button type="button" className={className + ' my-note'} onClick={onOpen} aria-label={t('My note: {0}', note)}>
    <Icon name={voice ? 'mic' : 'note'} className="my-note-ic" /><span>{note}</span>
  </button>
}

// The clips said on this exercise that have no text yet: a line where the text will land.
export function VoiceNoteStatus({ exId, entryIdx, className = 'exnote' }) {
  const start = useStore(s => s.S?.active?.start)
  const n = useVoice(s => s.waiting.filter(w => w.start === start && w.exId === exId && w.entryIdx === entryIdx).length)
  if (!n) return null
  const offline = globalThis.navigator?.onLine === false
  return <div className={className + ' vn-wait'} role="status">
    <Icon name="mic" className="my-note-ic" />
    <span>{offline
      ? (n === 1 ? t('Voice note waiting for the network.') : t('{0} voice notes waiting for the network.', n))
      : (n === 1 ? t('Turning the voice note into text…') : t('Turning {0} voice notes into text…', n))}</span>
  </div>
}

// With voice notes on (the server takes them and this browser records), notes in a workout are
// said, not typed: the menus offer a note only once there is one, and its sheet shows it to read,
// pin or delete. The editor of a saved workout still types, to correct what was heard.
export function voiceOnlyNow() {
  const st = useStore.getState()
  return !!(st.user && st.config?.voice) && voiceSupported()
}
export function useVoiceOnly() {
  const on = useStore(s => !!(s.user && s.config?.voice))
  return on && voiceSupported()
}
