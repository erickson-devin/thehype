import { describe, expect, it } from 'vitest'
import {
  AWAY_POLICY, awayDecision, endedWork, holdFrom, lengthsOf, pauseClock, positionAt, resumeClock, skipBlock, startClock,
} from './interval-schedule.js'

const B = [
  { kind: 'work', sec: 40, ei: 0, si: 0, id: 'a' },
  { kind: 'rest', sec: 20 },
  { kind: 'work', sec: 40, ei: 0, si: 1, id: 'a' },
  { kind: 'rest', sec: 20 },
  { kind: 'work', sec: 30, ei: 1, si: 0, id: 'b' },
]
const c = startClock(0)

describe('positionAt', () => {
  it('lengths', () => expect(lengthsOf(B, c)).toEqual([40000, 20000, 40000, 20000, 30000]))
  it('finds the block and time left', () => {
    expect(positionAt(B, c, 0)).toMatchObject({ idx: 0, leftMs: 40000, done: false })
    expect(positionAt(B, c, 39999)).toMatchObject({ idx: 0, leftMs: 1 })
    expect(positionAt(B, c, 40000)).toMatchObject({ idx: 1, leftMs: 20000 })
    expect(positionAt(B, c, 100000)).toMatchObject({ idx: 3, leftMs: 20000 })
  })
  it('is done at and past the end', () => {
    expect(positionAt(B, c, 150000)).toMatchObject({ idx: 5, leftMs: 0, done: true })
    expect(positionAt(B, c, 999999).done).toBe(true)
    expect(positionAt([], c, 0).done).toBe(true)
  })
})

describe('pause and resume', () => {
  const p = pauseClock(c, 10000)
  it('holds time while paused', () => expect(positionAt(B, p, 70000)).toMatchObject({ idx: 0, leftMs: 30000 }))
  it('pausing twice changes nothing', () => expect(pauseClock(p, 20000)).toEqual(p))
  it('resume banks the paused span', () => {
    const r = resumeClock(p, 70000)
    expect(r.pausedMs).toBe(60000)
    expect(positionAt(B, r, 80000)).toMatchObject({ idx: 0, leftMs: 20000 })
  })
  it('resuming a running clock is a no-op', () => expect(resumeClock(c, 5)).toEqual(c))
})

describe('skipBlock', () => {
  const s = skipBlock(B, c, 15000)
  it('cuts the current block', () => {
    expect(s.cuts).toEqual({ 0: 15000 })
    expect(positionAt(B, s, 15000)).toMatchObject({ idx: 1, leftMs: 20000 })
    expect(positionAt(B, s, 35000)).toMatchObject({ idx: 2, leftMs: 40000 })
  })
  it('uses the paused time when paused', () => {
    expect(skipBlock(B, pauseClock(c, 10000), 50000).cuts).toEqual({ 0: 10000 })
  })
  it('skipping the last block finishes', () => {
    expect(positionAt(B, skipBlock(B, c, 125000), 125000).done).toBe(true)
  })
})

describe('endedWork', () => {
  it('lists work blocks that ended in the span', () => {
    expect(endedWork(B, c, 0, 100000)).toEqual([0, 2])
    expect(endedWork(B, c, 40000, 100000)).toEqual([2])
    expect(endedWork(B, c, 0, 39999)).toEqual([])
    expect(endedWork(B, c, 0, 150000)).toEqual([0, 2, 4])
  })
  it('does not count a skipped block', () => {
    expect(endedWork(B, skipBlock(B, c, 15000), 15000, 60000)).toEqual([])
  })
})

describe('awayDecision', () => {
  it('is none for a short gap or the same block', () => {
    expect(awayDecision(B, c, 41000, 41500).kind).toBe('none')
    expect(awayDecision(B, c, 2000, 30000).kind).toBe('none')
  })
  it('follows the policy', () => {
    expect(awayDecision(B, c, 10000, 112000, 'ask')).toEqual({ kind: 'ask', awayMs: 102000, fromIdx: 0, toIdx: 3, sets: 2, finishes: false })
    expect(awayDecision(B, c, 10000, 112000, 'tick').kind).toBe('tick')
    expect(awayDecision(B, c, 10000, 112000, 'short').kind).toBe('ask')
    expect(awayDecision(B, c, 35000, 45000, 'short').kind).toBe('tick')
  })
  it('finishes when the end passed', () => {
    const d = awayDecision(B, c, 10000, 200000)
    expect(d).toMatchObject({ toIdx: 5, finishes: true, sets: 3 })
  })
  it('is none while paused', () => expect(awayDecision(B, pauseClock(c, 5000), 10000, 112000).kind).toBe('none'))
  it('defaults to tick', () => {
    expect(AWAY_POLICY).toBe('tick')
    expect(awayDecision(B, c, 10000, 112000).kind).toBe('tick')
  })
})

describe('holdFrom', () => {
  it('pauses retroactively', () => {
    const r = resumeClock(holdFrom(c, 10000), 112000)
    expect(positionAt(B, r, 112000)).toMatchObject({ idx: 0, leftMs: 30000 })
  })
})
