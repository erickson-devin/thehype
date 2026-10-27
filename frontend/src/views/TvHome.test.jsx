// @vitest-environment happy-dom
// Android TV start screen: only follow-along routines, focus on the first row, OK starts it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { _setLangState } from '../lib/i18n-core.js'
import { beginWorkout } from '../sheets.jsx'
import TvHome from './TvHome.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({ beginWorkout: vi.fn() }))

const ex = [{ id: '0025', sets: 3, reps: 10 }]
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  _setLangState('en', null, null, null)
  nav.mockClear(); beginWorkout.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const setS = (routines, over = {}) => useStore.setState(s => ({
  S: { ...s.S, routines, dayPlan: {}, week: {}, workouts: [], active: null, ...over }, user: null,
}))
const items = () => [...host.querySelectorAll('.tv-list .tv-item')]

describe('TvHome', () => {
  it('lists only follow-along routines and focuses the first row', () => {
    setS([{ id: 'a', name: 'Auto A', auto: true, ex }, { id: 'm', name: 'Manual', ex }, { id: 'e', name: 'Empty', auto: true, ex: [] }])
    act(() => root.render(<TvHome />))
    expect(items().map(b => b.textContent)).toEqual([expect.stringContaining('Auto A')])
    expect(items()[0].textContent).toContain('1 exercises')
    expect(document.activeElement).toBe(items()[0])
  })
  it('OK on a row starts that routine', () => {
    setS([{ id: 'a', name: 'Auto A', auto: true, ex }])
    act(() => root.render(<TvHome />))
    act(() => { items()[0].click() })
    expect(beginWorkout).toHaveBeenCalledWith(['a'], null)
  })
  it('says how to get a routine here when there is none', () => {
    setS([{ id: 'm', name: 'Manual', ex }])
    act(() => root.render(<TvHome />))
    expect(host.querySelector('.tv-empty')?.textContent).toContain('No follow-along routines yet')
    expect(host.textContent).toContain('Open the full app')
  })
  it('offers to resume a follow-along session in progress', () => {
    setS([{ id: 'a', name: 'Auto A', auto: true, ex }], { active: { id: 'x', auto: true, name: 'Auto A' } })
    act(() => root.render(<TvHome />))
    expect(items()[0].textContent).toContain('Resume Auto A')
    act(() => { items()[0].click() })
    expect(nav).toHaveBeenCalledWith('/workout')
  })
})
