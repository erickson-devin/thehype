// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pickVoice, rankVoices, speechTuning, voiceLabel, voiceDetail } from './voice.js'

const V = (name, voiceURI, lang, localService = true, def = false) => ({ name, voiceURI, lang, localService, default: def })
const ZOE = V('Zoe (Premium)', 'com.apple.voice.premium.en-US.Zoe', 'en-US')
const SAM_E = V('Samantha (Enhanced)', 'com.apple.voice.enhanced.en-US.Samantha', 'en-US')
const DANIEL = V('Daniel', 'com.apple.voice.compact.en-GB.Daniel', 'en-GB')
const ANNA = V('Anna', 'com.apple.voice.compact.de-DE.Anna', 'de-DE')
const ios = [
  V('Samantha', 'com.apple.voice.compact.en-US.Samantha', 'en-US', true, true), SAM_E, DANIEL, ZOE,
  V('Eddy (English (US))', 'com.apple.eloquence.en-US.Eddy', 'en-US'),
  V('Bubbles', 'com.apple.speech.synthesis.voice.Bubbles', 'en-US'), ANNA,
]
const android = [
  V('English United States', 'English United States', 'en-US', true, true),
  V('en-us-x-sfg-network', 'en-us-x-sfg-network', 'en-US', false),
  V('en-us-x-sfg-local', 'en-us-x-sfg-local', 'en-US'),
  V('de-de-x-deb-local', 'de-de-x-deb-local', 'de-DE'),
]
const chrome = [
  V('Google US English', 'Google US English', 'en-US', false),
  V('Microsoft Zira - English (United States)', 'Microsoft Zira - English (United States)', 'en-US'),
  V('Microsoft David - English (United States)', 'Microsoft David - English (United States)', 'en-US', true, true),
]
const ARIA = V('Microsoft Aria Online (Natural) - English (United States)', 'Microsoft Aria Online (Natural) - English (United States)', 'en-US', false)
const edge = [...chrome, ARIA]
const names = list => list.map(v => v.name)

describe('pickVoice / rankVoices', () => {
  it('prefers premium, then enhanced, on iOS', () => {
    expect(pickVoice(ios, 'en').name).toBe('Zoe (Premium)')
    expect(pickVoice(ios.filter(v => v !== ZOE), 'en').name).toBe('Samantha (Enhanced)')
  })
  it('ranks and filters novelty voices', () => {
    expect(names(rankVoices(ios, 'en'))).toEqual(['Zoe (Premium)', 'Samantha (Enhanced)', 'Samantha', 'Daniel', 'Eddy (English (US))'])
  })
  it('picks by language', () => {
    expect(pickVoice(ios, 'de').name).toBe('Anna')
    expect(pickVoice(ios, 'de-CH').name).toBe('Anna')
  })
  it('handles Android', () => {
    expect(pickVoice(android, 'en').name).toBe('English United States')
    expect(rankVoices(android, 'en').at(-1).name).toBe('en-us-x-sfg-network')
  })
  it('handles desktop browsers', () => {
    expect(pickVoice(chrome, 'en').name).toBe('Microsoft David - English (United States)')
    expect(pickVoice(edge, 'en').name).toBe(ARIA.name)
  })
  it('treats bare pt and zh as their app regions', () => {
    const pt = [V('A', 'a', 'pt-BR'), V('B (Premium)', 'b', 'pt-BR'), V('C compact', 'c', 'pt-PT')]
    const pts = [pt[1], pt[2]]
    expect(pickVoice(pts, 'pt').lang).toBe('pt-PT')
    expect(pickVoice(pts, 'pt-BR').lang).toBe('pt-BR')
    const zh = [V('a', 'a', 'zh-HK'), V('b', 'b', 'zh-CN'), V('c', 'c', 'zh-TW')]
    expect(pickVoice(zh, 'zh').lang).toBe('zh-CN')
    expect(pickVoice(zh, 'zh-TW').lang).toBe('zh-TW')
    expect(pickVoice([zh[0]], 'zh')).toBeNull()
  })
  it('accepts Android underscores', () => {
    const v = { name: 'x', voiceURI: 'x', lang: 'en_US' }
    expect(pickVoice([v], 'en')).toBe(v)
  })
  it('honours a valid chosen voice only', () => {
    expect(pickVoice(ios, 'en', DANIEL.voiceURI)).toBe(DANIEL)
    expect(pickVoice(ios, 'en', 'gone').name).toBe('Zoe (Premium)')
    expect(pickVoice(ios, 'en', ANNA.voiceURI).name).toBe('Zoe (Premium)')
  })
  it('returns null for nothing usable', () => {
    expect(pickVoice([], 'en')).toBeNull()
    expect(pickVoice(undefined, 'en')).toBeNull()
    expect(pickVoice(ios, undefined)).toBeNull()
  })
  it('drops duplicate voiceURIs', () => {
    expect(rankVoices([DANIEL, { ...DANIEL }], 'en')).toHaveLength(1)
  })
})

describe('speechTuning', () => {
  it('is slightly under full speed', () => {
    expect(speechTuning()).toEqual({ rate: 0.95, pitch: 1 })
    const { rate } = speechTuning()
    expect(rate >= 0.9 && rate <= 1).toBe(true)
  })
})

describe('Android engine voices', () => {
  const gtts = [
    V('en-us-x-iol-network', 'en-us-x-iol-network', 'en-US', false, true),
    V('en-us-x-iol-local', 'en-us-x-iol-local', 'en-US'),
    V('en-gb-x-gbb-local', 'en-gb-x-gbb-local', 'en-GB'),
    V('de-de-x-deb-local', 'de-de-x-deb-local', 'de-DE'),
  ]
  it('Automatic prefers the on-device voice of the right language, even over the default network one', () => {
    expect(pickVoice(gtts, 'en-US', null).name).toBe('en-us-x-iol-local')
    expect(pickVoice(gtts, 'de', null).name).toBe('de-de-x-deb-local')
  })
})

describe('voiceLabel / voiceDetail', () => {
  it('trims vendor decoration', () => {
    expect(voiceLabel(chrome[1])).toBe('Zira')
    expect(voiceLabel(ARIA)).toBe('Aria Online (Natural)')
    expect(voiceLabel(chrome[0])).toBe('US English')
    expect(voiceLabel(SAM_E)).toBe('Samantha (Enhanced)')
    expect(voiceLabel({ name: '', voiceURI: 'x' })).toBe('x')
  })
  it('makes an Android engine name readable', () => {
    expect(voiceLabel(android[2])).toBe('English (US) · sfg')
    expect(voiceLabel(V('de-de-x-deb-network', 'de-de-x-deb-network', 'de-DE', false))).toBe('German (DE) · deb')
    expect(voiceLabel(V('en-US-language', 'en-US-language', 'en-US'))).toBe('English (US)')
  })
  it('details language and network need', () => {
    expect(voiceDetail({ lang: 'en_US', localService: false })).toBe('en-US · Needs internet')
    expect(voiceDetail({ lang: 'en-US', localService: true })).toBe('en-US')
  })
})
