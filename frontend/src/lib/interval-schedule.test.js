import { describe, expect, it } from 'vitest'
import {
  AWAY_POLICY, awayDecision, backBlock, endedWork, holdFrom, lengthsOf, pauseClock, positionAt, resumeClock, skipBlock, startClock,
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

describe('backBlock', () => {
  it('restarts the block when more than 3 s into it', () => {
    const b = backBlock(B, c, 70000)   // 10 s into block 2
    expect(positionAt(B, b, 70000)).toMatchObject({ idx: 2, leftMs: 40000 })
  })
  it('goes to the previous block within 3 s of the start', () => {
    const b = backBlock(B, c, 62000)
    expect(positionAt(B, b, 62000)).toMatchObject({ idx: 1, leftMs: 20000 })
    expect(positionAt(B, b, 82000)).toMatchObject({ idx: 2, leftMs: 40000 })
  })
  it('restarts block 0 from anywhere in it', () => {
    expect(positionAt(B, backBlock(B, c, 1000), 1000)).toMatchObject({ idx: 0, leftMs: 40000 })
    expect(positionAt(B, backBlock(B, c, 9000), 9000)).toMatchObject({ idx: 0, leftMs: 40000 })
  })
  it('clears the cuts of the blocks it re-enters, and keeps earlier ones', () => {
    const cut = skipBlock(B, skipBlock(B, c, 10000), 15000)   // block 0 cut at 10 s, block 1 at 5 s
    expect(cut.cuts).toEqual({ 0: 10000, 1: 5000 })
    expect(backBlock(B, cut, 20000).cuts).toEqual({ 0: 10000, 1: 5000 })   // 5 s into block 2: restart it
    const b = backBlock(B, cut, 16000)   // 1 s into block 2: back to block 1, in full
    expect(b.cuts).toEqual({ 0: 10000 })
    expect(positionAt(B, b, 16000)).toMatchObject({ idx: 1, leftMs: 20000 })
  })
  it('works while paused and stays paused', () => {
    const p = pauseClock(c, 70000)
    const b = backBlock(B, p, 90000)
    expect(b.pausedAt).toBe(70000)
    expect(positionAt(B, b, 90000)).toMatchObject({ idx: 2, leftMs: 40000 })
    expect(positionAt(B, resumeClock(b, 90000), 95000)).toMatchObject({ idx: 2, leftMs: 35000 })
  })
  it('does nothing once finished', () => {
    expect(backBlock(B, c, 200000)).toBe(c)
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

describe('a get-ready lead-in', () => {
  const R = [
    { kind: 'ready', sec: 20 },
    { kind: 'work', sec: 40, ei: 0, si: 0, id: 'a' },
    { kind: 'rest', sec: 20 },
    { kind: 'work', sec: 30, ei: 1, si: 0, id: 'b' },
  ]
  it('counts down like any block and moves on to work', () => {
    expect(positionAt(R, c, 10000)).toMatchObject({ idx: 0, leftMs: 10000 })
    expect(positionAt(R, c, 25000)).toMatchObject({ idx: 1, leftMs: 35000 })
  })
  it('logs no set for the lead-in', () => {
    expect(endedWork(R, c, 0, 60000)).toEqual([1])
    expect(endedWork(R, c, 0, 20000)).toEqual([])
  })
  it('can be skipped without logging anything', () => {
    const s = skipBlock(R, c, 5000)
    expect(s.cuts).toEqual({ 0: 5000 })
    expect(positionAt(R, s, 5000)).toMatchObject({ idx: 1, leftMs: 40000 })
    expect(endedWork(R, s, 0, 5000)).toEqual([])
  })
})
