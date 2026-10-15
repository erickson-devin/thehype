// Follow-along mode ("automated workout"): a routine's session entries flattened into the
// timeline the interval player counts down — [Work, Rest, Work, Rest, … Work]. Pure, so the
// order, the durations and the "what is next" lookups are unit-tested (interval-plan.test.js).
import { modeOf } from './history.js'
import { isWarmupRow } from './workout-model.js'

export const DEFAULT_WORK_SEC = 40
export const DEFAULT_REST_SEC = 20
export const WORK_SEC_RANGE = [5, 600]
export const REST_SEC_RANGE = [0, 300]

const pick = (v, [lo, hi], fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback
}

/** Whether a routine runs as a follow-along workout (`routine.auto`, written only when true). */
export const isAutoRoutine = r => r?.auto === true

/** The routine's interval lengths, with the defaults wherever nothing valid is stored. */
export function intervalSettings(r) {
  return {
    workSec: pick(r?.autoWorkSec, WORK_SEC_RANGE, DEFAULT_WORK_SEC),
    restSec: pick(r?.autoRestSec, REST_SEC_RANGE, DEFAULT_REST_SEC),
  }
}

/**
 * How long one set is worked: a timed hold lasts its own seconds, cardio its minutes, and a rep
 * set (which has no clock of its own) the routine's work interval.
 */
function workSecFor(entry, workSec) {
  const t = entry.target || {}
  const mode = modeOf({ id: entry.id, ...t })
  if (mode === 'time' && t.sec > 0) return Math.round(t.sec)
  if (mode === 'cardio' && t.min > 0) return Math.round(t.min * 60)
  return workSec
}

/**
 * The session's pending sets as blocks, in the order the workout lists them:
 *   { kind: 'work', sec, ei, si, id }   — entry index, set index, exercise id
 *   { kind: 'rest', sec }               — between two work blocks, never after the last
 * Warm-up rows and sets already ticked are left out, so a session that is resumed picks up where
 * it stopped. An exercise's own rest (target.restSec) wins over the routine's.
 */
export function buildIntervals(entries, { workSec = DEFAULT_WORK_SEC, restSec = DEFAULT_REST_SEC } = {}) {
  const out = []
  let prev = null // the entry whose set was added last: its rest is the one that follows it
  ;(entries || []).forEach((entry, ei) => {
    const sec = workSecFor(entry, workSec)
    ;(entry.sets || []).forEach((set, si) => {
      if (set.done || isWarmupRow(set)) return
      if (prev) {
        const rest = prev.target?.restSec > 0 ? Math.round(prev.target.restSec) : restSec
        if (rest > 0) out.push({ kind: 'rest', sec: rest })
      }
      out.push({ kind: 'work', sec, ei, si, id: entry.id })
      prev = entry
    })
  })
  return out
}

/** The next work block after index `i` (what the player announces and shows as "Up next"). */
export const nextWork = (blocks, i) => blocks.slice(i + 1).find(b => b.kind === 'work') || null

/** Seconds of the whole plan from block `i` on, for a "time left" line. */
export const remainingSec = (blocks, i, left) =>
  Math.max(0, left) + blocks.slice(i + 1).reduce((n, b) => n + b.sec, 0)
