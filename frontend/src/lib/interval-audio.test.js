// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./sound.js', () => ({ beep: vi.fn() }))
import { beep } from './sound.js'
import { countdownBeep, speak, stopSpeaking } from './interval-audio.js'

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
