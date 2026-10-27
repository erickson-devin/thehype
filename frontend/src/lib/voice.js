// Picks the voice the follow-along cues are spoken in (lib/interval-audio.js) and what the
// Settings voice sheet lists. Pure: voices in, voices out. The OS decides which voices exist
// (Siri's are never exposed to web apps); this only chooses well among them.
const norm = l => String(l || '').trim().replace(/_/g, '-').toLowerCase()   // Android reports en_US
const baseOf = l => norm(l).split('-')[0]
// The app's bare codes name one region (i18n-core LANGS): pt is Portugal, zh is Simplified.
const REGION_OF = { pt: 'pt-pt', zh: 'zh-cn' }
// Sound effects, not voices (Apple). Never listed, never picked.
const NOVELTY = new Set(['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical', 'jester', 'organ', 'pipe organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox'])
// Old formant voices: real but robotic. Listed last, picked only when nothing else exists.
const LEGACY = new Set(['agnes', 'bruce', 'fred', 'junior', 'kathy', 'princess', 'ralph', 'vicki', 'victoria'])
const firstName = v => String(v?.name || '').toLowerCase().split(/\s*[(\-]/)[0].trim()

/** 3 premium, 2 enhanced/natural/neural, 1 plain, 0 compact/legacy. */
export function voiceTier(v) {
  const s = (String(v?.name || '') + ' ' + String(v?.voiceURI || '')).toLowerCase()
  if (/premium/.test(s)) return 3
  if (/enhanced|natural|neural|wavenet|siri/.test(s)) return 2
  if (/compact|espeak|eloquence/.test(s) || LEGACY.has(firstName(v))) return 0
  return 1
}
const langScore = (v, lang) => {
  const want = REGION_OF[norm(lang)] || norm(lang), have = norm(v.lang)
  if (!want || baseOf(have) !== baseOf(want)) return 0
  if (have === 'zh-hk' && want !== 'zh-hk') return 0          // Cantonese is not Mandarin
  return have === want ? 2 : 1
}
/** Voices for `lang`, best first: exact region, quality tier, on-device, the OS default. */
export function rankVoices(voices, lang) {
  const seen = new Set()
  return (Array.isArray(voices) ? voices : [])
    .map((v, i) => ({ v, i, l: v ? langScore(v, lang) : 0 }))
    .filter(x => x.l > 0 && !NOVELTY.has(firstName(x.v)) && !seen.has(x.v.voiceURI) && seen.add(x.v.voiceURI))
    .sort((a, b) => b.l - a.l || voiceTier(b.v) - voiceTier(a.v)
      || (b.v.localService === true) - (a.v.localService === true) || (!!b.v.default) - (!!a.v.default) || a.i - b.i)
    .map(x => x.v)
}
/** The chosen voice while it exists and speaks `lang`'s language; otherwise the best one; else null. */
export function pickVoice(voices, lang, chosenURI) {
  if (chosenURI) {
    const c = (Array.isArray(voices) ? voices : []).find(v => v && v.voiceURI === chosenURI)
    if (c && baseOf(c.lang) === baseOf(REGION_OF[norm(lang)] || lang)) return c
  }
  return rankVoices(voices, lang)[0] || null
}
// Five percent under full speed: clearer consonants over music and breathing, without "Go!"
// landing late or a long cue running over a short block.
export const SPEECH_RATE = 0.95
export const speechTuning = () => ({ rate: SPEECH_RATE, pitch: 1 })
// Android's engine names its voices like en-us-x-iol-local / de-de-x-deb-network: language, region,
// the voice's code, local or network. Shown as "English (US) · iol". Its per-language default is
// named en-US-language, shown as "English (US)".
const ANDROID_NAME = /^([a-z]{2,3})-([a-z]{2})-(?:x-([a-z0-9]+)-(?:local|network)|language)$/i
function androidLabel(name) {
  const m = ANDROID_NAME.exec(name)
  if (!m) return ''
  try {
    const lang = new Intl.DisplayNames(['en'], { type: 'language' }).of(m[1].toLowerCase())
    return lang ? `${lang} (${m[2].toUpperCase()})${m[3] ? ` · ${m[3]}` : ''}` : ''
  } catch { return '' }
}
/** The picker's title: vendor prefixes and Microsoft's " - Language (Region)" tail dropped. */
export function voiceLabel(v) {
  const named = androidLabel(String(v?.name || '').trim())
  if (named) return named
  const n = String(v?.name || '').replace(/^(Microsoft|Google)\s+/i, '').replace(/\s+-\s+[^-]+\([^)]*\)\s*$/, '').trim()
  return n || String(v?.voiceURI || '')
}
/** The picker's subtitle: the voice's language tag, plus "Needs internet" for a network voice. */
export const voiceDetail = (v, tr = s => s) => [String(v?.lang || '').replace(/_/g, '-'), v?.localService === false ? tr('Needs internet') : ''].filter(Boolean).join(' · ')
