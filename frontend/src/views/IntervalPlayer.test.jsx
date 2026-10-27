// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntervalPlayer from './IntervalPlayer.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({
    S: state.S,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../lib/interval-audio.js', () => ({ speak: vi.fn(), stopSpeaking: vi.fn(), countdownBeep: vi.fn() }))
vi.mock('../lib/music-dom.js', () => ({
  builtinPlaylist: () => mocks.playlist,
  musicState: () => mocks.music,
  loadBuiltinPlaylist: vi.fn(() => Promise.resolve(mocks.playlist || [])),
  onMusicChange: vi.fn(() => () => {}),
  pauseMusic: vi.fn(), resumeMusic: vi.fn(), nextTrack: vi.fn(), startBuiltinMusic: vi.fn(), stopMusic: vi.fn(),
}))
vi.mock('../lib/sound.js', () => ({ unlock: vi.fn() }))
vi.mock('../sheets.jsx', () => ({ finishWorkout: vi.fn(), finishWorkoutSheet: vi.fn(), menuSheet: vi.fn(), confirmSheet: vi.fn() }))

import { speak, countdownBeep } from '../lib/interval-audio.js'
import { unlock } from '../lib/sound.js'
import { pauseMusic, resumeMusic, startBuiltinMusic, stopMusic } from '../lib/music-dom.js'
import { finishWorkout, finishWorkoutSheet, menuSheet } from '../sheets.jsx'
import { useUI } from '../store/useUI.js'
import { getBackOverride, setBackOverride } from '../lib/back.js'
import { getLang } from '../lib/i18n.js'
import { HYPE_LINES } from '../lib/hype-lines.js'
import { positionAt, startClock } from '../lib/interval-schedule.js'

let host, root
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.playlist = null
  mocks.music = { started: false, playing: false, track: null }
  mocks.S = {
    sound: true,
    routines: [{ id: 'r1', auto: true, autoWorkSec: 10, autoRestSec: 5, autoReadySec: 0, ex: [] }],
    active: {
      routineIds: ['r1'],
      entries: [{ id: '0001', target: { sets: 2, reps: 10 }, sets: [{ w: 0, r: 10, done: false }, { w: 0, r: 10, done: false }] }],
    },
  }
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<IntervalPlayer />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const remount = () => { act(() => root.unmount()); root = createRoot(host); act(() => root.render(<IntervalPlayer />)) }
const tick = ms => act(async () => { vi.advanceTimersByTime(ms) })
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const said = () => speak.mock.calls.map(c => c[0])

describe('the player’s start cues', () => {
  it('opens the first Work block with a high beep and a spoken Go!, naming the exercise', () => {
    expect(countdownBeep).toHaveBeenCalledWith(0, true)
    expect(said()).toHaveLength(1)
    expect(said()[0]).toMatch(/^First up: .+\. Go!$/)
  })

  it('announces the rest, then opens the next Work block with a beep and Go! again', async () => {
    await tick(10_000)                       // the first 10 s of work are over
    expect(said()[1]).toMatch(/^Rest for 5 seconds\. Next up: /)
    const beepsBefore = countdownBeep.mock.calls.filter(c => c[0] === 0).length
    await tick(5_000)                        // the rest is over
    expect(said()[2]).toBe('Go!')
    expect(countdownBeep.mock.calls.filter(c => c[0] === 0).length).toBe(beepsBefore + 1)
  })

  it('counts the last three seconds of a block before it, one beep each', async () => {
    await tick(7_500)
    const counted = countdownBeep.mock.calls.map(c => c[0]).filter(n => n > 0)
    expect(counted).toEqual([3, 2, 1].slice(0, counted.length))
    expect(counted[0]).toBe(3)
  })

  it('stays quiet when muted: nothing is spoken and no beep sounds', async () => {
    const mute = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Mute')
    act(() => { mute.click() })
    speak.mockClear(); countdownBeep.mockClear()
    await tick(10_000)                       // into the rest
    await tick(5_000)                        // and back to work
    expect(speak).not.toHaveBeenCalled()
    // the 3-2-1 ticks still run, but every one is asked for silently (enabled = false)
    expect(countdownBeep.mock.calls.length).toBeGreaterThan(0)
    expect(countdownBeep.mock.calls.every(c => c[1] === false)).toBe(true)
  })
})

