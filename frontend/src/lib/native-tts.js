// Spoken cues through the Android system text-to-speech engine, for WebViews that have no
// speechSynthesis (Android TV). The native NativeSpeech plugin (NativeSpeechPlugin.java) wraps
// android.speech.tts.TextToSpeech; lib/interval-audio.js uses it only when web speech is missing.
import { isAndroid } from './mobile.js'

// Registered once, kept inside an object: a Capacitor plugin proxy answers `then` with a native call
// that never settles, so a promise resolved with the bare proxy would hang (the Coach hang, #42).
let pluginP = null
const plugin = () => pluginP || (pluginP = (async () => {
  if (!(await isAndroid())) return null
  const { registerPlugin } = await import('@capacitor/core')
  return { NativeSpeech: registerPlugin('NativeSpeech') }
})().catch(() => null))

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

let probeP = null
/** { available, voices } once the engine has answered; null when it cannot be told (not Android, an APK without the plugin, no answer in 8 s). Asked once. */
export const probeNativeSpeech = () => probeP || (probeP = (async () => {
  try {
    const p = await plugin()
    if (!p) return null
    const a = await within(p.NativeSpeech.isAvailable(), 8000)
    if (a?.available !== true) return { available: false, voices: [] }
    const v = await within(p.NativeSpeech.getVoices(), 8000).catch(() => null)
    return { available: true, voices: Array.isArray(v?.voices) ? v.voices : [] }
  } catch { return null }
})())

/** Says `text` (flushing what is being said). Settles with how it ended; never rejects. */
export async function nativeSpeak({ text, lang, voiceURI, rate, pitch } = {}) {
  try {
    const p = await plugin()
    if (!p) return 'error'
    // The engine answers when the utterance ends, so the wait is as long as the line plus slack.
    const r = await within(p.NativeSpeech.speak({ text, lang, voiceURI, rate, pitch }), 10000 + String(text || '').length * 150)
    return r?.ended === 'done' || r?.ended === 'interrupted' ? r.ended : 'error'
  } catch { return 'error' }
}

export async function nativeStop() {
  try {
    const p = await plugin()
    if (p) await within(p.NativeSpeech.stop(), 1500)
  } catch { /* nothing to stop */ }
}
