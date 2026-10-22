// @vitest-environment happy-dom
// The finish summary's hype line (lib/hype-lines.js).
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { finishWorkout } from './sheets.jsx'
import { HYPE_LINES } from './lib/hype-lines.js'
import { exerciseNameFor } from './lib/i18n.js'
import { EXDB } from './lib/exercises-data.js'

const clone = v => JSON.parse(JSON.stringify(v))
const S = () => useStore.getState().S
const mounted = []

function topSheetHost() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

function install(sets, history) {
  const st = clone(DEF)
  st.active = {
    id: 'fin', d: '2026-09-28', start: Date.now() - 20 * 60000, routineId: null, name: 'Core', bw: null, cur: 0,
    entries: [{ id: EXDB[0].id, target: { mode: 'reps', sets: sets.length, reps: 5, weight: 40 }, sets }]
  }
  if (history) st.workouts = history
  useStore.setState({ S: st, user: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useUI.setState({ sheets: [], timer: null, work: null })
})
afterEach(() => {
  mounted.splice(0).forEach(r => act(() => r.unmount()))
  document.body.innerHTML = ''
  useUI.getState().stopWork()
  vi.useRealTimers()
})

describe('the finish summary hype line', () => {
  it('celebrates a first PR by name', () => {
    install([{ w: 40, r: 5, done: true }])
    act(() => finishWorkout())
    const text = topSheetHost().querySelector('.hype-line')?.textContent
    const name = exerciseNameFor(EXDB[0])
    expect(HYPE_LINES.pr.map(l => l.replace('{0}', name))).toContain(text)
  })

  it('falls back to a plain well done when nothing was beaten', () => {
    const start = Date.now() - 7 * 86400000
    const prior = { id: 'prior', d: '2026-09-20', start, end: start + 3600000, name: 'Old', vol: 500, prs: [], entries: [{ id: EXDB[0].id, sets: [{ w: 100, r: 5, done: true }] }] }
    install([{ w: 40, r: 5, done: true }], [prior])
    act(() => finishWorkout())
    expect(HYPE_LINES.done).toContain(topSheetHost().querySelector('.hype-line')?.textContent)
  })
})
