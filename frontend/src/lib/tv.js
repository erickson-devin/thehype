// Android TV / Google TV: the same APK runs on a television, driven by a remote. The native TvMode
// plugin (TvModePlugin.java) says whether this is one; ?tv=1 / ?tv=0 in the address (stored under
// gym_tv) force it either way, which is how the TV layout is tried in a desktop browser with the
// arrow keys. App.jsx applies the result: html[data-tv] for the styling, spatial navigation for focus.
import { isAndroid } from './mobile.js'

export const TV_OVERRIDE_KEY = 'gym_tv'

export const resolveTv = ({ native, override }) => override === '1' ? true : override === '0' ? false : native === true

// '1' | '0' | null. ?tv=1|0 is remembered, ?tv=clear forgets it; storage that throws reads as none.
export function readOverride(loc = globalThis.location, storage = globalThis.localStorage) {
  try {
    const q = new URLSearchParams(loc?.search || '').get('tv')
    if (q === '1' || q === '0') { try { storage.setItem(TV_OVERRIDE_KEY, q) } catch { /* */ } return q }
    if (q === 'clear') { try { storage.removeItem(TV_OVERRIDE_KEY) } catch { /* */ } return null }
    const v = storage.getItem(TV_OVERRIDE_KEY)
    return v === '1' || v === '0' ? v : null
  } catch { return null }
}

// Registered once, kept inside an object: a Capacitor plugin proxy answers `then` with a native call
// that never settles, so a promise resolved with the bare proxy would hang (the Coach hang, #42).
let pluginP = null
const tvPlugin = () => pluginP || (pluginP = (async () => {
  if (!(await isAndroid())) return null
  const { registerPlugin } = await import('@capacitor/core')
  return { TvMode: registerPlugin('TvMode') }
})().catch(() => null))

// null when it cannot be told (not Android, an APK without the plugin, no answer in 1.5 s).
export async function nativeTv() {
  try {
    const p = await tvPlugin()
    if (!p) return null
    const r = await Promise.race([p.TvMode.isTelevision(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))])
    return r?.tv === true
  } catch { return null }
}

export async function detectTv() {
  return resolveTv({ native: await nativeTv(), override: readOverride() })
}

let uninstall = null
export function applyTvMode(on, doc = globalThis.document) {
  // html[data-tv] drives the TV styling; spatial navigation (lib/spatial-nav.js, loaded on demand so a
  // phone build never pays for it) only while TV mode is on.
  if (on) doc.documentElement.setAttribute('data-tv', '1'); else doc.documentElement.removeAttribute('data-tv')
  if (on && !uninstall) import('./spatial-nav.js').then(m => { uninstall = m.installSpatialNav?.({ doc }) || null }).catch(() => {})
  if (!on && uninstall) { try { uninstall() } catch { /* */ } uninstall = null }
}
