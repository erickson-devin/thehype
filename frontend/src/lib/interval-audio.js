// Audio cues for the follow-along player: spoken announcements (Web Speech API) and the 3-2-1
// countdown beeps, which go through lib/sound.js so they get its iOS handling. No audio files.
import { beep } from './sound.js'

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** Say `text` now, cutting off anything still being spoken. Silent where speech is unavailable. */
export function speak(text, lang) {
  const s = synth()
  if (!s || !text || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (lang) u.lang = lang
    s.speak(u)
  } catch { /* speech is a nicety, never a failure */ }
}
export function stopSpeaking() { try { synth()?.cancel() } catch { /* */ } }

/** One tick of the countdown: a short beep at 3, 2, 1, and a higher, longer one at 0 (go). */
export function countdownBeep(secLeft, enabled = true) {
  if (secLeft >= 1 && secLeft <= 3) beep(enabled, 660, 0.1)
  else if (secLeft === 0) beep(enabled, 1040, 0.3)
}
