import { describe, expect, it } from 'vitest'
import { tvRoutines } from './tv-routines.js'

const ex = [{ id: '0025', sets: 3, reps: 10 }]
const mk = (over = {}) => ({
  routines: [
    { id: 'a', name: 'A', auto: true, ex },
    { id: 'm', name: 'Manual', ex },
    { id: 'e', name: 'Empty', auto: true, ex: [] },
    { id: 'b', name: 'B', auto: true, ex },
    { id: 'c', name: 'C', auto: true, ex },
  ],
  dayPlan: {}, week: {}, queue: { ids: [] }, workouts: [],
  ...over,
})

describe('tvRoutines', () => {
  it('lists follow-along routines with exercises only, in plan order, with an estimate', () => {
    const rows = tvRoutines(mk(), '2026-03-04')
    expect(rows.map(x => x.r.id)).toEqual(['a', 'b', 'c'])
    expect(rows.every(x => x.est && x.est.total >= 1)).toBe(true)
    expect(rows.every(x => x.today === false)).toBe(true)
  })
  it("puts today's routine first", () => {
    const rows = tvRoutines(mk({ dayPlan: { '2026-03-04': 'c' } }), '2026-03-04')
    expect(rows.map(x => x.r.id)).toEqual(['c', 'a', 'b'])
    expect(rows[0].today).toBe(true)
  })
  it('an empty state has nothing', () => {
    expect(tvRoutines({}, '2026-03-04')).toEqual([])
  })
})
