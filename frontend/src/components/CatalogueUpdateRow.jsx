// Settings → Workout, phone app only: exercises added on the server after this app version come in
// on their own when the server's list changed (lib/catalogue-extra.js, checked at every start with a
// few bytes); this row downloads the list right now.
import { useState } from 'react'
import { Row } from './ui.jsx'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'

// Loaded on tap: the screen that holds this row does not pull the phone-only modules in.
const updateNow = async () => (await import('../lib/catalogue-extra-boot.js')).updateCatalogueExtra()

export default function CatalogueUpdateRow({ update = updateNow }) {
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const out = await update()
      toast(out.failed ? t('Could not reach the server. Try again later.')
        : out.added ? t('New exercises added: {0}', out.added)
          : t('Exercises are up to date'))
    } catch {
      toast(t('Could not reach the server. Try again later.'))
    } finally { setBusy(false) }
  }
  return (
    <Row icon="download" iconTint="var(--blue)" title={t('Update exercises')}
      subtitle={t('New exercises from the server arrive on their own. This checks right now.')}
      value={busy ? t('Updating…') : undefined} onClick={run} />
  )
}
