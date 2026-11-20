import { offlineBuild } from '../lib/build-caps.js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { fmtAgo } from '../lib/format.js'
import { platformNow } from '../lib/platform-now.js'
import { healthStatus, loadHealth, onHealthChange, disableHealth, disableRead } from '../lib/health-sync.js'
import { directory, cardState, CARD, PILL, WORKS_WITH } from '../lib/integrations.js'
import { importFromApp, importFromHevy, menuSheet } from '../sheets.jsx'
import { csvExportSheet } from '../components/CsvExportSheet.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button } from '../components/ui.jsx'
import { isOn } from '../lib/modules.js'
import { tokensOn } from '../lib/api-tokens.js'

/* Settings → Integrations (v1.4.4): one directory of what openGym can talk to, grouped, each card
   with what it is, whether it is on, and the one thing to do next. The cards are thin on purpose:
   Apple Health and Health Connect keep their switches on their own page, the imports and the CSV
   export open the sheets Data & backup has always opened. lib/integrations.js decides which card
   shows where; this file only draws them. */

export const MCP_DOCS = 'https://github.com/DuarteSantos8/openGym/blob/main/mcp/README.md'

const sheet = render => useUI.getState().openSheet(render)
const nameOf = card => (card.translate ? t(card.name) : card.name)
const ACTION = { connect: 'Connect', manage: 'Manage', import: 'Import', export: 'Export', open: 'Open' }

function useHealth() {
  const [h, setH] = useState(null)
  useEffect(() => {
    if (!MOBILE) return
    let gone = false
    Promise.all([healthStatus(), loadHealth()]).then(([s, f]) => { if (!gone) setH({ ...f, status: s?.status, platform: s?.platform }) }).catch(() => {})
    const off = onHealthChange(f => { if (!gone) setH(prev => ({ ...(prev || {}), ...f })) })
    return () => { gone = true; off() }
  }, [])
  return h
}

function Pill({ status }) {
  if (!status) return null
  return <span className={'intg-pill ' + status}>{t(PILL[status])}</span>
}

/* A sheet's header: the glyph and the name, with the state beside it on the same line rather than
   on a line of its own (Integrations pass, I4). The pill stays out of the h3, so a screen reader
   hears the heading as the name. */
function SheetHead({ icon, title, status }) {
  return <div className="intg-head">
    <h3 className="intg-h"><Icon name={icon} /><span>{title}</span></h3>
    <Pill status={status} />
  </div>
}

/* The sheets' quiet actions as one grouped list of rows with a bare glyph in the accent ink, the way
   the routine editor groups Copy / Share / Print (P4), instead of a tinted block and a text link. */
function ActRow({ icon, label, onClick, disabled }) {
  return <button type="button" className="lrow tap" onClick={onClick} disabled={disabled}>
    <Icon name={icon} className="intg-act-i" /><span className="lrow-m"><span className="lrow-t">{label}</span></span>
  </button>
}

/* The destructive action: last, in a group of its own, a red row (P4, P6). It still asks. */
function DangerRow({ label, onClick, disabled }) {
  return <div className="sect-b intg-end">
    <button type="button" className="lrow tap danger" onClick={onClick} disabled={disabled}>
      <Icon name="trash" className="intg-act-i" /><span className="lrow-m"><span className="lrow-t">{label}</span></span>
    </button>
  </div>
}

function Card({ card, onOpen, onAction }) {
  const { status, action } = card.state
  const name = nameOf(card)
  return <div className="lrow intg-card" data-card={card.id}>
    <button className="intg-open" onClick={onOpen} aria-label={status ? name + ', ' + t(PILL[status]) : name}>
      <span className="lrow-i" style={{ '--tint': card.tint }}><Icon name={card.icon} /></span>
      <span className="lrow-m">
        <span className="lrow-t">{name}</span>
        <span className="lrow-s">{t(card.desc)}</span>
        <Pill status={status} />
      </span>
    </button>
    {action && <button className={'btn xs intg-act' + (action === 'connect' ? ' tinted' : ' plain')} onClick={onAction}
      aria-label={t(ACTION[action]) + ': ' + name}>{t(ACTION[action])}</button>}
  </div>
}