describe('the get-ready lead-in', () => {
  const label = () => host.querySelector('div[style*="letter-spacing"]').textContent
  const counter = () => host.querySelector('div[style*="font-weight: 800"]').textContent
  beforeEach(() => {
    mocks.S.routines[0].autoReadySec = 20
    speak.mockClear(); countdownBeep.mockClear()
    remount()
  })

  it('opens with a Get ready block that shows the first exercise', () => {
    expect(label()).toBe('Get ready')
    expect(host.querySelector('.ip-media video').getAttribute('src')).toMatch(/clip\/0001\.mp4$/)
    expect(host.textContent).toContain('Set 1 of 2')
  })

  it('speaks the lead-in once, with no Go! beep yet', () => {
    expect(said()).toHaveLength(1)
    expect(said()[0]).toMatch(/^Get ready\. First up: .+\. Starting in 20 seconds\.$/)
    expect(countdownBeep).not.toHaveBeenCalledWith(0, true)
  })

  it('says just Go! into the first set, which is not ticked until it is worked', async () => {
    await tick(20_000)
    expect(said().at(-1)).toBe('Go!')
    expect(countdownBeep).toHaveBeenCalledWith(0, true)
    expect(label()).toBe('Work')
    expect(mocks.S.active.entries[0].sets[0].done).toBe(false)
    await tick(10_000)
    expect(mocks.S.active.entries[0].sets[0].done).toBe(true)
  })

  it('Skip jumps to the first set and logs nothing', async () => {
    act(() => { button('Skip').click() })
    await tick(100)
    expect(said().at(-1)).toBe('Go!')
    expect(mocks.S.active.entries[0].sets[0].done).toBe(false)
    expect(counter()).toBe('10')
  })

  it('is left out of a resumed session', () => {
    mocks.S.active.entries[0].sets[0].done = true
    speak.mockClear()
    remount()
    expect(said()[0]).toMatch(/^First up: .+\. Go!$/)
    expect(label()).toBe('Work')
  })

  it('shows on the lock screen as Get ready · First up', () => {
    const ms = { setActionHandler: vi.fn(), setPositionState: vi.fn(), metadata: null, playbackState: 'none' }
    Object.defineProperty(navigator, 'mediaSession', { value: ms, configurable: true })
    globalThis.MediaMetadata = class { constructor(m) { Object.assign(this, m) } }
    try {
      remount()
      expect(ms.metadata.title).toBe('Get ready')
      expect(ms.metadata.artist).toMatch(/^First up: /)
    } finally { delete navigator.mediaSession; delete globalThis.MediaMetadata }
  })
})

describe('the player’s controls', () => {
  it('unlocks audio on the Pause tap', () => {
    unlock.mockClear()
    act(() => { button('Pause').click() })
    expect(unlock).toHaveBeenCalled()
  })

  it('End workout pauses the clock: no set is ticked and no rest announced afterwards', async () => {
    act(() => { button('End workout').click() })
    expect(finishWorkout).toHaveBeenCalledTimes(1)
    await tick(15_000)
    expect(mocks.S.active.entries[0].sets[0].done).toBe(false)
    expect(said().some(x => x.startsWith('Rest for'))).toBe(false)
  })

  it('speaks in the app language', () => {
    expect(speak.mock.calls[0][1]).toBe(getLang())
  })

  it('ticks the set when a work block runs out', async () => {
    await tick(10_000)
    expect(mocks.S.active.entries[0].sets[0].done).toBe(true)
    expect(typeof mocks.S.active.entries[0].sets[0].at).toBe('number')
  })

  it('Skip moves on without ticking the set', async () => {
    act(() => { button('Skip').click() })
    await tick(100)
    expect(mocks.S.active.entries[0].sets[0].done).toBe(false)
  })
})

