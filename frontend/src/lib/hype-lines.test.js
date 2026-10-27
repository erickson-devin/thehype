import { describe, expect, it } from 'vitest'
import {
  HYPE_EVENTS, HYPE_LINES, drawHype, finishHype, hypeEventsFor, hypeMarks, initHype, nextSeed, restStartHype,
} from './hype-lines.js'

const W = (sec, ei, id = 'x') => ({ kind: 'work', sec, ei, si: 0, id })
const R = sec => ({ kind: 'rest', sec })

describe('the catalogue', () => {
  it('has at least five lines per event, no emoji, spoken ones short, placeholders where needed', () => {
    for (const ev of HYPE_EVENTS) {
      expect(HYPE_LINES[ev].length, ev).toBeGreaterThanOrEqual(5)
      for (const line of HYPE_LINES[ev]) {
        expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
        if (['halfway', 'lastRound', 'finalTen'].includes(ev)) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(8)
        if (['lastRound', 'pr', 'e1pr', 'prs'].includes(ev)) expect(line, line).toContain('{0}')
      }
    }
  })
})

describe('drawHype', () => {
  const run = (seed, n) => {
    let s = initHype(seed); const out = []
    for (let i = 0; i < n; i++) { const r = drawHype(s, 'halfway'); s = r.state; out.push(r.text) }
    return out
  }
  it('is deterministic for a seed and differs across seeds', () => {
    expect(run(1, 10)).toEqual(run(1, 10))
    expect(run(1, 10)).not.toEqual(run(2, 10))
  })
  it('never repeats an event back to back and reaches every line', () => {
    for (const ev of HYPE_EVENTS) {
      let s = initHype(3); const idx = []
      for (let i = 0; i < 50; i++) { const r = drawHype(s, ev, 'X'); s = r.state; idx.push(r.index) }
      for (let i = 1; i < idx.length; i++) expect(idx[i]).not.toBe(idx[i - 1])
      expect(new Set(idx).size).toBe(HYPE_LINES[ev].length)
    }
  })
  it('keeps no-repeat per event when events interleave', () => {
    let s = initHype(9); const last = {}
    for (let i = 0; i < 50; i++) {
      for (const ev of ['halfway', 'restStart']) {
        const r = drawHype(s, ev); s = r.state
        expect(r.index).not.toBe(last[ev])
        last[ev] = r.index
      }
    }
  })
  it('fills placeholders', () => {
    const a = drawHype(initHype(7), 'lastRound', 'Back Squat').text
    expect(a).toContain('Back Squat')
    expect(a).not.toContain('{')
    expect(drawHype(initHype(7), 'prs', 3).text).toContain('3')
  })
  it('answers an unknown event with nothing and leaves the state', () => {
    const s = initHype(5)
    const r = drawHype(s, 'nope')
    expect(r).toMatchObject({ text: '', index: -1 })
    expect(r.state).toBe(s)
  })
  it('works from a null state', () => {
    expect(drawHype(null, 'done').text).toBeTruthy()
  })
})

describe('nextSeed', () => {
  it('stays a 32-bit unsigned value and moves off zero', () => {
    let s = 0
    for (let i = 0; i < 1000; i++) { s = nextSeed(s); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(2 ** 32) }
    expect(nextSeed(0)).not.toBe(0)
  })
})

describe('hypeMarks', () => {
  it('needs three work blocks', () => {
    expect(hypeMarks([W(10, 0), R(5), W(10, 0)])).toEqual({ halfway: -1, lastRound: -1 })
  })
  it('puts halfway and the last round in a one-exercise plan', () => {
    const b = [W(10, 0), R(5), W(10, 0), R(5), W(10, 0), R(5), W(10, 0)]
    expect(hypeMarks(b)).toEqual({ halfway: 4, lastRound: 6 })
  })
  it('puts the last round at the final exercise', () => {
    expect(hypeMarks([W(10, 0), R(5), W(10, 1), R(5), W(10, 2)])).toEqual({ halfway: -1, lastRound: 4 })
  })
})

describe('the get-ready lead-in', () => {
  const P = [W(30, 0, 'a'), R(10), W(30, 1, 'b'), R(10), W(30, 2, 'c'), R(10), W(30, 3, 'd')]
  const RP = [{ kind: 'ready', sec: 20 }, ...P]
  it('fires no hype during it', () => {
    for (const left of [20, 10, 5]) expect(hypeEventsFor(RP, 0, left)).toEqual([])
  })
  it('shifts the marks by one block', () => {
    expect(hypeMarks(RP)).toEqual({ halfway: 5, lastRound: 7 })
  })
  it('never puts halfway on the first work block, whatever precedes it', () => {
    // with `i > 0`, idx 1 (elapsed 100 s of 140) would wrongly qualify
    expect(hypeMarks([{ kind: 'ready', sec: 100 }, W(10, 0), R(5), W(10, 0), R(5), W(10, 0)])).toEqual({ halfway: 3, lastRound: 5 })
  })
})

describe('hypeEventsFor', () => {
  const P = [W(30, 0, 'a'), R(10), W(30, 1, 'b'), R(10), W(30, 2, 'c'), R(10), W(30, 3, 'd')]
  const pick = ev => ({ event: ev.event, key: ev.key, ...(ev.id ? { id: ev.id } : {}) })
  const walk = fired => {
    const out = []
    P.forEach((b, idx) => {
      for (const left of [b.sec, 10, 3]) {
        const due = hypeEventsFor(P, idx, left, fired)
        due.forEach(e => fired.add(e.key))
        out.push(...due.map(pick))
      }
    })
    return out
  }
  it('fires each cue once, in order', () => {
    expect(hypeMarks(P)).toEqual({ halfway: 4, lastRound: 6 })
    const fired = new Set()
    expect(walk(fired)).toEqual([
      { event: 'finalTen', key: 'finalTen:0' },
      { event: 'finalTen', key: 'finalTen:2' },
      { event: 'halfway', key: 'halfway' },
      { event: 'finalTen', key: 'finalTen:4' },
      { event: 'lastRound', key: 'lastRound', id: 'd' },
      { event: 'finalTen', key: 'finalTen:6' },
    ])
    expect(walk(fired)).toEqual([])
  })
  it('skips ten seconds in a short block and out-of-range blocks', () => {
    expect(hypeEventsFor([W(20, 0)], 0, 10)).toEqual([])
    expect(hypeEventsFor(P, 99, 10)).toEqual([])
  })
})

describe('restStartHype', () => {
  it('is for real rests only', () => {
    expect(restStartHype(90, { forSet: 1 })).toBe(true)
    expect(restStartHype(0)).toBe(false)
    expect(restStartHype(10, { kind: 'switch' })).toBe(false)
  })
})

describe('finishHype', () => {
  it('picks the line by the biggest record', () => {
    expect(finishHype(['a', 'b'], [])).toEqual({ event: 'prs', n: 2 })
    expect(finishHype(['a'], [{ id: 'b' }])).toEqual({ event: 'pr', id: 'a' })
    expect(finishHype([], [{ id: 'b' }])).toEqual({ event: 'e1pr', id: 'b' })
    expect(finishHype([], [], 3)).toEqual({ event: 'done' })
    expect(finishHype([], [], 0)).toBeNull()
  })
})
