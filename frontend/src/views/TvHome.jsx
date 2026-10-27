// Android TV start screen (lib/tv.js): big rows a remote can walk with the arrow keys. Only the
// follow-along routines are offered — they run themselves from one press of OK. Everything else is
// still there, behind "Open the full app".
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { glyphOf } from '../lib/glyphs.js'
import { tvRoutines } from '../lib/tv-routines.js'
import { beginWorkout } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import Logo from '../components/Logo.jsx'

export default function TvHome() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const page = useRef(null)
  const rows = tvRoutines(S, todayISO())
  const resume = S.active?.auto ? S.active : null
  // The remote has no pointer: focus has to start somewhere.
  useEffect(() => { page.current?.querySelector('.tv-item')?.focus() }, [])
  return (
    <div className="tv-page" ref={page}>
      <header className="tv-head">
        <Logo size={72} />
        <h1>The Hype</h1>
        <div className="muted">{user?.name || t('On this TV only')}</div>
      </header>
      <div className="tv-list">
        {resume && <button className="tv-item" onClick={() => nav('/workout')}>
          <Icon name="play" />
          <span className="tt">{t('Resume {0}', resume.name)}</span>
        </button>}
        {rows.map(({ r, today, est }) => (
          <button className="tv-item" key={r.id} onClick={() => beginWorkout([r.id], null)}>
            <Icon name={glyphOf(r.emoji)} />
            <span className="grow">
              <span className="tt">{r.name}</span>
              <span className="ss">{est ? t('{0} exercises · ~{1} min', r.ex.length, est.total) : t('{0} exercises', r.ex.length)}</span>
            </span>
            {today && <span className="tv-tag">{t('Today')}</span>}
          </button>
        ))}
        {!rows.length && !resume && <div className="muted tv-empty">{t('No follow-along routines yet — switch on Follow-along for a routine on your phone.')}</div>}
      </div>
      <footer className="tv-foot">
        <button className="tv-item" onClick={() => nav('/home')}>{t('Open the full app')}</button>
        <button className="tv-item" onClick={() => nav('/settings')}>{t('Settings')}</button>
      </footer>
    </div>
  )
}
