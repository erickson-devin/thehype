import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { nav } from '../lib/nav.js'
import { setBackOverride } from '../lib/back.js'
import { mediaKeyAction, playerKeyAction } from '../lib/player-keys.js'
import { exOr, figureOf, imgSrc, isCustomEx } from '../lib/exercises.js'
import { mediaOf } from '../lib/media-refs.js'
import Media, { Thumb } from '../components/Media.jsx'
import { exerciseNameText } from '../lib/format.js'
import { t, getLang } from '../lib/i18n.js'
import { unlock } from '../lib/sound.js'
import { bestWeightForEntry } from '../lib/history.js'
import { buildIntervals, intervalSettings, nextWork, remainingSec } from '../lib/interval-plan.js'
import { speak, stopSpeaking, countdownBeep } from '../lib/interval-audio.js'
import { confirmSheet, finishWorkout, finishWorkoutSheet, menuSheet } from '../sheets.jsx'
import { drawHype, hypeEventsFor, hypeMarks, initHype } from '../lib/hype-lines.js'
import { awayDecision, backBlock, elapsedOf, endedWork, pauseClock, positionAt, resumeClock, skipBlock, startClock } from '../lib/interval-schedule.js'
import { bindMediaActions, mediaMetadataFor, positionStateFor, publishMedia } from '../lib/media-session.js'
import { onAppActive } from '../lib/mobile.js'
import { musicPlan } from '../lib/auto-music.js'
import { musicSource, nowPlayingLine } from '../lib/music-player.js'
import { builtinPlaylist, loadBuiltinPlaylist, musicState, nextTrack, onMusicChange, pauseMusic, resumeMusic, serverRoot, startBuiltinMusic, stopMusic } from '../lib/music-dom.js'
import Icon from '../components/Icon.jsx'