export default function IntegrationsPage({ android = false, ios = false }) {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const health = useHealth()
  const platform = MOBILE ? (ios ? 'ios' : android ? 'android' : health?.platform || platformNow()) : null
  const S = useStore(s => s.S)
  const tokens = tokensOn(config, user, DEMO) && isOn(S, 'integrations')
  const ctx = {
    offline: offlineBuild(), tokens,
    mobile: MOBILE, platform, user, demo: DEMO, admin: !!user?.admin, health,
    mod: id => isOn(S, id),
  }
  const dir = directory(ctx)

  const act = card => {
    const { action, status } = card.state
    switch (card.id) {
      case 'apple-health': case 'health-connect':
        if (status === 'device') return infoSheet(card, t('This one lives in the openGym phone app: Apple Health on iPhone, Health Connect on Android.'))
        return nav('/settings/' + card.id)
      case 'hevy': return importFromHevy()
      case 'files': return fileRef.current?.click()
      case 'csv': return csvExportSheet()
      case 'mcp':
        if (status === 'server') return infoSheet(card, t('The MCP server runs next to your own openGym server and reads your data there.'), MCP_DOCS)
        // A server with scoped tokens: the token page, where the address and the keys are.
        if (tokens) return nav('/settings/api-tokens')
        return window.open(MCP_DOCS, '_blank', 'noopener')
      default:
    }
  }
  const open = card => {
    // The health stores have more to say than a card holds.
    if (card.state.status === 'device' || card.state.status === 'server') return act(card)
    if (card.id === 'apple-health' || card.id === 'health-connect') {
      return detailSheet(card, { act: () => act(card), health, onDisconnect: healthOn(health) ? () => disconnectHealth(card, toast) : null, retry: () => nav('/settings/' + card.id) })
    }
    detailSheet(card, { act: () => act(card) })
  }

  return <>
    <p className="sect-f intg-intro">{t('Only what you switch on talks to anything. The rest stays out of your way.')}</p>
    {dir.map(cat => <div key={cat.id}>
      <Section title={t(cat.title)}>
        {cat.cards.map(card => <Card key={card.id} card={card} onOpen={() => open(card)} onAction={() => act(card)} />)}
      </Section>
      {cat.id === 'health' && <WorksWith platform={platform} nav={nav} />}
    </div>)}
    {tokens && <Section footer={t('For AI assistants over MCP, planners and scripts. Each sees only what you tick.')}>
      <Row icon="key" iconTint="var(--purple)" title={t('API tokens')} accessory="chevron" onClick={() => nav('/settings/api-tokens')} />
    </Section>}
    <input ref={fileRef} type="file" accept=".csv,.xml,text/csv,text/xml" style={{ display: 'none' }}
      onChange={ev => { const f = ev.target.files[0]; if (f) importFromApp(f); ev.target.value = '' }} />
  </>
}

const healthOn = h => !!(h && (h.on || h.readHr || h.readWeight || h.readBody || h.readVitals || h.readSport))

function disconnectHealth(card, toast) {
  const where = card.name
  menuSheet({
    title: t('Disconnect {0}?', where),
    subtitle: t('openGym stops writing and reading. What it already wrote can stay there as your data, or go.'),
    items: [
      { icon: 'check', label: t('Stop, keep what it wrote'), onClick: () => offAll(false, toast) },
      { icon: 'trash', label: t('Stop and remove what it wrote'), danger: true, onClick: () => offAll(true, toast) },
    ],
  })
}
async function offAll(removeWritten, toast) {
  try {
    await disableHealth({ removeWritten })
    // Every read, not just the first two: body composition and vitals kept reading after a disconnect.
    for (const kind of ['hr', 'weight', 'body', 'vitals', 'sport']) await disableRead(kind)
  } catch { toast?.(t('Something went wrong')) }
}

