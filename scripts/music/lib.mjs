// Pure helpers for the workout music manifest (catalogue/music/manifest.json): validation, the
// attribution text and the index the app reads. No I/O, no network; fetch-music.mjs does that.

export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']
export const LICENSE_URLS = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
}
export const LICENSE_LABELS = { 'CC-BY-4.0': 'CC BY 4.0', 'CC-BY-3.0': 'CC BY 3.0', 'CC0-1.0': 'CC0 1.0' }
export const TRACK_KEYS = ['id', 'title', 'artist', 'license', 'licenseUrl', 'sourceUrl', 'downloadUrl', 'mirrorUrl', 'fetch', 'attribution', 'durationSec', 'bpm', 'ai', 'sha256', 'bytes', 'verifiedOn', 'verifiedBy']

const MIRROR_PREFIX = '/erickson-devin/thehype/releases/download/'
const isStr = (v) => typeof v === 'string' && v.trim() !== ''
const isPosInt = (v) => Number.isInteger(v) && v > 0
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const httpsUrl = (v) => {
  if (typeof v !== 'string') return null
  try { const u = new URL(v); return u.protocol === 'https:' ? u : null } catch { return null }
}

export function validateManifest(m) {
  const errs = []
  if (!isPlainObject(m)) return ['manifest: not an object']
  if (m.version !== 1) errs.push('version must be 1')
  const pol = m.policy
  if (!isPlainObject(pol)) errs.push('policy: missing')
  else {
    if (pol.ai !== 'excluded') errs.push('policy.ai must be "excluded"')
    if (!Array.isArray(pol.licenses)) errs.push('policy.licenses: must be an array')
    else for (const l of pol.licenses) if (!ALLOWED_LICENSES.includes(l)) errs.push(`policy.licenses: "${l}" is not allowed`)
  }
  if (!Array.isArray(m.tracks) || m.tracks.length === 0) {
    errs.push('tracks must be a non-empty array')
    return errs
  }
  const seen = new Set()
  m.tracks.forEach((t, i) => {
    const at = `tracks[${i}]${isPlainObject(t) && t.id ? ` (${t.id})` : ''}`
    const e = (msg) => errs.push(`${at}: ${msg}`)
    if (!isPlainObject(t)) return e('not an object')
    for (const k of Object.keys(t)) if (!TRACK_KEYS.includes(k)) e(`unknown key "${k}"`)
    for (const k of TRACK_KEYS) if (!(k in t)) e(`missing key "${k}"`)
    if (typeof t.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id)) e('id must be lowercase kebab-case')
    else if (seen.has(t.id)) e(`duplicate id "${t.id}"`)
    else seen.add(t.id)
    if (!isStr(t.title)) e('title must be a non-empty string')
    if (!isStr(t.artist)) e('artist must be a non-empty string')
    if (!ALLOWED_LICENSES.includes(t.license)) e(`license "${t.license}" is not allowed`)
    else if (t.licenseUrl !== LICENSE_URLS[t.license]) e(`licenseUrl must be ${LICENSE_URLS[t.license]}`)
    if (!httpsUrl(t.sourceUrl)) e('sourceUrl must be an https URL')
    const dl = httpsUrl(t.downloadUrl)
    if (!dl) e('downloadUrl must be an https URL')
    else if (dl.hostname === 'files.freemusicarchive.org') e('downloadUrl must not point at files.freemusicarchive.org (hashed, expiring URL)')
    if ('mirrorUrl' in t && t.mirrorUrl !== null) {
      const mu = httpsUrl(t.mirrorUrl)
      if (!mu || mu.hostname !== 'github.com' || !mu.pathname.startsWith(MIRROR_PREFIX) || typeof t.id !== 'string' || !mu.pathname.endsWith('/' + t.id + '.mp3')) {
        e(`mirrorUrl must be this repo's release asset ${t.id}.mp3`)
      }
    }
    if (!isPlainObject(t.fetch)) e('fetch must be an object')
    else {
      for (const k of Object.keys(t.fetch)) if (k !== 'referer') e(`fetch: unknown key "${k}"`)
      if ('referer' in t.fetch && !httpsUrl(t.fetch.referer)) e('fetch.referer must be an https URL')
    }
    if (typeof t.attribution !== 'string') e('attribution must be a string')
    else if (t.license !== 'CC0-1.0') {
      if (t.attribution.trim() === '') e('attribution is required for CC BY tracks')
      else if (isStr(t.artist) && !t.attribution.includes(t.artist)) e('attribution must contain the artist')
    }
    if (!isPosInt(t.durationSec)) e('durationSec must be a positive integer')
    if (!(t.bpm === null || (typeof t.bpm === 'number' && t.bpm > 0))) e('bpm must be null or a positive number')
    if (t.ai !== false) e('ai must be explicitly false: AI-generated music is excluded')
    if (!(t.sha256 === null || (typeof t.sha256 === 'string' && /^[0-9a-f]{64}$/.test(t.sha256)))) e('sha256 must be null or 64 lowercase hex chars')
    if (!(t.bytes === null || isPosInt(t.bytes))) e('bytes must be null or a positive integer')
    if ((t.sha256 === null) !== (t.bytes === null)) e('sha256 and bytes must both be null or both be set')
    if (typeof t.verifiedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.verifiedOn)) e('verifiedOn must be YYYY-MM-DD')
    if (!isStr(t.verifiedBy)) e('verifiedBy must be a non-empty string')
  })
  return errs
}

