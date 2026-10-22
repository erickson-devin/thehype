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
vi.mock('../lib/sound.js', () => ({ unlock: vi.fn() }))
vi.mock('../sheets.jsx', () => ({ finishWorkout: vi.fn() }))

import { speak, countdownBeep } from '../lib/interval-audio.js'
import { unlock } from '../lib/sound.js'
import { finishWorkout } from '../sheets.jsx'
import { getLang } from '../lib/i18n.js'
import { HYPE_LINES } from '../lib/hype-lines.js'

let host, root
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.S = {
    sound: true,
    routines: [{ id: 'r1', auto: true, autoWorkSec: 10, autoRestSec: 5, ex: [] }],
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
