// @vitest-environment happy-dom
// Native speech: the plugin answers only on Android; a missing plugin, a hang or an error is "no
// engine" (probe) or 'error' (speak), and nothing here ever rejects.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  vi.stubEnv('VITE_MOBILE', '1')
  return { platform: 'android', fail: false, hang: false, available: true, ended: 'done', calls: [] }
})

const VOICES = [{ voiceURI: 'en-us-x-iol-local', name: 'en-us-x-iol-local', lang: 'en-US', localService: true, default: true }]
const pluginProxy = () => new Proxy({}, {
  get: (_, prop) => {
    if (prop === 'then') return () => new Promise(() => {})
    return arg => {
      h.calls.push([prop, arg])
      if (h.hang) return new Promise(() => {})
      if (h.fail) return Promise.reject(new Error('"NativeSpeech" plugin is not implemented on android'))
      if (prop === 'isAvailable') return Promise.resolve({ available: h.available, engine: 'com.google.android.tts' })
      if (prop === 'getVoices') return Promise.resolve({ voices: VOICES })
      if (prop === 'speak') return Promise.resolve({ ended: h.ended })
      return Promise.resolve({})
    }
  },
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform },
  registerPlugin: () => pluginProxy(),
}))

beforeEach(() => {
  vi.resetModules()
  h.platform = 'android'; h.fail = false; h.hang = false; h.available = true; h.ended = 'done'; h.calls = []
})
afterEach(() => { vi.useRealTimers() })

describe('probeNativeSpeech', () => {
  it('lists the engine and its voices', async () => {
    const { probeNativeSpeech } = await import('./native-tts.js')
    expect(await probeNativeSpeech()).toEqual({ available: true, voices: VOICES })
  })
  it('is asked once', async () => {
    const { probeNativeSpeech } = await import('./native-tts.js')
    await probeNativeSpeech(); await probeNativeSpeech()
    expect(h.calls.filter(c => c[0] === 'isAvailable')).toHaveLength(1)
  })
  it('an engine that is not there is unavailable, without voices', async () => {
    h.available = false
    const { probeNativeSpeech } = await import('./native-tts.js')
    expect(await probeNativeSpeech()).toEqual({ available: false, voices: [] })
  })
  it('is null off Android and for an APK without the plugin', async () => {
    h.platform = 'ios'
    expect(await (await import('./native-tts.js')).probeNativeSpeech()).toBeNull()
    vi.resetModules(); h.platform = 'android'; h.fail = true
    expect(await (await import('./native-tts.js')).probeNativeSpeech()).toBeNull()
  })
  it('is null when the plugin never answers', async () => {
    vi.useFakeTimers()
    h.hang = true
    const { probeNativeSpeech } = await import('./native-tts.js')
    const p = probeNativeSpeech()
    await vi.advanceTimersByTimeAsync(8100)
    expect(await p).toBeNull()
  })
})

describe('nativeSpeak / nativeStop', () => {
  it('passes the options on and settles with how the utterance ended', async () => {
    const { nativeSpeak } = await import('./native-tts.js')
    const o = { text: 'Go!', lang: 'en', voiceURI: 'x', rate: 0.95, pitch: 1 }
    expect(await nativeSpeak(o)).toBe('done')
    expect(h.calls.find(c => c[0] === 'speak')[1]).toEqual(o)
    h.ended = 'interrupted'
    expect(await nativeSpeak(o)).toBe('interrupted')
  })
  it('never rejects: errors, an unknown answer and a missing plugin are all error', async () => {
    const { nativeSpeak, nativeStop } = await import('./native-tts.js')
    h.ended = 'weird'
    expect(await nativeSpeak({ text: 'Go!' })).toBe('error')
    h.fail = true
    expect(await nativeSpeak({ text: 'Go!' })).toBe('error')
    await expect(nativeStop()).resolves.toBeUndefined()
  })
  it('nativeStop calls the plugin', async () => {
    const { nativeStop } = await import('./native-tts.js')
    await nativeStop()
    expect(h.calls.some(c => c[0] === 'stop')).toBe(true)
  })
})