describe('the player’s exercise picture', () => {
  const entry = id => ({ id, target: { sets: 1, reps: 10 }, sets: [{ w: 0, r: 10, done: false }] })

  it('shows the animation of the exercise being worked', () => {
    expect(host.querySelector('.ip-media video').getAttribute('src')).toMatch(/clip\/0001\.mp4$/)
  })

  it('shows the next exercise during the rest', async () => {
    mocks.S.active.entries = [entry('0001'), entry('9066')]
    remount()
    await tick(10_000)
    expect(host.querySelector('.ip-media video').getAttribute('src')).toMatch(/9066\.mp4$/)
    expect(host.textContent).toContain('Up next')
  })

  it('leaves the name to carry the block for an exercise it does not know', () => {
    mocks.S.active.entries = [entry('zz-unknown')]
    remount()
    expect(host.querySelector('.ip-media')).toBeNull()
    expect(host.querySelector('.exmedia')).toBeNull()
    expect(host.textContent).toContain('Unknown Exercise')
  })

  it('shows the still under reduced motion', () => {
    const saved = window.matchMedia
    window.matchMedia = q => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })
    try {
      remount()
      expect(host.querySelector('.ip-media video')).toBeNull()
      expect(host.querySelector('.ip-media img.thumb').getAttribute('src')).toMatch(/still\/0001\.webp$/)
    } finally { window.matchMedia = saved }
  })

  it('shows no picture when animations are hidden in Settings', () => {
    mocks.S.gifSize = 'off'
    remount()
    expect(host.querySelector('.ip-media')).toBeNull()
  })
})

describe('hype lines', () => {
  const ticks = async (...steps) => { for (const ms of steps) await tick(ms) }
  const four = () => {
    mocks.S.active.entries = ['0001', '0001', '0001', '0001'].map(id => ({ id, target: { sets: 1, reps: 10 }, sets: [{ w: 0, r: 10, done: false }] }))
    remount()
  }

  it('adds a halfway line to the Go!, then a final-round line naming the exercise', async () => {
    four()
    await ticks(10_000, 5_000, 10_000, 5_000)   // one block per act: the player re-renders between blocks
    const half = said().at(-1).match(/^Go! (.+)$/)
    expect(half).toBeTruthy()
    expect(HYPE_LINES.halfway).toContain(half[1])
    await ticks(10_000, 5_000)
    const last = said().at(-1)
    expect(last.startsWith('Go! ')).toBe(true)
    const name = host.querySelector('div[style*="font-size: 28px"]').textContent
    expect(HYPE_LINES.lastRound.map(l => l.replace('{0}', name))).toContain(last.slice(4))
  })

  it('says none of it when muted', async () => {
    four()
    const mute = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Mute')
    act(() => { mute.click() })
    speak.mockClear()
    await ticks(10_000, 5_000, 10_000, 5_000, 10_000, 5_000)
    expect(speak).not.toHaveBeenCalled()
  })

  it('calls the last ten seconds of a long work block', async () => {
    mocks.S.routines[0].autoWorkSec = 30
    remount()
    await tick(20_500)
    expect(HYPE_LINES.finalTen).toContain(said().at(-1))
  })
})

describe('time while hidden', () => {
  const four = () => {
    mocks.S.active.entries = ['0001', '0001', '0001', '0001'].map(id => ({ id, target: { sets: 1, reps: 10 }, sets: [{ w: 0, r: 10, done: false }] }))
    remount()
  }
  const jump = ms => act(() => { vi.setSystemTime(Date.now() + ms) })
  const sets = () => mocks.S.active.entries.flatMap(e => e.sets)

  it('catches up past the end and ticks every set', async () => {
    jump(102_000)                       // a frozen page: no timers run
    await tick(200)
    expect(mocks.S.active.entries[0].sets.every(s => s.done)).toBe(true)
    expect(finishWorkout).toHaveBeenCalled()
  })

  it('catches up into the right block and ticks only what ended', async () => {
    four()
    const t0 = Date.now()
    jump(31_000)
    await tick(200)
    expect(sets().map(s => s.done)).toEqual([true, true, false, false])
    const blocks = ['w', 'r', 'w', 'r', 'w', 'r', 'w'].map((k, i) => ({ kind: k === 'w' ? 'work' : 'rest', sec: k === 'w' ? 10 : 5, id: 'x', i }))
    expect(positionAt(blocks, startClock(t0), t0 + 31_200).idx).toBe(4)   // the block the player shows
    expect(host.textContent).toContain('Set 3 of 4')
  })

  it('a short gap inside a block ticks nothing', async () => {
    jump(3_000)
    await tick(200)
    expect(sets().some(s => s.done)).toBe(false)
    expect(host.querySelector('div[style*="font-weight: 800"]').textContent).toBe('7')
  })

  it('a hidden page that keeps ticking logs sets live', async () => {
    await tick(16_000)
    expect(mocks.S.active.entries[0].sets[0].done).toBe(true)
  })

  it('visibilitychange catches up without waiting for the interval', () => {
    jump(12_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.S.active.entries[0].sets[0].done).toBe(true)
    delete document.visibilityState
  })
})

