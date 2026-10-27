// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./sound.js', () => ({ beep: vi.fn() }))
import { beep } from './sound.js'
import { countdownBeep, onSpeech, speak, stopSpeaking, onVoicesChanged, voicesVersion, savedVoiceURI, saveVoiceURI, previewVoice } from './interval-audio.js'

class Utterance { constructor(text) { this.text = text } }

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('countdownBeep', () => {
  it('beeps short at 3, 2 and 1', () => {
    countdownBeep(3, true)
    expect(beep).toHaveBeenLastCalledWith(true, 660, 0.1)
    countdownBeep(1, true)
    expect(beep).toHaveBeenLastCalledWith(true, 660, 0.1)
    expect(beep).toHaveBeenCalledTimes(2)
  })
  it('beeps higher and longer at 0', () => {
    countdownBeep(0, true)
    expect(beep).toHaveBeenCalledWith(true, 1040, 0.3)
  })
  it('stays silent outside 0..3', () => {
    countdownBeep(4, true)
    countdownBeep(-1, true)
    expect(beep).not.toHaveBeenCalled()
  })
  it('passes the enabled flag through', () => {
    countdownBeep(2, false)
    expect(beep).toHaveBeenCalledWith(false, 660, 0.1)
  })
})

describe('speak', () => {
  it('does nothing and does not throw without a window', () => {
    expect(() => speak('Go!', 'de')).not.toThrow()
  })
  it('cancels what is being said, then speaks in the given language', () => {
    const engine = { cancel: vi.fn(), speak: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('Go!', 'de')
    expect(engine.cancel).toHaveBeenCalledTimes(1)
    expect(engine.speak).toHaveBeenCalledTimes(1)
    const u = engine.speak.mock.calls[0][0]
    expect(u.text).toBe('Go!')
    expect(u.lang).toBe('de')
  })
  it('says nothing for an empty line', () => {
    const engine = { cancel: vi.fn(), speak: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('')
    expect(engine.cancel).not.toHaveBeenCalled()
    expect(engine.speak).not.toHaveBeenCalled()
  })
  it('never throws when the engine does', () => {
    const engine = { cancel: vi.fn(() => { throw new Error('boom') }), speak: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    expect(() => speak('Go!')).not.toThrow()
  })
})

describe('stopSpeaking', () => {
  it('never throws when cancel does', () => {
    vi.stubGlobal('window', { speechSynthesis: { cancel: () => { throw new Error('boom') } } })
    expect(() => stopSpeaking()).not.toThrow()
  })
})

describe('onSpeech', () => {
  const setup = () => {
    const engine = { cancel: vi.fn(), speak: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    return engine
  }
  let offs = []
  const listen = fn => { const off = onSpeech(fn); offs.push(off); return off }
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { offs.forEach(o => o()); offs = []; vi.useRealTimers() })

  it('says true before the engine speaks, false when the utterance ends', () => {
    const engine = setup()
    const calls = []
    listen(on => calls.push(on))
    engine.speak.mockImplementation(() => calls.push('engine'))
    speak('Go!')
    expect(calls).toEqual([true, 'engine'])
    engine.speak.mock.calls[0][0].onend()
    expect(calls).toEqual([true, 'engine', false])
  })
  it('ignores the late error of a cut-off utterance', () => {
    const engine = setup()
    const fn = vi.fn()
    listen(fn)
    speak('A'); speak('B')
    const [a, b] = engine.speak.mock.calls.map(c => c[0])
    fn.mockClear()
    a.onerror()
    expect(fn).not.toHaveBeenCalledWith(false)
    b.onend()
    expect(fn).toHaveBeenCalledWith(false)
  })
  it('stopSpeaking says false', () => {
    setup()
    const fn = vi.fn()
    listen(fn)
    stopSpeaking()
    expect(fn).toHaveBeenCalledWith(false)
  })
  it('falls back to a timer when onend never fires, once', () => {
    setup()
    const fn = vi.fn()
    listen(fn)
    speak('Hello')
    fn.mockClear()
    vi.advanceTimersByTime(2000 + 5 * 80 - 1)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn.mock.calls).toEqual([[false]])
    vi.advanceTimersByTime(10_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('a throwing listener does not stop the speech', () => {
    const engine = setup()
    listen(() => { throw new Error('boom') })
    expect(() => speak('Go!')).not.toThrow()
    expect(engine.speak).toHaveBeenCalledTimes(1)
  })
  it('stops calling after unsubscribe', () => {
    setup()
    const fn = vi.fn()
    const off = listen(fn)
    off()
    speak('Go!')
    expect(fn).not.toHaveBeenCalled()
  })
  it('works without a window', () => {
    expect(typeof onSpeech(() => {})).toBe('function')
    expect(() => speak('Go!')).not.toThrow()
  })
})

const V = (name, voiceURI, lang, localService = true, def = false) => ({ name, voiceURI, lang, localService, default: def })
const DANIEL = 'com.apple.voice.compact.en-GB.Daniel'
const IOS = [
  V('Samantha', 'com.apple.voice.compact.en-US.Samantha', 'en-US', true, true),
  V('Samantha (Enhanced)', 'com.apple.voice.enhanced.en-US.Samantha', 'en-US'),
  V('Daniel', DANIEL, 'en-GB'),
]
const store = new Map()
const memoryStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)) }, removeItem: k => { store.delete(k) } }
const setupVoices = list => {
  store.clear()
  vi.stubGlobal('localStorage', memoryStorage)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  const engine = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => list), addEventListener: vi.fn() }
  vi.stubGlobal('window', { speechSynthesis: engine })
  return engine
}
const lastU = engine => engine.speak.mock.calls.at(-1)[0]

