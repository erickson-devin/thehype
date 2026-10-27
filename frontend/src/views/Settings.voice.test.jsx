// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings, { VoiceSheet } from './Settings.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({
    S: state.S,
    user: null,
    update: mut => {
      const next = structuredClone(state.S)
      mut(next)
      state.S = next
    },
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
vi.mock('../lib/api.js', () => ({
  api: vi.fn(), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(),
}))
globalThis.__APP_VERSION__ ??= 'test'

const V = (name, voiceURI, lang, localService = true, def = false) => ({ name, voiceURI, lang, localService, default: def })
const SAM = V('Samantha (Enhanced)', 'com.apple.voice.enhanced.en-US.Samantha', 'en-US')
const DAN = V('Daniel', 'com.apple.voice.compact.en-GB.Daniel', 'en-GB')
const ANNA = V('Anna', 'com.apple.voice.compact.de-DE.Anna', 'de-DE')

let host, root, engine, list
beforeEach(() => {
  mocks.S = {
    unit: 'kg', restSec: 90, restPauseSec: 15, sound: true, soundOnSilent: false, effort: 'none',
    gifSize: 'full', workouts: [], routines: [], exWeights: {},
  }
  list = [SAM, DAN, ANNA]
  engine = { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => list), addEventListener: vi.fn() }
  Object.defineProperty(window, 'speechSynthesis', { value: engine, configurable: true })
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.speechSynthesis
  delete globalThis.SpeechSynthesisUtterance
})

const mount = (page = 'workout') => act(() => root.render(<Settings page={page} />))
const rowTitled = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)
const titles = () => [...host.querySelectorAll('.lrow-t')].map(e => e.textContent)
const lastU = () => engine.speak.mock.calls.at(-1)[0]

describe('Settings — Voice cues', () => {
  it('shows the section, the row on Automatic, and the footer', () => {
    mount()
    expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).toContain('Voice cues')
    expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic')
    expect(host.textContent).toContain('Siri’s voices are not available to apps')
  })
  it('is absent without speech synthesis', () => {
    delete window.speechSynthesis
    mount()
    expect(rowTitled('Voice')).toBeUndefined()
    expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).not.toContain('Voice cues')
  })
  it('shows the saved voice, or Automatic when it is unknown', () => {
    localStorage.setItem('gym_voice', DAN.voiceURI)
    mount()
    expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Daniel')
    localStorage.setItem('gym_voice', 'nope')
    mount('alerts'); mount()
    expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic')
  })
})

describe('VoiceSheet', () => {
  const render = close => act(() => root.render(<VoiceSheet close={close} />))
  it('lists Automatic plus the voices for the language, with the automatic pick as subtitle', () => {
    render(vi.fn())
    expect(titles()).toEqual(['Automatic', 'Samantha (Enhanced)', 'Daniel'])
    expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Samantha (Enhanced)')
    expect(rowTitled('Automatic').querySelector('.lrow-k')).toBeTruthy()
  })
  it('previews and saves a tapped voice without closing, then back to automatic', () => {
    const close = vi.fn()
    render(close)
    act(() => { rowTitled('Daniel').click() })
    expect(localStorage.getItem('gym_voice')).toBe(DAN.voiceURI)
    expect(lastU().voice.voiceURI).toBe(DAN.voiceURI)
    expect(lastU().text).toBe('Get ready. First up: push-ups. Go!')
    expect(close).not.toHaveBeenCalled()
    render(close)
    expect(rowTitled('Daniel').querySelector('.lrow-k')).toBeTruthy()
    act(() => { rowTitled('Automatic').click() })
    expect(localStorage.getItem('gym_voice')).toBeNull()
    expect(lastU().voice.name).toBe('Samantha (Enhanced)')
  })
  it('fills in when the voices arrive late', () => {
    list = []
    render(vi.fn())
    expect(titles()).toEqual(['Automatic'])
    expect(rowTitled('Automatic').querySelector('.lrow-s')).toBeNull()
    list = [SAM, DAN, ANNA]
    act(() => { engine.addEventListener.mock.calls[0][1]() })
    expect(titles()).toEqual(['Automatic', 'Samantha (Enhanced)', 'Daniel'])
  })
  it('Done closes', () => {
    const close = vi.fn()
    render(close)
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Done').click() })
    expect(close).toHaveBeenCalled()
  })
})
