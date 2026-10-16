// @vitest-environment happy-dom
// "Automated workout" in the routine editor: its switch, the interval steppers, and the live duration estimate.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { DEF, useStore } from '../store/useStore.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
vi.mock('../sheets.jsx', () => ({ glyphPicker: vi.fn(), exercisePicker: vi.fn(), exConfigSheet: vi.fn(), confirmSheet: vi.fn() }))
vi.mock('../components/Media.jsx', () => ({ Thumb: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = v => JSON.parse(JSON.stringify(v))

let root, container
const ex = (id, sets, extra = {}) => ({ id, sets, reps: 10, weight: 0, mode: 'reps', ...extra })

function renderRoutine(routine) {
  const S = clone(DEF)
  S.routines = [{ id: 'r1', name: 'Circuit', emoji: 'dumbbell', ex: [], ...routine }]
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <MemoryRouter initialEntries={['/routine/r1']}>
      <Routes><Route path="/routine/:id" element={<RoutineEdit />} /></Routes>
    </MemoryRouter>
  ))
}
const rowTitled = title => [...container.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)
const edit = fn => act(() => { useStore.getState().update(s => fn(s.routines[0])) })

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  root = container = null
})

describe('automated workout: duration estimate', () => {
  it('is not shown until Automated workout is switched on, and goes away when it is switched off', () => {
    renderRoutine({ ex: [ex('0001', 3)] })
    expect(rowTitled('Estimated duration')).toBeUndefined()
    act(() => rowTitled('Automated workout').querySelector('[role="switch"]').click())
    expect(useStore.getState().S.routines[0].auto).toBe(true)
    expect(rowTitled('Estimated duration')).toBeTruthy()
    act(() => rowTitled('Automated workout').querySelector('[role="switch"]').click())
    expect(rowTitled('Estimated duration')).toBeUndefined()
  })

  it('estimates from the exercises, their sets and the two intervals (defaults 40 s work / 20 s rest)', () => {
    // 5 exercises x 4 sets = 20 sets: 20 x 40 s of work and 19 x 20 s of rest = 1180 s, about 20 minutes
    renderRoutine({ auto: true, ex: ['0001', '0002', '0003', '0004', '0005'].map(id => ex(id, 4)) })
    const row = rowTitled('Estimated duration')
    expect(row.querySelector('.lrow-v').textContent).toBe('~20 min')
    expect(row.querySelector('.lrow-s').textContent).toBe('20 sets · 13:20 work + 6:20 rest')
  })

  it('follows every edit live: the intervals, the sets and the exercises', () => {
    renderRoutine({ auto: true, ex: [ex('0001', 3)] })           // 3 x 40 + 2 x 20 = 160 s
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~3 min')
    edit(r => { r.autoWorkSec = 60; r.autoRestSec = 30 })        // 3 x 60 + 2 x 30 = 240 s
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~4 min')
    edit(r => { r.ex[0].sets = 10 })                             // 10 x 60 + 9 x 30 = 870 s
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~15 min')
    edit(r => { r.ex.push(ex('0002', 10)); r.autoRestSec = 0 })  // 20 x 60 = 1200 s, no rest at all
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~20 min')
  })

  it('counts a timed hold by its own seconds and shows hours for a long session', () => {
    renderRoutine({ auto: true, ex: [ex('0001', 20, { mode: 'time', sec: 120 })] })   // 20 x 120 + 19 x 20 = 2780 s
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~46 min')
    edit(r => { r.ex[0].sets = 40 })                                                   // 40 x 120 + 39 x 20 = 5580 s
    expect(rowTitled('Estimated duration').querySelector('.lrow-v').textContent).toBe('~1 h 33 min')
  })

  it('asks for exercises when there are none', () => {
    renderRoutine({ auto: true, ex: [] })
    const row = rowTitled('Estimated duration')
    expect(row.querySelector('.lrow-v')).toBeNull()
    expect(row.querySelector('.lrow-s').textContent).toBe('Add exercises to see how long it runs.')
  })
})