/* ---------------- "works with" ---------------- */

function WorksWith({ platform, nav }) {
  const store = platform === 'ios' ? 'Apple Health' : platform === 'android' ? 'Health Connect' : null
  return <Section title={t('Works with')} footer={store
    ? t('No extra connection needed: they write to {0}, and openGym reads from there.', store)
    : t('No extra connection needed: they write to Apple Health or Health Connect, and the openGym phone app reads from there.')}>
    <div className="intg-chips">
      {WORKS_WITH.map(w => <button key={w.name} className="btn xs intg-chip" onClick={() => worksWithSheet(w, platform, nav)}>
        <Icon name={w.glyph} /><span translate="no">{w.name}</span>
      </button>)}
    </div>
  </Section>
}

const READS = {
  hr: 'Heart rate during your workouts',
  weight: 'Your weigh-ins',
  both: 'Heart rate during your workouts, and your weigh-ins',
}

function worksWithSheet(w, platform, nav) {
  const store = platform === 'ios' ? 'apple-health' : platform === 'android' ? 'health-connect' : null
  sheet(close => <>
    <SheetHead icon={w.glyph} title={w.name} />
    <p className="intg-lead">{t('{0} has no direct line to openGym, and it does not need one.', w.name)}</p>
    {/* Three facts, not three settings: plain rows, no tinted tile on each (Integrations pass, I6). */}
    <Section className="intg-facts">
      <Row title={t('How it gets here')}
        subtitle={t('{0} saves to Apple Health on iPhone or Health Connect on Android. openGym reads from there.', w.name)} />
      <Row title={t('What openGym reads')} subtitle={t(READS[w.reads])} />
      <Row title={t('What it does not do')} subtitle={t('Workouts logged in openGym go to the health store, not back into {0} itself.', w.name)} />
    </Section>
    {store
      ? <Button variant="primary" onClick={() => { close(); nav('/settings/' + store) }}>{t('Set up {0}', CARD[store].name)}</Button>
      : <p className="intg-note">{t('Install the openGym app on your phone to use this.')}</p>}
  </>)
}

/* ---------------- detail and info sheets ---------------- */

function infoSheet(card, message, link) {
  sheet(close => <>
    <SheetHead icon={card.icon} title={nameOf(card)} status={card.state.status} />
    <p className="intg-lead">{message}</p>
    <div className="intg-btns">
      {link && <Button variant="tinted" onClick={() => window.open(link, '_blank', 'noopener')}>{t('How to set it up')}</Button>}
      <Button variant="plain" onClick={close}>{t('Done')}</Button>
    </div>
  </>)
}

function detailSheet(card, { act, health, onDisconnect, retry }) {
  const st = card.state
  sheet(close => {
    const go = f => () => { close(); f?.() }
    const trouble = st.status === 'attention'
    return <>
      <SheetHead icon={card.icon} title={nameOf(card)} status={st.status} />
      {/* What it does, as a short list with a check in the green ink: lines to read, not rows
          to tap, so no tinted tile on each (Integrations pass, I6). */}
      <Section title={t('What it does')}>
        <ul className="intg-does">
          {card.syncs.map(line => <li key={line}><Icon name="check" />{t(line)}</li>)}
        </ul>
      </Section>
      {health && <Section>
        <Row icon="clock" iconTint="var(--blue)" title={t('Last sync')} value={health.at ? fmtAgo(health.at) : t('Not yet')} />
        {trouble && <Row icon="warning" iconTint="var(--orange)" title={t('Permission withdrawn')} subtitle={t('openGym can no longer reach it.')}>
          <button className="btn xs tinted" onClick={go(retry)}>{t('Retry')}</button>
        </Row>}
      </Section>}
      {st.action && <Button variant="primary" onClick={go(act)}>{t(ACTION[st.action])}</Button>}
      {onDisconnect && <DangerRow label={t('Disconnect')} onClick={go(onDisconnect)} />}
    </>
  })
}

// For the Settings search and tests: the card's state here, without drawing the page.
export { cardState }