describe('media session', () => {
  let ms
  beforeEach(() => {
    ms = { setActionHandler: vi.fn(), setPositionState: vi.fn(), metadata: null, playbackState: 'none' }
    Object.defineProperty(navigator, 'mediaSession', { value: ms, configurable: true })
    globalThis.MediaMetadata = class { constructor(m) { Object.assign(this, m) } }
    remount()
  })
  afterEach(() => { delete navigator.mediaSession; delete globalThis.MediaMetadata })

  it('publishes the exercise and wires next to Skip', async () => {
    expect(ms.metadata.title).toBeTruthy()
    expect(ms.metadata.title).toBe(host.querySelector('div[style*="font-size: 28px"]').textContent)
    const next = ms.setActionHandler.mock.calls.find(c => c[0] === 'nexttrack')[1]
    act(() => { next() })
    await tick(100)
    expect(host.textContent).toContain('Get ready')
    expect(mocks.S.active.entries[0].sets[0].done).toBe(false)
  })

  it('nulls every handler on unmount', () => {
    act(() => root.unmount())
    ms.setActionHandler.mockClear()
    root = createRoot(host)   // keep afterEach's unmount valid
    act(() => root.render(<div />))
    const names = ['play', 'pause', 'nexttrack']
    const last = n => ms.setActionHandler.mock.calls.filter(c => c[0] === n).at(-1)
    names.forEach(n => expect(last(n) ? last(n)[1] : null).toBeNull())
  })
})

describe('workout music', () => {
  const TRACK = { title: 'Laserpack', artist: 'Kevin MacLeod', license: 'CC-BY-4.0' }
  const withMusic = (music) => { mocks.playlist = [TRACK]; if (music) mocks.music = music; remount() }
  const musicBtn = () => host.querySelector('.ip-music button[aria-pressed]')

  it('shows no music row without a playlist', () => {
    expect(host.querySelector('.ip-music')).toBeNull()
  })
  it('shows the track with its licence while playing', () => {
    withMusic({ started: true, playing: true, track: TRACK })
    expect(host.querySelector('.ip-music').textContent).toContain('Now playing: Laserpack — Kevin MacLeod (CC BY 4.0)')
  })
  it('shows no row when the profile has its own music link', () => {
    mocks.S.musicDeepLink = 'spotify:playlist:a'
    withMusic()
    expect(host.querySelector('.ip-music')).toBeNull()
  })
  it('pauses and resumes the music with the clock', () => {
    act(() => { button('Pause').click() })
    expect(pauseMusic).toHaveBeenCalled()
    act(() => { button('Resume').click() })
    expect(resumeMusic).toHaveBeenCalled()
  })
  it('End workout pauses the music, and leaving the player stops it', () => {
    act(() => { button('End workout').click() })
    expect(pauseMusic).toHaveBeenCalled()
    act(() => root.unmount())
    expect(stopMusic).toHaveBeenCalled()
    root = createRoot(host)
  })
  it('the music button turns it off for the profile while playing', () => {
    withMusic({ started: true, playing: true, track: TRACK })
    act(() => { musicBtn().click() })
    expect(pauseMusic).toHaveBeenCalledWith({ user: true })
    expect(mocks.S.builtinMusic).toBe(false)
  })
  it('the music button starts it inside the tap when it is not running', () => {
    withMusic()
    act(() => { musicBtn().click() })
    expect(startBuiltinMusic).toHaveBeenCalled()
    expect(mocks.S.builtinMusic).toBe(true)
  })
  it('the lock-screen pause and play drive the music too', () => {
    const ms = { setActionHandler: vi.fn(), setPositionState: vi.fn(), metadata: null, playbackState: 'none' }
    Object.defineProperty(navigator, 'mediaSession', { value: ms, configurable: true })
    globalThis.MediaMetadata = class { constructor(m) { Object.assign(this, m) } }
    try {
      remount()
      const h = n => ms.setActionHandler.mock.calls.filter(c => c[0] === n).at(-1)[1]
      pauseMusic.mockClear()
      act(() => { h('pause')() })
      expect(pauseMusic).toHaveBeenCalled()
      act(() => { h('play')() })
      expect(resumeMusic).toHaveBeenCalled()
    } finally { delete navigator.mediaSession; delete globalThis.MediaMetadata }
  })
})