const mmss = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
const nameOf = id => exerciseNameText(exOr(id))
// Whether an exercise has a picture to show: a catalogue animation, or a custom exercise's own file.
// Neither (a custom exercise without one, an unknown id) leaves the name to carry the block.
const hasMedia = ex => (isCustomEx(ex) ? !!mediaOf(ex) : !!ex?.gif)
// Absolute URL of an exercise's still, for the lock-screen artwork (null when it has none).
const artworkOf = id => {
  const ex = exOr(id)
  const src = ex?.img ? imgSrc(ex, figureOf(useStore.getState().S)) : null
  try { return src ? new URL(src, location.href).href : null } catch { return null }
}
const reducedMotion = () => {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// Follow-along ("automated workout") player. Mounted by the /workout route in place of the manual
// workout screen while S.active.auto is set (beginWorkout, sheets.jsx). The session itself is the
// ordinary one: every finished work block ticks its set in S.active, so Finish, PRs, progression
// and history all go through the code a manual workout uses.
export default function IntervalPlayer() {
  const update = useStore(s => s.update)
  const A = useStore(s => s.S.active)
  const sound = useStore(s => s.S.sound)
  const gifOff = useStore(s => s.S.gifSize === 'off')   // Settings → Exercise animations: Hidden
  const tv = useUI(s => !!s.tv)   // TV mode: remote keys, a two-column 10-foot layout (index.css .ip-tv)
  const rootRef = useRef(null)
  const doneRef = useRef(null)

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
  const [cueNonce, setCueNonce] = useState(0)   // bumped by back, so a restarted block is announced again
  const [music, setMusic] = useState(musicState)
  useEffect(() => { loadBuiltinPlaylist(); return onMusicChange(() => setMusic(musicState())) }, [])

  // The clock is a wall-clock origin plus paused spans (lib/interval-schedule.js), not a count of
  // ticks: a page that was throttled or frozen (a locked screen) lands in the right block, and
  // logs the work blocks that ended meanwhile, on the next tick.
  const clock = useRef(null); if (!clock.current) clock.current = startClock(Date.now())
  const lastTickAt = useRef(Date.now())
  const lastElapsed = useRef(0)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const finishedRef = useRef(false)
  finishedRef.current = finished
  const lastBeep = useRef(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const [marks] = useState(() => hypeMarks(blocks))
  const hype = useRef(null); if (!hype.current) hype.current = initHype(Date.now())
  const fired = useRef(new Set())
  const hypeText = ev => { const r = drawHype(hype.current, ev.event, ...(ev.id ? [nameOf(ev.id)] : [])); hype.current = r.state; return r.text }

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

  const tick = useCallback(() => {
    const now = Date.now()
    // Under AWAY_POLICY 'tick' this is informational. An 'ask' (not reachable today) is treated as
    // a tick until a "you were away" sheet exists.
    awayDecision(blocks, clock.current, lastTickAt.current, now)
    const pos = positionAt(blocks, clock.current, now)
    endedWork(blocks, clock.current, lastElapsed.current, pos.elapsedMs).forEach(i => logSet(blocks[i]))
    lastElapsed.current = pos.elapsedMs
    lastTickAt.current = now
    const sec = Math.ceil(pos.leftMs / 1000)
    const at = Math.min(pos.idx, blocks.length - 1)
    setIdx(at)
    setLeft(sec)
    // 3-2-1: one beep as each of the last three seconds begins (and none twice, even when the
    // interval fires more than once inside a second).
    const key = pos.idx + ':' + sec
    if (sec <= 3 && sec >= 1 && lastBeep.current !== key) { lastBeep.current = key; countdownBeep(sec, !mutedRef.current && !!sound) }
    if (!pos.done) {
      for (const ev of hypeEventsFor(blocks, pos.idx, sec, fired.current, marks)) {
        if (ev.event !== 'finalTen') continue   // block-start events are the cue effect's
        fired.current.add(ev.key)
        if (!mutedRef.current) speak(hypeText(ev), getLang())
      }
    }
    if (pos.done) setFinished(true)
  }, [blocks, logSet, marks, sound]) // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    clock.current = skipBlock(blocks, clock.current, Date.now())
    lastElapsed.current = elapsedOf(clock.current, Date.now())   // a skipped block's set is never logged
    tick()
  }

  // Restart this block, or (just after its start) go to the one before. The set a block ticked stays
  // ticked (logSet skips a done set), so replaying it never logs it twice.
  const back = () => {
    clock.current = backBlock(blocks, clock.current, Date.now())
    lastElapsed.current = elapsedOf(clock.current, Date.now())   // the work that ends again ahead is not "just ended"
    lastBeep.current = null
    stopSpeaking()
    setCueNonce(n => n + 1)
    tick()
  }

  const togglePause = () => {
    unlock(sound)   // a tap is the gesture a browser needs before it lets audio start
    const now = Date.now()
    clock.current = paused ? resumeClock(clock.current, now) : pauseClock(clock.current, now)
    if (paused) lastTickAt.current = now
    setPaused(p => !p)
    if (paused) resumeMusic(); else pauseMusic()   // also the lock-screen play/pause
  }

  // The countdown. Runs from the clock, so there is nothing to re-arm per block.
  useEffect(() => {
    if (paused || finished) return undefined
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [paused, finished, tick])

  // Wake-ups: the interval is frozen with the page, so these catch the clock up the moment the
  // page is back. onAppActive returns a remover, used in the cleanup.
  useEffect(() => {
    const wake = () => { if (!pausedRef.current && !finishedRef.current) tick() }
    const onVis = () => { if (document.visibilityState === 'visible') wake() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', wake)
    const off = onAppActive(wake)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', wake)
      off()
    }
  }, [tick])

  // Lock screen / notification controls. Position is throttled: republished when the block or the
  // paused state changes, otherwise every ~5 s.
  const sessionName = A?.name || t('Workout')
  const lastPub = useRef({ idx: -1, paused: null, at: 0 })
  useEffect(() => {
    if (finished || !blocks[idx]) return
    const p = lastPub.current
    const now = Date.now()
    if (p.idx === idx && p.paused === paused && now - p.at < 5000) return
    lastPub.current = { idx, paused, at: now }
    publishMedia(mediaMetadataFor(blocks, idx, { nameOf, artworkOf, t, sessionName }), { playing: !paused, position: positionStateFor(blocks[idx], left * 1000) })
  }, [idx, paused, left]) // eslint-disable-line react-hooks/exhaustive-deps
  const musicRow = musicSource({ plan: musicPlan(useStore.getState().S), auto: true, enabled: true, hasPlaylist: !!builtinPlaylist()?.length }) === 'builtin'
  const toggleMusic = () => {
    if (music.playing) { pauseMusic({ user: true }); update(s => { s.builtinMusic = false }); return }
    update(s => { s.builtinMusic = true })
    if (music.started && !music.failed && !music.blocked) resumeMusic({ user: true }); else startBuiltinMusic()   // inside this tap
  }

  // Ends the session. Stop the clock first: the finish sheet can be cancelled, and a running block
  // must not tick a set or announce a rest behind it. On a TV the sheet also offers Discard (there
  // is no screen to reach the workout's own menu from).
  const endWorkout = () => {
    stopSpeaking()
    pauseMusic()
    if (!pausedRef.current) { clock.current = pauseClock(clock.current, Date.now()); setPaused(true) }
    if (!tv) { finishWorkout(); return }
    finishWorkoutSheet({
      onDiscard: () => confirmSheet({
        title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true,
        onConfirm: () => { update(s => { s.active = null }); nav('/tv') },
      }),
    })
  }

  // The remote's menu key (and Down): what the phone screen has as buttons, as one list.
  const openMore = () => menuSheet({
    title: sessionName,
    items: [
      { icon: muted ? 'bellSlash' : 'bell', label: muted ? t('Unmute') : t('Mute'), onClick: () => setMuted(m => !m) },
      musicRow && { icon: 'headphones', label: music.playing ? t('Music off') : t('Music on'), onClick: toggleMusic },
      musicRow && music.started && !music.failed && { icon: 'skipForward', label: t('Next track'), onClick: nextTrack },
      { icon: 'skipForward', label: t('Skip'), onClick: () => actions.current.skip() },
      { icon: 'flag', danger: true, label: t('End workout'), onClick: () => actions.current.endWorkout() },
    ],
  })

  const actions = useRef({})
  actions.current = { togglePause, skip, back, endWorkout, more: openMore }
  useEffect(() => bindMediaActions({
    onPlay: () => { if (pausedRef.current) actions.current.togglePause() },
    onPause: () => { if (!pausedRef.current) actions.current.togglePause() },
    onNext: () => actions.current.skip(),
    onPrevious: () => actions.current.back(),
  }), [])

  // Keyboard, TV remote and native media keys (lib/player-keys.js). Read through refs and the
  // store so one listener serves every render.
  useEffect(() => {
    const run = action => {
      if (!action) return false
      const a = actions.current
      if (action === 'toggle') a.togglePause()
      else if (action === 'skip') a.skip()
      else if (action === 'back') a.back()
      else if (action === 'more') a.more()
      else if (action === 'end') a.endWorkout()
      return true
    }
    const onKey = e => {
      if (finishedRef.current) return
      const ui = useUI.getState()
      const action = playerKeyAction(e, { paused: pausedRef.current, rtl: document.documentElement.dir === 'rtl', tv: !!ui.tv, sheetOpen: ui.sheets.length > 0 })
      if (run(action)) e.preventDefault()
    }
    const onMedia = e => {
      if (finishedRef.current) return
      const action = mediaKeyAction(e.detail?.key, { paused: pausedRef.current })
      if (action === 'end' && useUI.getState().sheets.length) return
      run(action)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('opengym:media-key', onMedia)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('opengym:media-key', onMedia)
    }
  }, [])

  // TV: Back ends the workout (it asks first) instead of leaving the page; the screen holds focus
  // itself so the remote's keys reach the window handler above, not a stray button.
  useEffect(() => tv ? setBackOverride(() => actions.current.endWorkout()) : undefined, [tv])
  useEffect(() => { if (tv) rootRef.current?.focus() }, [tv])
  useEffect(() => { if (tv && finished) doneRef.current?.focus() }, [tv, finished])

  // Best effort at mount (the tap that opened the player may still count as a gesture); Pause
  // unlocks again, inside a tap that certainly does.
  useEffect(() => { unlock(sound); return () => { stopSpeaking(); stopMusic() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // What is said when a block begins. Once per block: pausing and resuming do not repeat it.
  // A Work block opens with a high beep and a spoken "Go!", the cue to move, so nobody has to
  // look at the screen to know the rest is over; the first one also names the exercise.
  useEffect(() => {
    if (!block || finished) return
    const due = hypeEventsFor(blocks, idx, block.sec, fired.current, marks)
    due.forEach(ev => fired.current.add(ev.key))   // muted or not: unmuting never replays one
    if (mutedRef.current) return
    if (block.kind === 'ready') { speak(t('Get ready. First up: {0}. Starting in {1} seconds.', nameOf(coming?.id), block.sec), getLang()); return }
    if (block.kind === 'rest') { speak(t('Rest for {0} seconds. Next up: {1}', block.sec, nameOf(coming?.id)), getLang()); return }
    countdownBeep(0, !!sound)
    // After a lead-in (idx 1) the first work block says just "Go!": the exercise was named already.
    const cue = idx === 0 ? t('First up: {0}. Go!', nameOf(block.id)) : t('Go!')
    speak(due.length ? cue + ' ' + hypeText(due[0]) : cue, getLang())   // one utterance: speak() cancels what is playing
  }, [idx, cueNonce]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <button className="btn primary" ref={doneRef} onClick={() => finishWorkout()}>{t('Finish workout')}</button>
    </div>
  }

  // Out of blocks. Finish asks about anything unchecked and can be cancelled, so this stays put.
  if (finished) {
    return <div className="narrow" style={{ padding: 24, textAlign: 'center' }}>
      <h3>{t('Workout complete')}</h3>
      <button className="btn primary" ref={doneRef} onClick={() => finishWorkout()}>{t('Finish workout')}</button>
    </div>
  }

  const resting = block?.kind === 'rest'
  const ready = block?.kind === 'ready'
  const accent = resting || ready ? 'var(--hype-2)' : 'var(--acc)'
  const workBlocks = blocks.filter(b => b.kind === 'work')
  const setNo = Math.max(1, blocks.slice(0, idx + 1).filter(b => b.kind === 'work').length)
  const label = ready ? t('Get ready') : resting ? t('Rest') : t('Work')
  // Work shows the exercise being done; Rest shows the next one, so you are set up before "Go!".
  const shownId = resting || ready ? coming?.id : block.id
  const shownEx = shownId ? exOr(shownId) : null
  const picture = !gifOff && !!shownEx && hasMedia(shownEx)
  // On a TV the buttons are not tab stops: the screen takes the remote's keys itself (the window
  // handler above), and a focused button would swallow OK.
  const ti = tv ? -1 : undefined

  const rootStyle = {
    position: 'fixed', inset: 0, zIndex: 50, color: 'var(--label)',
    background: `radial-gradient(120% 60% at 50% 38%, color-mix(in srgb, ${accent} 16%, var(--bg)), var(--bg) 72%)`,
  }
  const status = <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span className="small dim">{t('Set {0} of {1}', setNo, workBlocks.length)} · {mmss(remainingSec(blocks, idx, left))} {t('left')}</span>
    <button className="iconbtn" tabIndex={ti} onClick={() => setMuted(m => !m)} aria-pressed={muted}
      aria-label={muted ? t('Unmute') : t('Mute')}><Icon name={muted ? 'bellSlash' : 'bell'} /></button>
  </div>
  const labelEl = <div style={{ fontSize: 18, letterSpacing: '.12em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>{label}</div>
  const nameEl = <div style={{ fontSize: 28, fontWeight: 700, margin: '6px 0 0' }}>{resting ? t('Get ready') : nameOf(shownId)}</div>
  const mediaEl = picture && <div className="ip-media" key={shownId}>
    {reducedMotion() ? <Thumb ex={shownEx} /> : <Media ex={shownEx} />}
  </div>
  const countStyle = { lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: accent, textShadow: `0 0 48px color-mix(in srgb, ${accent} 55%, transparent)` }
  const upNextEl = <div className="dim" style={{ fontSize: 18 }}>
    {ready ? t('First up: {0}', nameOf(coming.id)) : coming ? t('Up next: {0}', nameOf(coming.id)) : t('Last one!')}
  </div>

  if (tv) {
    const countEl = <div className="ip-count" aria-live="off" style={{ ...countStyle, margin: '8px 0', ...(paused && { opacity: 0.35 }) }}>{left}</div>
    return <div ref={rootRef} role="main" aria-label={t('Follow-along workout')} className="ip-root ip-tv" tabIndex={-1} data-dpad-owner="" style={rootStyle}>
      <div>{picture ? mediaEl : countEl}</div>
      <div>
        {status}
        {labelEl}
        {nameEl}
        {picture && countEl}
        {upNextEl}
        <div className="ip-paused" aria-live="polite">{paused ? t('Paused') : ''}</div>
        {/* CC BY: title, artist and licence on screen (no link: nothing to click on a TV) */}
        {music.track && <div className="dim" style={{ fontSize: 16, marginTop: 8 }}>{nowPlayingLine(music.track, t)}</div>}
        <div className="ip-hint">{paused ? t('OK Resume · ▶ Skip · ▼ More · Back End') : t('OK Pause · ▶ Skip · ▼ More · Back End')}</div>
      </div>
    </div>
  }

  return <div className="ip-root" role="main" aria-label={t('Follow-along workout')} style={{
    ...rootStyle,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))', textAlign: 'center',
  }}>
    {status}

    <div style={{ width: '100%', maxWidth: 420 }}>
      {labelEl}
      {nameEl}
      {mediaEl}
      <div className="ip-count" aria-live="off" style={{ ...countStyle, fontSize: picture ? 'min(32vw, 18vh, 200px)' : 'min(40vw, 220px)', margin: picture ? '8px 0' : '12px 0' }}>{left}</div>
      {upNextEl}
    </div>

    <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="btn primary" onClick={togglePause}
        style={{ fontSize: 26, padding: '22px 0', borderRadius: 20 }}>
        <Icon name={paused ? 'play' : 'pause'} /> {paused ? t('Resume') : t('Pause')}
      </button>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn ghost dim" style={{ flex: 1 }} onClick={skip}>{t('Skip')}</button>
        <button className="btn ghost dim" style={{ flex: 1 }} onClick={endWorkout}>{t('End workout')}</button>
      </div>
      {musicRow && <div className="ip-music" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="iconbtn" onClick={toggleMusic} aria-pressed={music.playing} aria-label={music.playing ? t('Music off') : t('Music on')}>
          <Icon name="headphones" style={{ opacity: music.playing ? 1 : 0.45 }} /></button>
        {/* CC BY: title, artist and licence on screen; the full attribution list (with licence links) one tap away */}
        <a className="small dim" style={{ flex: 1, textAlign: 'start' }} href={serverRoot() + 'workout-music/attribution.txt'} target="_blank" rel="noopener noreferrer">
          {music.track ? nowPlayingLine(music.track, t) : t('Workout music')}</a>
        {music.started && !music.failed && <button className="iconbtn" onClick={nextTrack} aria-label={t('Next track')}><Icon name="skipForward" /></button>}
      </div>}
    </div>
  </div>
}
