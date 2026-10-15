import { describe, expect, it } from 'vitest'
import { buildIntervals, intervalSettings, isAutoRoutine, nextWork, remainingSec } from './interval-plan.js'

const reps = (id, n, extra = {}) => ({ id, target: { sets: n, reps: 10, ...extra }, sets: Array.from({ length: n }, () => ({ w: 0, r: 10, done: false })) })

describe('intervalSettings', () => {
  it('falls back to the defaults for nothing, junk or out-of-range values', () => {
    expect(intervalSettings(undefined)).toEqual({ workSec: 40, restSec: 20 })
    expect(intervalSettings({ autoWorkSec: 'x', autoRestSec: 9999 })).toEqual({ workSec: 40, restSec: 20 })
  })
  it('reads valid values, and lets rest be 0', () => {
    expect(intervalSettings({ autoWorkSec: 30, autoRestSec: 0 })).toEqual({ workSec: 30, restSec: 0 })
  })
  it('flags a routine only when auto is exactly true', () => {
    expect(isAutoRoutine({ auto: true })).toBe(true)
    expect(isAutoRoutine({ auto: 1 })).toBe(false)
    expect(isAutoRoutine(null)).toBe(false)
  })
})

describe('buildIntervals', () => {
  it('alternates work and rest and ends on work', () => {
    const b = buildIntervals([reps('squat', 2), reps('lunge', 1)], { workSec: 40, restSec: 20 })
    expect(b.map(x => x.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work'])
    expect(b.filter(x => x.kind === 'work').map(x => [x.ei, x.si])).toEqual([[0, 0], [0, 1], [1, 0]])
  })
  it('uses the exercise’s own rest after its sets, the routine’s otherwise', () => {
    const b = buildIntervals([reps('squat', 1, { restSec: 90 }), reps('lunge', 1)], { workSec: 40, restSec: 20 })
    expect(b[1]).toEqual({ kind: 'rest', sec: 90 })
  })
  it('lasts a timed hold its own seconds and cardio its minutes', () => {
    const plank = { id: 'plank', target: { mode: 'time', sec: 60, sets: 1 }, sets: [{ done: false }] }
    const run = { id: 'run', target: { mode: 'cardio', min: 2, sets: 1 }, sets: [{ done: false }] }
    const b = buildIntervals([plank, run])
    expect(b.filter(x => x.kind === 'work').map(x => x.sec)).toEqual([60, 120])
  })
  it('skips sets already done and leaves no rest dangling', () => {
    const e = reps('squat', 2); e.sets[0].done = true
    expect(buildIntervals([e]).map(x => x.kind)).toEqual(['work'])
  })
  it('adds no rest blocks when rest is 0', () => {
    expect(buildIntervals([reps('squat', 3)], { restSec: 0 }).map(x => x.kind)).toEqual(['work', 'work', 'work'])
  })
  it('is empty for nothing to do', () => {
    expect(buildIntervals([])).toEqual([])
    expect(buildIntervals(undefined)).toEqual([])
  })
})

describe('nextWork / remainingSec', () => {
  const b = buildIntervals([reps('squat', 1), reps('lunge', 1)], { workSec: 40, restSec: 20 })
  it('finds the work after a rest, and null after the last', () => {
    expect(nextWork(b, 1).id).toBe('lunge')
    expect(nextWork(b, 2)).toBeNull()
  })
  it('adds what is left of this block to every block after it', () => {
    expect(remainingSec(b, 0, 10)).toBe(10 + 20 + 40)
  })
})
