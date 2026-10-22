// The browser side of the built-in workout playlist: one <audio> element, played inside the Start tap
// (iOS only lets a tap start audio). Thin on purpose: the decisions live in music-player.js. Nothing
// touches the DOM at import time. Never touches navigator.mediaSession: IntervalPlayer owns it.
import { appBase } from './app-base.js'
import { onSpeech } from './interval-audio.js'
import { DUCK_RAMP_MS, MUSIC_BASE_VOLUME, duckLevel, loadPlaylist, nextIndex, rampSteps, shuffledOrder, trackUrl } from './music-player.js'

let playlist = null     // Track[] once loaded, null before
let loading = null      // memoised load
let el = null
let tracks = []
let order = []
let pos = 0
let started = false, blocked = false, failed = false, userPaused = false
let errors = 0
let base = MUSIC_BASE_VOLUME
let speaking = false
let rampTimer = null
let unsubSpeech = null
const listeners = new Set()

const emit = () => { for (const cb of [...listeners]) { try { cb() } catch { /* a listener never stops the music */ } } }

/** Fetches the index once. Resolves [] when there is none (404, redirect to the app, bad JSON, offline). Never rejects. */
export function loadBuiltinPlaylist({ fetchFn = globalThis.fetch, base: appRoot = appBase() } = {}) {
  if (loading) return loading
  loading = (async () => {
    let list = []
    try {
      const res = await fetchFn(appRoot + 'workout-music/index.json', { cache: 'no-cache' })
      if (res.ok && !res.redirected) list = loadPlaylist(await res.json())
    } catch { list = [] }
    playlist = list
    emit()
    return list
  })()
  return loading
}
export const builtinPlaylist = () => playlist

const current = () => tracks[order[pos]] || null
const setSrc = () => {
  const track = current()
  if (!track || !el) return
  const m4a = !!el.canPlayType?.('audio/mp4')
  el.src = trackUrl(track, appBase(), { m4a })
}
const play = () => {
  try {
    const p = el.play()
    if (p && typeof p.catch === 'function') {
      p.catch(e => { if (e?.name === 'NotAllowedError') { blocked = true; emit() } })
    }
  } catch { /* */ }
}
const setVol = v => { try { el.volume = v } catch { /* iOS ignores it */ } }
const level = () => duckLevel({ speaking, base })

function ensure() {
  if (el) return el
  el = typeof Audio === 'function' ? new Audio() : document.createElement('audio')
  el.preload = 'none'
  el.addEventListener('ended', () => { pos = nextIndex(pos, order.length); setSrc(); play(); emit() })
  el.addEventListener('error', () => {
    if (!started) return
    errors++
    if (errors >= tracks.length) { failed = true; stopMusic(); return }
    pos = nextIndex(pos, order.length); setSrc(); play(); emit()
  })
  el.addEventListener('playing', () => { errors = 0; blocked = false; emit() })
  el.addEventListener('play', emit)
  el.addEventListener('pause', emit)
  return el
}

/** Starts the playlist. CALL INSIDE A TAP. Returns whether there was anything to play. */
export function startBuiltinMusic({ tracks: list = builtinPlaylist(), shuffle = true, seed = Date.now(), volume = MUSIC_BASE_VOLUME } = {}) {
  if (!list?.length) return false
  ensure()
  tracks = list
  order = shuffle ? shuffledOrder(list.length, seed) : list.map((_, i) => i)
  pos = 0
  userPaused = false; failed = false; blocked = false; errors = 0
  base = volume
  started = true
  if (!unsubSpeech) unsubSpeech = onSpeech(duckMusic)
  setSrc()
  setVol(level())
  play()
  emit()
  return true
}

export function pauseMusic({ user = false } = {}) {
  if (user) userPaused = true
  if (!el || !started) return
  try { el.pause() } catch { /* */ }
}

export function resumeMusic({ user = false } = {}) {
  if (user) userPaused = false
  else if (userPaused) return
  if (!el || !started || failed) return
  play()
}

export function nextTrack() {
  if (!el || !started || !order.length) return
  pos = nextIndex(pos, order.length)
  setSrc(); play(); emit()
}

export function stopMusic() {
  if (rampTimer) { clearTimeout(rampTimer); rampTimer = null }
  if (el) {
    try { el.pause() } catch { /* */ }
    el.removeAttribute('src')
    try { el.load() } catch { /* */ }
  }
  started = false
  emit()
}

export function setMusicVolume(v) {
  base = Math.min(1, Math.max(0, Number(v) || 0))
  if (el) setVol(level())
}

/** Drops the music to a quarter while the voice talks, with a short ramp. */
export function duckMusic(on) {
  speaking = !!on
  if (!el) return
  if (rampTimer) { clearTimeout(rampTimer); rampTimer = null }
  const steps = rampSteps(el.volume, level(), 5)
  let i = 0
  const step = () => {
    setVol(steps[i++])
    rampTimer = i < steps.length ? setTimeout(step, DUCK_RAMP_MS / 5) : null
  }
  step()
}

export function musicState() {
  return {
    started, playing: !!el && started && !el.paused && !el.ended, blocked, failed,
    track: started ? current() : null,
    positionSec: el ? el.currentTime || 0 : 0,
  }
}

export function onMusicChange(cb) { listeners.add(cb); return () => { listeners.delete(cb) } }

export const _audioForTests = () => el
export function _resetForTests() {
  if (rampTimer) clearTimeout(rampTimer)
  rampTimer = null
  if (unsubSpeech) unsubSpeech()
  unsubSpeech = null
  playlist = null; loading = null; el = null; tracks = []; order = []; pos = 0
  started = blocked = failed = userPaused = speaking = false
  errors = 0; base = MUSIC_BASE_VOLUME
  listeners.clear()
}
