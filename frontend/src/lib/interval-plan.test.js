import { describe, expect, it } from 'vitest'
import { approxTime, buildIntervals, estimateRoutine, intervalSettings, isAutoRoutine, nextWork, remainingSec } from './interval-plan.js'

const reps = (id, n, extra = {}) => ({ id, target: { sets: n, reps: 10, ...extra }, sets: Array.from({ length: n }, () => ({ w: 0, r: 10, done: false })) })

describe('intervalSettings', () => {
  it('falls back to the defaults for nothing, junk or out-of-range values', () => {
    expect(intervalSettings(undefined)).toEqual({ workSec: 40, restSec: 20, readySec: 20 })
    expect(intervalSettings({ autoWorkSec: 'x', autoRestSec: 9999 })).toEqual({ workSec: 40, restSec: 20, readySec: 20 })
  })
  it('reads valid values, and lets rest be 0', () => {
    expect(intervalSettings({ autoWorkSec: 30, autoRestSec: 0 })).toEqual({ workSec: 30, restSec: 0, readySec: 20 })
  })
  it('reads the get-ready lead-in: 0 is off, junk and out-of-range fall back to 20', () => {
    expect(intervalSettings({ autoReadySec: 0 }).readySec).toBe(0)
    expect(intervalSettings({ autoReadySec: 61 }).readySec).toBe(20)
    expect(intervalSettings({ autoReadySec: true }).readySec).toBe(20)
    expect(intervalSettings({ autoReadySec: '15' }).readySec).toBe(15)
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

describe('buildIntervals: the get-ready lead-in', () => {
  const opts = { workSec: 40, restSec: 20 }
  it('puts a ready block first and leaves the rest of the plan as it was', () => {
    const b = buildIntervals([reps('squat', 2), reps('lunge', 1)], { ...opts, readySec: 20 })
    expect(b[0]).toEqual({ kind: 'ready', sec: 20 })
    expect(b.slice(1)).toEqual(buildIntervals([reps('squat', 2), reps('lunge', 1)], opts))
  })
  it('adds none for 0, a bare call, nothing to do, or all sets done', () => {
    expect(buildIntervals([reps('squat', 2), reps('lunge', 1)], { ...opts, readySec: 0 }).map(x => x.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work'])
    expect(buildIntervals([reps('squat', 1)]).map(x => x.kind)).toEqual(['work'])
    expect(buildIntervals([], { readySec: 20 })).toEqual([])
    const e = reps('squat', 2); e.sets.forEach(s => { s.done = true })
    expect(buildIntervals([e], { readySec: 20 })).toEqual([])
  })
  it('adds none to a resumed session, but a done warm-up row does not count as started', () => {
    const e = reps('squat', 2); e.sets[0].done = true
    expect(buildIntervals([e], { readySec: 20 }).map(x => x.kind)).toEqual(['work'])
    const w = reps('squat', 2); w.sets[0].done = true; w.sets[0].warmup = true
    expect(buildIntervals([w], { readySec: 20 })[0].kind).toBe('ready')
  })
  it('is counted by nextWork and remainingSec', () => {
    const b = buildIntervals([reps('squat', 2), reps('lunge', 1)], { ...opts, readySec: 20 })
    expect(nextWork(b, 0).id).toBe('squat')
    expect(remainingSec(b, 0, 20)).toBe(20 + 40 + 20 + 40 + 20 + 40)
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

describe('estimateRoutine', () => {
  const cfg = (id, sets, extra = {}) => ({ id, sets, reps: 10, ...extra })
  const settings = { workSec: 40, restSec: 20 }

  it('counts work and rest the way the player does: no rest after the last set', () => {
    // 4 sets in all: 4 x 40 s of work and 3 x 20 s of rest
    const e = estimateRoutine({ ex: [cfg('a', 3), cfg('b', 1)] }, settings)
    expect(e).toMatchObject({ sets: 4, exercises: 2, workSec: 160, restSec: 60, sec: 220 })
  })
  it('matches the 40 s / 20 s rule of thumb: about as many minutes as sets', () => {
    const e = estimateRoutine({ ex: [cfg('a', 5), cfg('b', 5), cfg('c', 5), cfg('d', 5)] }, settings)
    expect(e.sets).toBe(20)
    expect(e.sec).toBe(20 * 40 + 19 * 20)
    expect(approxTime(e.sec)).toEqual({ h: 0, m: 20, total: 20 })
  })
  it('uses a hold’s own seconds, cardio’s own minutes and an exercise’s own rest', () => {
    const e = estimateRoutine({ ex: [
      cfg('plank', 2, { mode: 'time', sec: 60 }),
      cfg('run', 1, { mode: 'cardio', min: 3 }),
      cfg('squat', 2, { restSec: 90 }),
    ] }, settings)
    // work: 2x60 + 180 + 2x40 = 380; rest: plank->plank 20, plank->run 20, run->squat 20, squat->squat 90
    expect(e.workSec).toBe(380)
    expect(e.restSec).toBe(20 + 20 + 20 + 90)
  })
  it('reads the routine’s own interval settings by default', () => {
    expect(estimateRoutine({ autoWorkSec: 30, autoRestSec: 10, ex: [cfg('a', 2)] }).sec).toBe(20 + 30 + 10 + 30)
  })
  it('treats a missing or odd set count as one set, and caps an absurd one', () => {
    expect(estimateRoutine({ ex: [{ id: 'a' }] }, settings).sets).toBe(1)
    expect(estimateRoutine({ ex: [{ id: 'a', sets: 'x' }] }, settings).sets).toBe(1)
    expect(estimateRoutine({ ex: [cfg('a', 99999)] }, settings).sets).toBe(100)
  })
  it('counts the get-ready lead-in', () => {
    expect(estimateRoutine({ ex: [cfg('a', 3), cfg('b', 1)] }, { ...settings, readySec: 20 })).toMatchObject({ sec: 240, readySec: 20, workSec: 160, restSec: 60 })
    expect(estimateRoutine({ ex: [] }, { ...settings, readySec: 20 }).sec).toBe(0)
  })
  it('is zero for an empty routine', () => {
    expect(estimateRoutine({ ex: [] }, settings)).toMatchObject({ sec: 0, sets: 0, exercises: 0 })
    expect(estimateRoutine(null).sec).toBe(0)
  })
})

describe('approxTime', () => {
  it('rounds to the minute, at least one, and splits hours', () => {
    expect(approxTime(0)).toBeNull()
    expect(approxTime(20)).toEqual({ h: 0, m: 1, total: 1 })
    expect(approxTime(1180)).toEqual({ h: 0, m: 20, total: 20 })
    expect(approxTime(3900)).toEqual({ h: 1, m: 5, total: 65 })
  })
})

describe('intervalSettings: unset values fall back to the defaults', () => {
  it('treats null, an empty string and a boolean as unset', () => {
    expect(intervalSettings({ autoRestSec: null })).toEqual({ workSec: 40, restSec: 20, readySec: 20 })
    expect(intervalSettings({ autoRestSec: '' }).restSec).toBe(20)
    expect(intervalSettings({ autoWorkSec: true }).workSec).toBe(40)
  })
  it('still reads a numeric string and a real zero rest', () => {
    expect(intervalSettings({ autoRestSec: '15' }).restSec).toBe(15)
    expect(intervalSettings({ autoRestSec: 0 }).restSec).toBe(0)
  })
})
