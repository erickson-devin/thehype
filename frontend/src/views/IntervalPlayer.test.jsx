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

const tick = ms => act(async () => { vi.advanceTimersByTime(ms) })
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
