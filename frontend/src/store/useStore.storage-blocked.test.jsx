// @vitest-environment happy-dom

/* Storage blocked outright (private mode, a denied permission): reading or writing the guest flag
   must not throw out of the store. */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: async () => ({}), setRemoteAuth: () => {} }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {} }) } }))

const denied = () => { throw new DOMException('denied', 'SecurityError') }

async function openStore() {
  vi.resetModules()
  const m = await import('./useStore.js')
  return m.useStore
}
afterEach(() => { vi.restoreAllMocks() })

describe('a blocked localStorage', () => {
  it('isGuest reads as false instead of throwing', async () => {
    const useStore = await openStore()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    expect(useStore.getState().isGuest()).toBe(false)
  })
  it('setGuest does not throw', async () => {
    const useStore = await openStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied)
    expect(() => useStore.getState().setGuest(true)).not.toThrow()
    expect(() => useStore.getState().setGuest(false)).not.toThrow()
  })
})
