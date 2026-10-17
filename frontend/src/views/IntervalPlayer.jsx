import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { t, getLang } from '../lib/i18n.js'
import { unlock } from '../lib/sound.js'
import { bestWeightForEntry } from '../lib/history.js'
import { buildIntervals, intervalSettings, nextWork, remainingSec } from '../lib/interval-plan.js'
import { speak, stopSpeaking, countdownBeep } from '../lib/interval-audio.js'
import { finishWorkout } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

const mmss = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
const nameOf = id => exerciseNameText(exOr(id))

// Follow-along ("automated workout") player. Mounted by the /workout route in place of the manual
// workout screen while S.active.auto is set (beginWorkout, sheets.jsx). The session itself is the
// ordinary one: every finished work block ticks its set in S.active, so Finish, PRs, progression
// and history all go through the code a manual workout uses.
export default function IntervalPlayer() {
  const update = useStore(s => s.update)
  const A = useStore(s => s.S.active)
  const sound = useStore(s => s.S.sound)

  // Flattened once, when the player opens: [Work, Rest, Work, …]. Later edits to the routine do
  // not move a session that is already running.
  const [blocks] = useState(() => {
    const S = useStore.getState().S
    const routine = S.routines.find(r => r.id === S.active?.routineIds?.[0])
    return buildIntervals(S.active?.entries, intervalSettings(routine))
  })
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState(() => blocks[0]?.sec || 0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [finished, setFinished] = useState(false)

  // The clock is a deadline, not a count of ticks: a timer throttled in the background (a locked
  // screen) catches up on the next tick instead of falling behind.
  const remainMs = useRef((blocks[0]?.sec || 0) * 1000)
  const endAt = useRef(0)
  const lastBeep = useRef(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const block = blocks[idx]
  const coming = nextWork(blocks, idx) // what is announced and shown as "Up next"

  // The set a finished work block was, ticked the way the workout screen ticks one.
  const logSet = useCallback(b => update(s => {
    const e = s.active?.entries[b.ei]
    const set = e?.sets[b.si]
    if (!set || set.done) return
    set.done = true
    set.at = Date.now()
    if (set.sides) for (const k of ['L', 'R']) if (set.sides[k]) set.sides[k] = { ...set.sides[k], done: true }
    if (e.target?.mode === 'time') set.sec = b.sec
    if (e.sets.every(x => x.done)) e.topW = bestWeightForEntry(e) || null
  }), [update])

  const togglePause = () => {
    unlock(sound)   // a tap is the gesture a browser needs before it lets audio start
    if (!paused) remainMs.current = Math.max(0, endAt.current - Date.now())
    setPaused(p => !p)
  }

  const advance = useCallback((log = true) => {
    const cur = blocks[idx]
    if (log && cur?.kind === 'work') logSet(cur)
    if (idx + 1 >= blocks.length) { setFinished(true); return }
    remainMs.current = blocks[idx + 1].sec * 1000
    lastBeep.current = null
    setLeft(blocks[idx + 1].sec)
    setIdx(idx + 1)
  }, [blocks, idx, logSet])

  // The countdown. Re-armed on every block and on resume (from remainMs, which togglePause banks).
  useEffect(() => {
    if (paused || finished || !block) return undefined
    endAt.current = Date.now() + remainMs.current
    const tick = () => {
      const ms = endAt.current - Date.now()
      const sec = Math.max(0, Math.ceil(ms / 1000))
      setLeft(sec)
      // 3-2-1: one beep as each of the last three seconds begins (and none twice, even when the
      // interval fires more than once inside a second).
      if (sec <= 3 && sec >= 1 && lastBeep.current !== sec) { lastBeep.current = sec; countdownBeep(sec, !mutedRef.current && !!sound) }
      if (ms <= 0) { clearInterval(id); advance() }
    }
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [idx, paused, finished, block, advance, sound])

  // Best effort at mount (the tap that opened the player may still count as a gesture); Pause
  // unlocks again, inside a tap that certainly does.
  useEffect(() => { unlock(sound); return stopSpeaking }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // What is said when a block begins. Once per block: pausing and resuming do not repeat it.
  // A Work block opens with a high beep and a spoken "Go!", the cue to move, so nobody has to
  // look at the screen to know the rest is over; the first one also names the exercise.
  useEffect(() => {
    if (!block || finished || mutedRef.current) return
    if (block.kind === 'rest') { speak(t('Rest for {0} seconds. Next up: {1}', block.sec, nameOf(coming?.id)), getLang()); return }
    countdownBeep(0, !!sound)
    speak(idx === 0 ? t('First up: {0}. Go!', nameOf(block.id)) : t('Go!'), getLang())
  }, [idx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Out of blocks: say so, then hand over to the ordinary finish (it asks about anything unchecked).
  useEffect(() => {
    if (!finished) return
    if (!mutedRef.current) speak(t('Workout complete'), getLang())
    finishWorkout()
  }, [finished])


  // A session that was already fully ticked (resumed at the end) has nothing to play.
  if (!A) return null
  if (!blocks.length) {
    return <div className="narrow" style={{ padding: 24, textAlign: 'center' }}>
      <h3>{t('Nothing left to play')}</h3>
      <button className="btn primary" onClick={() => finishWorkout()}>{t('Finish workout')}</button>
    </div>
  }

  // Out of blocks. Finish asks about anything unchecked and can be cancelled, so this stays put.
  if (finished) {
    return <div className="narrow" style={{ padding: 24, textAlign: 'center' }}>
      <h3>{t('Workout complete')}</h3>
      <button className="btn primary" onClick={() => finishWorkout()}>{t('Finish workout')}</button>
    </div>
  }

  const resting = block?.kind === 'rest'
  const accent = resting ? 'var(--hype-2)' : 'var(--acc)'
  const workBlocks = blocks.filter(b => b.kind === 'work')
  const setNo = blocks.slice(0, idx + 1).filter(b => b.kind === 'work').length
  const label = resting ? t('Rest') : t('Work')

  return <div role="main" aria-label={t('Follow-along workout')} style={{
    position: 'fixed', inset: 0, zIndex: 50, color: 'var(--label)',
    background: `radial-gradient(120% 60% at 50% 38%, color-mix(in srgb, ${accent} 16%, var(--bg)), var(--bg) 72%)`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))', textAlign: 'center',
  }}>
    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="small dim">{t('Set {0} of {1}', setNo, workBlocks.length)} · {mmss(remainingSec(blocks, idx, left))} {t('left')}</span>
      <button className="iconbtn" onClick={() => setMuted(m => !m)} aria-pressed={muted}
        aria-label={muted ? t('Unmute') : t('Mute')}><Icon name={muted ? 'bellSlash' : 'bell'} /></button>
    </div>

    <div>
      <div style={{ fontSize: 18, letterSpacing: '.12em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, margin: '6px 0 0' }}>{resting ? t('Get ready') : nameOf(block.id)}</div>
      <div aria-live="off" style={{ fontSize: 'min(40vw, 220px)', lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: accent, margin: '12px 0', textShadow: `0 0 48px color-mix(in srgb, ${accent} 55%, transparent)` }}>{left}</div>
      <div className="dim" style={{ fontSize: 18 }}>
        {coming ? t('Up next: {0}', nameOf(coming.id)) : t('Last one!')}
      </div>
    </div>

    <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="btn primary" onClick={togglePause}
        style={{ fontSize: 26, padding: '22px 0', borderRadius: 20 }}>
        <Icon name={paused ? 'play' : 'pause'} /> {paused ? t('Resume') : t('Pause')}
      </button>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn ghost dim" style={{ flex: 1 }} onClick={() => advance(false)}>{t('Skip')}</button>
        <button className="btn ghost dim" style={{ flex: 1 }} onClick={() => {
          // Stop the clock first: the finish sheet can be cancelled, and a running block must not
          // tick a set or announce a rest behind it.
          stopSpeaking()
          if (!paused) { remainMs.current = Math.max(0, endAt.current - Date.now()); setPaused(true) }
          finishWorkout()
        }}>{t('End workout')}</button>
      </div>
    </div>
  </div>
}
