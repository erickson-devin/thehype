// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { bindUI } from '../components/ui.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({
    S: state.S,
    user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
    replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false }))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  loadStarterPlan: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(),
}))
globalThis.__APP_VERSION__ ??= 'test'
bindUI({ getState: () => ({ openSheet: () => ({ close: () => {} }) }) })

let host, root
beforeEach(() => {
  mocks.S = { unit: 'kg', restSec: 90, restPauseSec: 15, sound: false, effort: 'none', gifSize: 'full', workouts: [], routines: [], exWeights: {} }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

const mount = () => act(() => root.render(<Settings page="workout" />))
const field = label => host.querySelector(`input[aria-label="${label}"]`)
const type = (el, value) => act(() => {
  el.focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const https = () => vi.stubGlobal('location', { protocol: 'https:', href: 'https://hype.example/settings', origin: 'https://hype.example', hostname: 'hype.example' })
const WARN = 'the music will not start'
const leave = el => act(() => { el.blur() })

describe('Settings → Workout → Music Integration', () => {
  it('shows both fields, empty for a profile that never set them', () => {
    mount()
    expect(host.textContent).toContain('Music Integration')
    expect(field('Room Speakers (Advanced)').value).toBe('')
    expect(field('Phone / Headphone Audio').value).toBe('')
  })

  it('saves a webhook URL on the profile when the field is left', () => {
    mount()
    type(field('Room Speakers (Advanced)'), '  http://192.168.1.20:5000/start-music ')
    expect(mocks.S.musicWebhookUrl).toBeUndefined()           // nothing is saved while typing
    leave(field('Room Speakers (Advanced)'))
    expect(mocks.S.musicWebhookUrl).toBe('http://192.168.1.20:5000/start-music')
    expect(field('Room Speakers (Advanced)').value).toBe('http://192.168.1.20:5000/start-music')
  })

  it('saves a deep link with Enter, and reads back what is stored', () => {
    mount()
    const el = field('Phone / Headphone Audio')
    type(el, 'spotify:playlist:37i9dQZF1DX')
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(mocks.S.musicDeepLink).toBe('spotify:playlist:37i9dQZF1DX')
    mount()
    expect(field('Phone / Headphone Audio').value).toBe('spotify:playlist:37i9dQZF1DX')
  })

  it('does not save an unusable value, and says why', () => {
    mount()
    type(field('Room Speakers (Advanced)'), 'my speakers')
    leave(field('Room Speakers (Advanced)'))
    expect(mocks.S.musicWebhookUrl).toBeUndefined()
    expect(host.querySelector('[role="alert"]').textContent).toContain('http://')
    type(field('Phone / Headphone Audio'), 'javascript:alert(1)')
    leave(field('Phone / Headphone Audio'))
    expect(mocks.S.musicDeepLink).toBeUndefined()
  })

  it('clears the setting when the field is emptied', () => {
    mocks.S.musicDeepLink = 'spotify:playlist:abc'
    mount()
    expect(field('Phone / Headphone Audio').value).toBe('spotify:playlist:abc')
    type(field('Phone / Headphone Audio'), '')
    leave(field('Phone / Headphone Audio'))
    expect(mocks.S.musicDeepLink).toBe('')
  })

  describe('the address warning', () => {
    const lan = 'http://192.168.1.20:5000/start-music'
    it('warns when an https page has a plain http address saved', () => {
      https()
      mocks.S.musicWebhookUrl = lan
      mount()
      expect(host.textContent).toContain(WARN)
      expect(host.textContent).toContain('reverse proxy')
    })
    it('is quiet on an http page', () => {
      mocks.S.musicWebhookUrl = lan
      mount()
      expect(host.textContent).not.toContain(WARN)
    })
    it('is quiet for an https address', () => {
      https()
      mocks.S.musicWebhookUrl = 'https://hooks.example.com/play'
      mount()
      expect(host.textContent).not.toContain(WARN)
    })
    it('appears once a plain http address is saved from the field', () => {
      https()
      mount()
      type(field('Room Speakers (Advanced)'), '  http://192.168.1.20:5000/start-music ')
      leave(field('Room Speakers (Advanced)'))
      expect(host.textContent).toContain(WARN)
    })
    it('is quiet for a deep link', () => {
      https()
      mocks.S.musicDeepLink = 'spotify:playlist:abc'
      mount()
      expect(host.textContent).not.toContain(WARN)
    })
  })
})
