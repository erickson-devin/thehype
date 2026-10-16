// Follow-along mode starts the music with the workout, set up per profile (Settings → Workout →
// Music Integration), so each user on an instance brings their own player. Two optional values
// live on the profile like any other setting, so they sync with it and sit in that user's own
// state file on the server:
//   musicWebhookUrl  an address The Hype calls when the workout starts (Spotify Connect on a
//                    speaker through a script on the home network, Home Assistant, …)
//   musicDeepLink    a link that opens the music app on this device (spotify:playlist:<id>)
//
// What happens on Start (startWorkoutMusic, called from sheets.jsx beginWorkout):
//   a webhook is set        → one silent no-cors request to it; the deep link is left alone
//   no webhook, a deep link → the page navigates to it, which opens the app
//   neither                 → nothing; the timer carries on
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

/** What Start should do for this profile: { kind: 'webhook' | 'link', url } or null. */
export function musicPlan(S) {
  const hook = cleanWebhookUrl(S?.musicWebhookUrl)
  if (hook) return { kind: 'webhook', url: hook }
  const link = cleanDeepLink(S?.musicDeepLink)
  return link ? { kind: 'link', url: link } : null
}

/**
 * Starts the music for the profile `S` (the store's state). `fetchFn` and `open` are injectable for
 * tests. Never throws and never waits: the workout starts whatever the music does. Returns what it
 * did ('webhook', 'link') or null.
 */
export function startWorkoutMusic(S, { fetchFn = globalThis.fetch, open = url => { window.location.href = url } } = {}) {
  const plan = musicPlan(S)
  if (!plan) return null
  try {
    if (plan.kind === 'webhook') {
      // no-cors: the answer is opaque and a missing CORS header is not a failure. Note that a page
      // served over https cannot call a plain http:// address (mixed content); the request is
      // simply blocked, which the catch below treats like any other miss.
      const p = fetchFn(plan.url, { method: 'GET', mode: 'no-cors' })
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } else {
      open(plan.url)
    }
  } catch { /* the music is a nicety, never a reason the workout does not start */ }
  return plan.kind
}