export function attributionLines(m) {
  const out = []
  for (const lic of ['CC-BY-4.0', 'CC-BY-3.0']) {
    for (const t of m.tracks) {
      if (t.license !== lic) continue
      out.push(t.attribution + (t.attribution.includes('creativecommons.org/licenses/') ? '' : ' — ' + t.licenseUrl))
    }
  }
  return out
}

export function attributionText(m) {
  const lines = ['Workout music: third-party, not covered by the AGPL. Source of truth: catalogue/music/manifest.json', '']
  for (const lic of ['CC-BY-4.0', 'CC-BY-3.0']) {
    const own = { ...m, tracks: m.tracks.filter((t) => t.license === lic) }
    if (!own.tracks.length) continue
    lines.push(LICENSE_LABELS[lic], ...attributionLines(own), '')
  }
  const cc0 = m.tracks.filter((t) => t.license === 'CC0-1.0')
  if (cc0.length) lines.push('CC0 1.0 (public domain, no attribution required)', ...cc0.map((t) => `"${t.title}" by ${t.artist}`), '')
  return lines.join('\n')
}

export function looksLikeMp3(buf) {
  if (!buf || buf.length < 3) return false
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
}

export function indexFor(m, { m4a = new Set() } = {}) {
  return {
    version: 1,
    tracks: m.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      license: t.license,
      licenseUrl: t.licenseUrl,
      attribution: t.attribution,
      durationSec: t.durationSec,
      bpm: t.bpm,
      file: t.id + '.mp3',
      bytes: t.bytes,
      sha256: t.sha256,
      ...(m4a.has(t.id) ? { m4a: t.id + '.m4a' } : {}),
    })),
  }
}

export function fetchOptionsFor(track) {
  return { redirect: 'follow', headers: track.fetch?.referer ? { Referer: track.fetch.referer } : {} }
}

/** Where to try downloading a track, in order: the repo's release-asset mirror (when set), then the origin. */
export function fetchCandidates(track) {
  const out = []
  if (track.mirrorUrl) out.push({ url: track.mirrorUrl, headers: {}, label: 'mirror' })
  out.push({ url: track.downloadUrl, headers: fetchOptionsFor(track).headers, label: 'origin' })
  return out
}

export function serializeManifest(m) {
  const tracks = m.tracks.map((t) => Object.fromEntries(TRACK_KEYS.map((k) => [k, t[k]])))
  return JSON.stringify({ version: m.version, policy: m.policy, tracks }, null, 2) + '\n'
}

export function parseArgs(argv) {
  const o = { pin: false, encode: false, check: false, only: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pin') o.pin = true
    else if (a === '--encode') o.encode = true
    else if (a === '--check') o.check = true
    else if (a === '--only' || a === '--out') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`)
      if (a === '--only') o.only = v.split(',').map((s) => s.trim()).filter(Boolean)
      else o.out = v
    } else throw new Error(`unknown argument: ${a}`)
  }
  return o
}

export const STAGE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.(mp3|m4a)$/

/** What stage-music copies. indexText: contents of files/index.json or null; listing: file names in files/.
 *  Returns { skip: string|null, copies: [{ from, to }], index: object|null }. Tracks are renamed
 *  <id>-<sha256[0:12]>.<ext> so nginx can cache them immutably; index.json is rewritten to match. */
export function stagePlan(indexText, listing) {
  const skip = (why) => ({ skip: why, copies: [], index: null })
  if (indexText == null) return skip('no index.json — no workout music staged (run scripts/music/fetch-music.mjs first)')
  let idx
  try { idx = JSON.parse(indexText) } catch { return skip('index.json is not valid JSON') }
  if (!isPlainObject(idx) || idx.version !== 1 || !Array.isArray(idx.tracks)) return skip('index.json: unsupported shape')
  if (!listing.includes('attribution.txt')) return skip('attribution.txt missing — CC BY tracks cannot ship without it')
  const usable = (f) => typeof f === 'string' && STAGE_NAME.test(f) && listing.includes(f)
  const kept = []
  const copies = []
  for (const t of idx.tracks) {
    if (!isPlainObject(t) || typeof t.id !== 'string' || !usable(t.file)) continue
    if (typeof t.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(t.sha256)) continue
    const stem = t.id + '-' + t.sha256.slice(0, 12)
    const next = { ...t, file: stem + '.mp3' }
    copies.push({ from: t.file, to: next.file })
    if (usable(t.m4a)) {
      next.m4a = stem + '.m4a'
      copies.push({ from: t.m4a, to: next.m4a })
    } else delete next.m4a
    kept.push(next)
  }
  if (!kept.length) return skip('no track files present')
  copies.push({ from: 'attribution.txt', to: 'attribution.txt' })
  return { skip: null, copies, index: { ...idx, tracks: kept } }
}
