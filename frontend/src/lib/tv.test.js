// @vitest-environment happy-dom
// Android TV: whether this is a television comes from the native plugin, and ?tv=1 / ?tv=0 override it
// for trying the layout on a desktop. A missing plugin, a hang or a throwing store is "not a TV".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  vi.stubEnv('VITE_MOBILE', '1')
  return { platform: 'android', tv: true, fail: false, hang: false, remover: null }
})
h.remover = vi.fn()

const pluginProxy = () => new Proxy({}, {
  get: (_, prop) => {
    if (prop === 'then') return () => new Promise(() => {})
    return () => {
      if (h.hang) return new Promise(() => {})
      if (h.fail) return Promise.reject(new Error('"TvMode" plugin is not implemented on android'))
      return Promise.resolve({ tv: h.tv, touch: false })
    }
  },
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform },
  registerPlugin: () => pluginProxy(),
}))
vi.mock('./spatial-nav.js', () => ({ installSpatialNav: vi.fn(() => h.remover) }))

beforeEach(() => {
  vi.resetModules()
  h.platform = 'android'; h.tv = true; h.fail = false; h.hang = false
  h.remover.mockClear()
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('nativeTv', () => {
  it('says yes on a television', async () => {
    const { nativeTv } = await import('./tv.js')
    expect(await nativeTv()).toBe(true)
  })
  it('says no on a phone', async () => {
    h.tv = false
    const { nativeTv } = await import('./tv.js')
    expect(await nativeTv()).toBe(false)
  })
  it('cannot tell off Android', async () => {
    h.platform = 'ios'
    const { nativeTv, detectTv } = await import('./tv.js')
    expect(await nativeTv()).toBeNull()
    expect(await detectTv()).toBe(false)
  })
  it('an APK without the plugin is not a TV', async () => {
    h.fail = true
    const { detectTv } = await import('./tv.js')
    expect(await detectTv()).toBe(false)
  })
  it('a plugin that never answers is not a TV after 1.5 s', async () => {
    vi.useFakeTimers()
    h.hang = true
    const { detectTv } = await import('./tv.js')
    const p = detectTv()
    await vi.advanceTimersByTimeAsync(1600)
    expect(await p).toBe(false)
  })
})

describe('override', () => {
  it('resolveTv: the override beats the native answer', async () => {
    const { resolveTv } = await import('./tv.js')
    expect(resolveTv({ native: false, override: '1' })).toBe(true)
    expect(resolveTv({ native: true, override: '0' })).toBe(false)
    expect(resolveTv({ native: true, override: null })).toBe(true)
    expect(resolveTv({ native: null, override: null })).toBe(false)
  })
  it('?tv=1 persists and ?tv=clear removes it', async () => {
    const { readOverride, TV_OVERRIDE_KEY } = await import('./tv.js')
    expect(readOverride({ search: '?tv=1' }, localStorage)).toBe('1')
    expect(localStorage.getItem(TV_OVERRIDE_KEY)).toBe('1')
    expect(readOverride({ search: '' }, localStorage)).toBe('1')
    expect(readOverride({ search: '?tv=clear' }, localStorage)).toBeNull()
    expect(localStorage.getItem(TV_OVERRIDE_KEY)).toBeNull()
    expect(readOverride({ search: '?tv=0' }, localStorage)).toBe('0')
  })
  it('a storage that throws reads as no override', async () => {
    const { readOverride } = await import('./tv.js')
    const bad = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(readOverride({ search: '' }, bad)).toBeNull()
    expect(readOverride({ search: '?tv=clear' }, bad)).toBeNull()
  })
  it('detectTv: a stored 1 makes a phone a TV', async () => {
    h.tv = false
    localStorage.setItem('gym_tv', '1')
    const { detectTv } = await import('./tv.js')
    expect(await detectTv()).toBe(true)
  })
})

describe('applyTvMode', () => {
  it('sets and clears html[data-tv], and removes spatial navigation when it goes off', async () => {
    const { applyTvMode } = await import('./tv.js')
    applyTvMode(true)
    expect(document.documentElement.getAttribute('data-tv')).toBe('1')
    await vi.waitFor(async () => {
      const m = await import('./spatial-nav.js')
      expect(m.installSpatialNav).toHaveBeenCalled()
    })
    await new Promise(r => setTimeout(r, 0))
    applyTvMode(false)
    expect(document.documentElement.hasAttribute('data-tv')).toBe(false)
    expect(h.remover).toHaveBeenCalledTimes(1)
  })
})
