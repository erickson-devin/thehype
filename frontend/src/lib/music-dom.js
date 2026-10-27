// The browser side of the built-in workout playlist: one <audio> element, played inside the Start tap
// (iOS only lets a tap start audio). Thin on purpose: the decisions live in music-player.js. Nothing
// touches the DOM at import time. Never touches navigator.mediaSession: IntervalPlayer owns it.
import { appBase } from './app-base.js'
import { nativeFetch } from './capacitor-fetch.js'
import { MOBILE } from './mobile.js'
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

let musicBase = ''      // the paired server's origin (mobile build), '' in local mode and on the web
let loadedRoot = null   // the root the memoised load was made for

/** Where the paired app was told its server is (lib/remote.js, the store's boot). A change drops the cached playlist and reloads it. */
export function setMusicBase(b) {
  const next = b ? String(b).replace(/\/?$/, '/') : ''
  if (next === musicBase) return
  musicBase = next
  const had = loading !== null
  playlist = null; loading = null; loadedRoot = null
  if (had) { emit(); loadBuiltinPlaylist() }
}

/** The tracks and the index live in the web image, not the APK: the mobile build streams them from the paired server. */
export const serverRoot = () => (MOBILE && musicBase ? musicBase : appBase())

/**
 * Where the <audio> element loads tracks from. The app page is https://localhost, so the WebView blocks a
 * plain-http server's audio as mixed content (even with MIXED_CONTENT_ALWAYS_ALLOW). On Android the tracks
 * go through a same-origin path that MusicProxyClient.java streams from the server; everything else is direct.
 */
export function musicRoot() {
  const root = serverRoot()
  if (!MOBILE || !musicBase || globalThis.Capacitor?.getPlatform?.() !== 'android') return root
  let u
  try { u = new URL(root) } catch { return root }
  if (u.protocol !== 'http:') return root
  return location.origin + '/_hype_music/' + encodeURIComponent(u.origin) + '/'
}

/** Fetches the index once per root. Resolves [] when there is none (404, redirect to the app, bad JSON, offline, local mode). Never rejects. */
export function loadBuiltinPlaylist({ fetchFn = MOBILE ? nativeFetch : globalThis.fetch, base: root = serverRoot() } = {}) {
  if (loading && loadedRoot === root) return loading
  loadedRoot = root
  const mine = (loading = (async () => {
    let list = []
    try {
      const res = await fetchFn(root + 'workout-music/index.json', { cache: 'no-cache' })
      if (res.ok && !res.redirected) list = loadPlaylist(await res.json())
    } catch { list = [] }
    if (loading !== mine) return list   // the base changed while this was in flight
    playlist = list
    emit()
    return list
  })())
  return mine
}
export const builtinPlaylist = () => playlist

const current = () => tracks[order[pos]] || null
const setSrc = () => {
  const track = current()
  if (!track || !el) return
  const m4a = !!el.canPlayType?.('audio/mp4')
  el.src = trackUrl(track, musicRoot(), { m4a })
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
  playlist = null; loading = null; loadedRoot = null; musicBase = ''; el = null; tracks = []; order = []; pos = 0
  started = blocked = failed = userPaused = speaking = false
  errors = 0; base = MUSIC_BASE_VOLUME
  listeners.clear()
}
