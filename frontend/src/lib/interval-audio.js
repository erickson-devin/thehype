// Audio cues for the follow-along player: spoken announcements (Web Speech API) and the 3-2-1
// countdown beeps, which go through lib/sound.js so they get its iOS handling. No audio files.
import { beep } from './sound.js'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

const speechListeners = new Set()
let speechSeq = 0
/** Listens for speech: `fn` is called with true when an utterance starts, false when it ends, is cut off or fails. Returns the unsubscribe. */
export function onSpeech(fn) { speechListeners.add(fn); return () => { speechListeners.delete(fn) } }
const tell = on => { for (const fn of speechListeners) { try { fn(on) } catch { /* a listener never stops speech */ } } }

/** Say `text` now, cutting off anything still being spoken. Silent where speech is unavailable. */
export function speak(text, lang) {
  const s = synth()
  if (!s || !text || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    s.cancel()
    // The sequence number keeps a cancelled earlier utterance's late onerror('interrupted') from un-ducking this one.
    const my = ++speechSeq
    let over = false
    const end = () => { if (over) return; over = true; if (my === speechSeq) tell(false) }
    const u = new SpeechSynthesisUtterance(text)
    if (lang) u.lang = lang
    u.onend = end
    u.onerror = end
    setTimeout(end, 2000 + text.length * 80)   // engines that never fire onend
    tell(true)
    s.speak(u)
  } catch { tell(false) /* speech is a nicety, never a failure */ }
}
export function stopSpeaking() {
  speechSeq++
  try { synth()?.cancel() } catch { /* */ }
  tell(false)
}

/** One tick of the countdown: a short beep at 3, 2, 1, and a higher, longer one at 0 (go). */
export function countdownBeep(secLeft, enabled = true) {
  if (secLeft >= 1 && secLeft <= 3) beep(enabled, 660, 0.1)
  else if (secLeft === 0) beep(enabled, 1040, 0.3)
}
