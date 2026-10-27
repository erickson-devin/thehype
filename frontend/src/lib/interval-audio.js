// Audio cues for the follow-along player: spoken announcements (Web Speech API, or the system
// text-to-speech through lib/native-tts.js where the WebView has none, as on Android TV) and the 3-2-1
// countdown beeps, which go through lib/sound.js so they get its iOS handling. No audio files.
// Which voice speaks (and how fast) is chosen by lib/voice.js.
import { beep } from './sound.js'
import { pickVoice, speechTuning } from './voice.js'
import { probeNativeSpeech, nativeSpeak, nativeStop } from './native-tts.js'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)
const webSpeech = () => !!synth() && typeof SpeechSynthesisUtterance !== 'undefined'
// The native engine, once primeSpeech() has heard that it is there. Only used where web speech is missing.
let nativeInfo = null, primed = false
const nativeSpeech = () => !webSpeech() && !!nativeInfo

const speechListeners = new Set()
let speechSeq = 0
/** Listens for speech: `fn` is called with true when an utterance starts, false when it ends, is cut off or fails. Returns the unsubscribe. */
export function onSpeech(fn) { speechListeners.add(fn); return () => { speechListeners.delete(fn) } }
const tell = on => { for (const fn of speechListeners) { try { fn(on) } catch { /* a listener never stops speech */ } } }

// The voices, per device. Chrome/Android answer getVoices() with [] until 'voiceschanged' fires,
// so the list is cached when it comes and Settings is told (onVoicesChanged).
let voiceCache = [], hookedOn = null, voicesVer = 0
const voiceListeners = new Set()
const bump = () => { voicesVer++; for (const fn of voiceListeners) { try { fn() } catch { /* */ } } }
export function availableVoices(s = synth()) {
  if (!s && nativeSpeech()) return nativeInfo.voices
  if (!s || typeof s.getVoices !== 'function') return []
  if (hookedOn !== s) {
    hookedOn = s; voiceCache = []
    const refresh = () => { try { voiceCache = s.getVoices() || [] } catch { /* keep the last list */ } bump() }
    try { if (typeof s.addEventListener === 'function') s.addEventListener('voiceschanged', refresh); else s.onvoiceschanged = refresh } catch { /* */ }
  }
  try { const list = s.getVoices(); if (list && list.length) voiceCache = list } catch { /* */ }
  return voiceCache
}
export const speechSupported = () => webSpeech() || !!nativeInfo
/** Asks, once at boot, whether the system speech engine is there (a no-op where web speech exists). Settings and speak() follow the answer. */
export function primeSpeech() {
  if (primed || webSpeech()) return
  primed = true
  probeNativeSpeech().then(r => { if (r?.available) { nativeInfo = r; bump() } }).catch(() => {})
}
export const onVoicesChanged = fn => { voiceListeners.add(fn); return () => { voiceListeners.delete(fn) } }
export const voicesVersion = () => voicesVer
// This phone's chosen voice (voices differ per device, so never synced: not in gym_state_v1).
export const VOICE_KEY = 'gym_voice'
export const savedVoiceURI = () => { try { return localStorage.getItem(VOICE_KEY) || null } catch { return null } }
export function saveVoiceURI(uri) {
  try { if (uri) localStorage.setItem(VOICE_KEY, uri); else localStorage.removeItem(VOICE_KEY) } catch { /* storage blocked: automatic */ }
  bump()
}

/** Say `text` now, cutting off anything still being spoken. Silent where speech is unavailable. */
export function speak(text, lang, opts = {}) {
  if (text && nativeSpeech()) return speakNative(text, lang, opts)
  const s = synth()
  if (!s || !text || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    s.cancel()
    // The sequence number keeps a cancelled earlier utterance's late onerror('interrupted') from un-ducking this one.
    const my = ++speechSeq
    let over = false
    const end = () => { if (over) return; over = true; if (my === speechSeq) tell(false) }
    const u = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(availableVoices(s), lang, 'voiceURI' in opts ? opts.voiceURI : savedVoiceURI())
    if (voice) { u.voice = voice; u.lang = voice.lang || lang }   // Safari ignores a voice whose lang disagrees
    else if (lang) u.lang = lang
    const { rate, pitch } = speechTuning()
    u.rate = rate; u.pitch = pitch
    u.onend = end
    u.onerror = end
    setTimeout(end, 2000 + text.length * 80)   // engines that never fire onend
    tell(true)
    s.speak(u)
  } catch { tell(false) /* speech is a nicety, never a failure */ }
}
function speakNative(text, lang, opts) {
  try {
    // As below: the sequence number keeps a flushed earlier utterance's 'interrupted' from un-ducking this one.
    const my = ++speechSeq
    let over = false
    const end = () => { if (over) return; over = true; if (my === speechSeq) tell(false) }
    const voice = pickVoice(availableVoices(), lang, 'voiceURI' in opts ? opts.voiceURI : savedVoiceURI())
    const { rate, pitch } = speechTuning()
    setTimeout(end, 2000 + text.length * 80)   // an engine that never answers
    tell(true)
    nativeSpeak({ text, lang: voice?.lang || lang, voiceURI: voice?.voiceURI, rate, pitch }).then(end, end)
  } catch { tell(false) }
}
/** Settings' preview: says `text` in the voice given (null = the automatic pick). Call from a tap. */
export const previewVoice = (voiceURI, lang, text) => speak(text, lang, { voiceURI: voiceURI || null })
export function stopSpeaking() {
  speechSeq++
  try { synth()?.cancel() } catch { /* */ }
  if (nativeSpeech()) nativeStop()
  tell(false)
}

/** One tick of the countdown: a short beep at 3, 2, 1, and a higher, longer one at 0 (go). */
export function countdownBeep(secLeft, enabled = true) {
  if (secLeft >= 1 && secLeft <= 3) beep(enabled, 660, 0.1)
  else if (secLeft === 0) beep(enabled, 1040, 0.3)
}