describe('speak: voice selection', () => {
  it('uses the best voice, its language, and the tuned rate', () => {
    const engine = setupVoices(IOS)
    speak('Go!', 'en')
    const u = lastU(engine)
    expect(u.voice.name).toBe('Samantha (Enhanced)')
    expect(u.lang).toBe('en-US')
    expect(u.rate).toBe(0.95)
    expect(u.pitch).toBe(1)
  })
  it('falls back to the language when there are no voices', () => {
    const engine = setupVoices([])
    speak('Go!', 'de')
    const u = lastU(engine)
    expect(u.voice).toBeUndefined()
    expect(u.lang).toBe('de')
    expect(u.rate).toBe(0.95)
  })
  it('still speaks on an engine without getVoices', () => {
    const engine = { cancel: vi.fn(), speak: vi.fn() }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('Go!', 'de')
    expect(lastU(engine).lang).toBe('de')
  })
  it('picks up voices that arrive on voiceschanged and tells listeners', () => {
    let list = []
    const engine = setupVoices([])
    engine.getVoices.mockImplementation(() => list)
    speak('Go!', 'en')
    expect(lastU(engine).voice).toBeUndefined()
    const fn = vi.fn()
    const off = onVoicesChanged(fn)
    const before = voicesVersion()
    list = IOS
    const call = engine.addEventListener.mock.calls[0]
    expect(call[0]).toBe('voiceschanged')
    call[1]()
    speak('Go!', 'en')
    expect(lastU(engine).voice.name).toBe('Samantha (Enhanced)')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(voicesVersion()).toBeGreaterThan(before)
    off()
  })
  it('hooks voiceschanged once per engine', () => {
    const engine = setupVoices(IOS)
    speak('a', 'en'); speak('b', 'en')
    expect(engine.addEventListener).toHaveBeenCalledTimes(1)
  })
  it('assigns onvoiceschanged on an engine without addEventListener', () => {
    const engine = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => IOS) }
    vi.stubGlobal('window', { speechSynthesis: engine })
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('Go!', 'en')
    expect(typeof engine.onvoiceschanged).toBe('function')
  })
  it('honours a saved voice and returns to automatic when cleared', () => {
    const engine = setupVoices(IOS)
    saveVoiceURI(DANIEL)
    speak('Go!', 'en')
    expect(lastU(engine).voice.name).toBe('Daniel')
    saveVoiceURI(null)
    expect(store.has('gym_voice')).toBe(false)
    speak('Go!', 'en')
    expect(lastU(engine).voice.name).toBe('Samantha (Enhanced)')
  })
  it('survives blocked storage', () => {
    setupVoices(IOS)
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    vi.stubGlobal('localStorage', bad)
    expect(savedVoiceURI()).toBeNull()
    expect(() => saveVoiceURI('x')).not.toThrow()
  })
  it('previews the given voice regardless of the stored one, or the automatic pick for null', () => {
    const engine = setupVoices(IOS)
    saveVoiceURI('com.apple.voice.compact.en-US.Samantha')
    previewVoice(DANIEL, 'en', 'Hi')
    expect(lastU(engine).text).toBe('Hi')
    expect(lastU(engine).voice.name).toBe('Daniel')
    previewVoice(null, 'en', 'Hi')
    expect(lastU(engine).voice.name).toBe('Samantha (Enhanced)')
  })
  it('still ducks around speech with voices present', () => {
    setupVoices(IOS)
    const fn = vi.fn()
    const off = onSpeech(fn)
    speak('Go!', 'en')
    expect(fn).toHaveBeenNthCalledWith(1, true)
    off()
  })
})
