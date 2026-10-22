// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginWorkout, repeatWorkout } from './sheets.jsx'
import { EXDB } from './lib/exercises.js'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'

const clone = v => JSON.parse(JSON.stringify(v))
const ids = EXDB.filter(e => e.bp !== 'cardio').slice(0, 3).map(e => e.id)
const hook = 'https://ha.example.com/api/webhook/start-music'
const called = () => fetch.mock.calls.some(c => c[0] === hook)

function install(routines, extra = {}) {
  const S = clone(DEF)
  S.routines = routines
  S.week = {}
  S.active = null
  S.workouts = []
  Object.assign(S, extra)
  useStore.setState({ S, user: null })
}

const routines = auto => [
  { id: 'strength', name: 'Strength', emoji: '🏋️', prog: 'off', ...(auto ? { auto: true } : {}), ex: [{ id: ids[0], sets: 3, reps: 5, weight: 60 }] },
]

beforeEach(() => {
  localStorage.clear()
  useUI.setState({ sheets: [] })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve()))
})
afterEach(() => vi.unstubAllGlobals())

describe('music at the start of a workout', () => {
  it('fires for a manual routine session', () => {
    install(routines(false), { musicWebhookUrl: hook })
    act(() => beginWorkout(['strength'], null))
    expect(fetch).toHaveBeenCalledWith(hook, { method: 'POST', mode: 'no-cors' })
    expect(useStore.getState().S.active.auto).toBeUndefined()
  })
  it('fires for a freestyle session', () => {
    install(routines(false), { musicWebhookUrl: hook })
    act(() => beginWorkout([], null))
    expect(called()).toBe(true)
  })
  it('fires for a follow-along session', () => {
    install(routines(true), { musicWebhookUrl: hook })
    act(() => beginWorkout(['strength'], null))
    expect(called()).toBe(true)
    expect(useStore.getState().S.active.auto).toBe(true)
  })
  it('does nothing with no webhook and no link', () => {
    install(routines(false))
    act(() => beginWorkout(['strength'], null))
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fires on Repeat today', () => {
    install(routines(false), { musicWebhookUrl: hook, weighIn: false })
    const w = { id: 'w1', d: '2026-01-01', start: 1, end: 2, name: 'Strength', routineId: 'strength', entries: [{ id: ids[0], sets: [{ w: 60, r: 5, done: true }] }] }
    act(() => repeatWorkout(w))
    expect(useStore.getState().S.active).toBeTruthy()
    expect(called()).toBe(true)
  })
})
