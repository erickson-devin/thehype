// Pure helpers for the built-in workout playlist (served at <appBase>workout-music/index.json). No DOM,
// no network: music-dom.js plays it. The licence labels mirror scripts/music/lib.mjs (pinned by a test).
export const LICENSE_LABELS = { 'CC-BY-4.0': 'CC BY 4.0', 'CC-BY-3.0': 'CC BY 3.0', 'CC0-1.0': 'CC0 1.0' }
export const MUSIC_BASE_VOLUME = 0.7   // under the cues, so the beeps and the voice carry
export const DUCK_FACTOR = 0.25
export const DUCK_RAMP_MS = 150

const isStr = v => typeof v === 'string' && v.trim() !== ''
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The playlist from an index.json body: only well-formed rows, only the fields the app uses. [] for anything else. */
export function loadPlaylist(index) {
  if (!isObj(index) || index.version !== 1 || !Array.isArray(index.tracks)) return []
  const out = []
  for (const r of index.tracks) {
    if (!isObj(r)) continue
    if (typeof r.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) continue
    if (!isStr(r.title) || !isStr(r.artist)) continue
    if (!Object.hasOwn(LICENSE_LABELS, r.license)) continue
    if (typeof r.file !== 'string' || !/^[a-z0-9-]+\.mp3$/.test(r.file)) continue
    if (r.license !== 'CC0-1.0' && !isStr(r.attribution)) continue
    const track = {
      id: r.id, title: r.title, artist: r.artist, license: r.license,
      licenseUrl: r.licenseUrl, attribution: r.attribution, durationSec: r.durationSec, file: r.file,
    }
    if (typeof r.m4a === 'string' && /^[a-z0-9-]+\.m4a$/.test(r.m4a)) track.m4a = r.m4a
    out.push(track)
  }
  return out
}

/** Which music a Start plays: a profile webhook/link overrides everything; the built-in playlist is the default for automated routines only. */
export function musicSource({ plan, auto, enabled = true, hasPlaylist }) {
  if (plan) return 'override'
  return auto && enabled !== false && hasPlaylist ? 'builtin' : 'off'
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded shuffle of 0..n-1 (Fisher–Yates). */
export function shuffledOrder(n, seed) {
  const a = Array.from({ length: Math.max(0, n | 0) }, (_, i) => i)
  const rnd = mulberry32(Number(seed) || 0)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const nextIndex = (pos, n) => (n <= 0 ? -1 : (pos + 1) % n)
export const prevIndex = (pos, n) => (n <= 0 ? -1 : (pos - 1 + n) % n)

/** The volume to play at: `base` (clamped to 0..1), a quarter of it while the voice talks. */
export function duckLevel({ speaking, base }) {
  const b = Math.min(1, Math.max(0, Number(base) || 0))
  return speaking ? b * DUCK_FACTOR : b
}

/** `steps` linear values from `from` towards `to`; the last is exactly `to`. */
export function rampSteps(from, to, steps = 5) {
  return Array.from({ length: steps }, (_, i) => (i === steps - 1 ? to : from + ((to - from) * (i + 1)) / steps))
}

export function trackUrl(track, base, { m4a = false } = {}) {
  return base + 'workout-music/' + (m4a && track.m4a ? track.m4a : track.file)
}

/** "Now playing" on screen: title, artist and, for CC BY, the licence label. */
export function nowPlayingLine(track, t) {
  if (track.license === 'CC0-1.0') return t('Now playing: {0} — {1}', track.title, track.artist)
  return t('Now playing: {0} — {1} ({2})', track.title, track.artist, LICENSE_LABELS[track.license] || track.license)
}

export const attributionFor = track => (track.license === 'CC0-1.0' ? '' : track.attribution || '')
