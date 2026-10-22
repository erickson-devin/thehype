// Starting a workout (manual or follow-along) starts the music, set up per profile (Settings → Workout →
// Music Integration), so each user on an instance brings their own player. Two optional values
// live on the profile like any other setting, so they sync with it and sit in that user's own
// state file on the server:
//   musicWebhookUrl  an address The Hype calls when the workout starts (Spotify Connect on a
//                    speaker through a script on the home network, Home Assistant, …)
//   musicDeepLink    a link that opens the music app on this device (spotify:playlist:<id>)
//
// What happens on Start (startWorkoutMusic, called from sheets.jsx beginWorkout):
//   a webhook is set        → one silent no-cors POST to it; the deep link is left alone
//   no webhook, a deep link → opens the music app (an https link in a new tab, so the app stays)
//   neither                 → nothing; the timer carries on
import { MOBILE } from './mobile.js'

export const MUSIC_FIELD_MAX = 500

// A link that runs code in this page, or reads a file, is not a way to open a music app. A profile
// can arrive from an import or another device, so the stored value is checked again before use.
const NEVER = /^(javascript|data|vbscript|file|blob|about):/i

/** The webhook address as saved: an http(s) URL, trimmed. '' when empty or not one. */
export function cleanWebhookUrl(v) {
  const s = String(v ?? '').trim()
  if (!s || s.length > MUSIC_FIELD_MAX) return ''
  let u
  try { u = new URL(s) } catch { return '' }
  return u.protocol === 'http:' || u.protocol === 'https:' ? s : ''
}

/** The deep link as saved: "scheme:rest" with no spaces or control characters, trimmed. '' when not one. */
export function cleanDeepLink(v) {
  const s = String(v ?? '').trim()
  if (!s || s.length > MUSIC_FIELD_MAX) return ''
  if (/[\s\u0000-\u001f\u007f]/.test(s)) return ''
  if (!/^[a-z][a-z0-9+.-]*:\S/i.test(s) || NEVER.test(s)) return ''
  return s
}

// Hosts a browser counts as this machine: an https page may still call them over plain http.
const LOOPBACK = /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i
// Hosts iOS App Transport Security leaves alone: IP literals, .local, and unqualified names.
const ATS_EXEMPT = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]+\]|[^.]+|.+\.local)$/i

/**
 * Why a saved webhook address cannot fire from here, or null when it can (or nothing usable is saved).
 *   'mixed'     a web page served over https calling a plain http:// address: blocked as mixed
 *               content (loopback excepted), and silently, since the request is no-cors
 *   'cleartext' the iOS app calling a plain http:// address on a public hostname: App Transport
 *               Security refuses it (an IP, a .local or an unqualified name on the home network is exempt)
 * The Android app is neither: network_security_config.xml permits cleartext and capacitor.config.json
 * sets allowMixedContent, so an http:// address on the home network works there.
 */
export function webhookBlockedReason(url, { secureOrigin = false, native = false, android = false } = {}) {
  const s = cleanWebhookUrl(url)
  if (!s) return null
  const u = new URL(s)
  if (u.protocol !== 'http:') return null
  if (native) return android || ATS_EXEMPT.test(u.hostname) ? null : 'cleartext'
  return secureOrigin && !LOOPBACK.test(u.hostname) ? 'mixed' : null
}

/** Where this page runs, for webhookBlockedReason: read at call time so tests can stand in another origin. */
export function musicContext() {
  // Android is read here, not imported from api.js, which would pull the API client into this helper.
  return { secureOrigin: globalThis.location?.protocol === 'https:', native: MOBILE, android: /Android/.test(globalThis.navigator?.userAgent || '') }
}

/** What Start should do for this profile: { kind: 'webhook' | 'link', url } or null. */
export function musicPlan(S, ctx = musicContext()) {
  const hook = cleanWebhookUrl(S?.musicWebhookUrl)
  // a webhook that cannot fire from here gives way to the link, so the warning in Settings is not also silence
  if (hook && !webhookBlockedReason(hook, ctx)) return { kind: 'webhook', url: hook }
  const link = cleanDeepLink(S?.musicDeepLink)
  return link ? { kind: 'link', url: link } : null
}

/**
 * Opens a music link. In a browser an https link goes to a new tab, so the app (and its running
 * timer) is not replaced; an app-scheme link, or any link inside the native shell, navigates.
 */
export function openLink(url, { win = globalThis.window, native = MOBILE } = {}) {
  if (!native && /^https?:/i.test(url)) win.open(url, '_blank', 'noopener,noreferrer')
  else win.location.href = url
}

/**
 * Starts the music for the profile `S` (the store's state). `fetchFn` and `open` are injectable for
 * tests. Never throws and never waits: the workout starts whatever the music does. Returns what it
 * did ('webhook', 'link') or null.
 */
export function startWorkoutMusic(S, { fetchFn = globalThis.fetch, open = url => openLink(url), ctx } = {}) {
  const plan = musicPlan(S, ctx)
  if (!plan) return null
  try {
    if (plan.kind === 'webhook') {
      // POST is what Home Assistant's webhook trigger accepts by default (GET only when enabled). With
      // no body and no headers it is still a simple request: no preflight, an opaque response,
      // fire-and-forget. no-cors: a missing CORS header is not a failure.
      const p = fetchFn(plan.url, { method: 'POST', mode: 'no-cors' })
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } else {
      open(plan.url)
    }
  } catch { /* the music is a nicety, never a reason the workout does not start */ }
  return plan.kind
}