describe('hardware keys and the TV screen', () => {
  const key = (k, extra = {}) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })) })
  const counter = () => host.querySelector('.ip-count').textContent
  afterEach(() => { useUI.setState({ tv: false, sheets: [] }); setBackOverride(null) })

  it('Enter pauses the clock and the music; the countdown stops', async () => {
    await tick(2_000)
    key('Enter')
    expect(pauseMusic).toHaveBeenCalled()
    const frozen = counter()
    await tick(3_000)
    expect(counter()).toBe(frozen)
  })

  it('ArrowRight skips the block without logging its set', () => {
    key('ArrowRight')
    expect(host.querySelector('div[style*="letter-spacing"]').textContent).toBe('Rest')
    expect(mocks.S.active.entries[0].sets.every(x => !x.done)).toBe(true)
  })

  it('a native MediaPlayPause toggles pause and play', async () => {
    act(() => { window.dispatchEvent(new CustomEvent('opengym:media-key', { detail: { key: 'MediaPlayPause' } })) })
    expect(pauseMusic).toHaveBeenCalled()
    act(() => { window.dispatchEvent(new CustomEvent('opengym:media-key', { detail: { key: 'MediaPlayPause' } })) })
    expect(resumeMusic).toHaveBeenCalled()
  })

  it('ignores keys while a sheet is open', () => {
    useUI.setState({ sheets: [{ id: 's1' }] })
    key('ArrowRight')
    expect(host.querySelector('div[style*="letter-spacing"]').textContent).toBe('Work')
  })

  it('off a TV the End button still calls finishWorkout, and Escape does nothing', () => {
    key('Escape')
    expect(finishWorkoutSheet).not.toHaveBeenCalled()
    expect(getBackOverride()).toBeNull()
    act(() => { button('End workout').click() })
    expect(finishWorkout).toHaveBeenCalledTimes(1)
    expect(finishWorkoutSheet).not.toHaveBeenCalled()
  })

  it('on a TV: the two-column layout, the key hint, and Back opens the finish sheet', () => {
    act(() => { useUI.setState({ tv: true }) })
    expect(host.querySelector('.ip-tv')).not.toBeNull()
    expect(host.textContent).toContain('OK Pause')
    expect(typeof getBackOverride()).toBe('function')
    act(() => { getBackOverride()() })
    expect(finishWorkoutSheet).toHaveBeenCalledTimes(1)
    expect(finishWorkout).not.toHaveBeenCalled()
    expect(typeof finishWorkoutSheet.mock.calls[0][0].onDiscard).toBe('function')
  })

  it('on a TV: ArrowDown opens the menu and Escape ends the workout', () => {
    act(() => { useUI.setState({ tv: true }) })
    key('ArrowDown')
    expect(menuSheet).toHaveBeenCalledTimes(1)
    key('Escape')
    expect(finishWorkoutSheet).toHaveBeenCalledTimes(1)
  })
})
