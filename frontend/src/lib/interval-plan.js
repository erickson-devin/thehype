// Follow-along mode ("automated workout"): a routine's session entries flattened into the
// timeline the interval player counts down — [Work, Rest, Work, Rest, … Work]. Pure, so the
// order, the durations and the "what is next" lookups are unit-tested (interval-plan.test.js).
import { modeOf } from './history.js'
import { isWarmupRow } from './workout-model.js'

export const DEFAULT_WORK_SEC = 40
export const DEFAULT_REST_SEC = 20
export const WORK_SEC_RANGE = [5, 600]
export const REST_SEC_RANGE = [0, 300]
export const DEFAULT_READY_SEC = 20
export const READY_SEC_RANGE = [0, 60]

const pick = (v, [lo, hi], fallback) => {
  if (v == null || v === '' || typeof v === 'boolean') return fallback   // Number(null), Number('') and Number(true) are 0 and 1, not 'unset'
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
    readySec: pick(r?.autoReadySec, READY_SEC_RANGE, DEFAULT_READY_SEC),
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
 *   { kind: 'ready', sec }              — optional first block: the "Get ready" lead-in, never logged
 * Warm-up rows and sets already ticked are left out, so a session that is resumed picks up where
 * it stopped. An exercise's own rest (target.restSec) wins over the routine's.
 */
export function buildIntervals(entries, { workSec = DEFAULT_WORK_SEC, restSec = DEFAULT_REST_SEC, readySec = 0 } = {}) {
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
  // A lead-in before the first set ("Get ready… first up: X"), never logged. Only for a session that
  // has not started: a resumed one (a working set already ticked) goes straight back to work.
  const started = (entries || []).some(e => (e.sets || []).some(s => s.done && !isWarmupRow(s)))
  if (readySec > 0 && !started && out.some(b => b.kind === 'work')) out.unshift({ kind: 'ready', sec: Math.round(readySec) })
  return out
}

/** The next work block after index `i` (what the player announces and shows as "Up next"). */
export const nextWork = (blocks, i) => blocks.slice(i + 1).find(b => b.kind === 'work') || null

/** Seconds of the whole plan from block `i` on, for a "time left" line. */
export const remainingSec = (blocks, i, left) =>
  Math.max(0, left) + blocks.slice(i + 1).reduce((n, b) => n + b.sec, 0)

// A routine's rep and set counts are the plan's, and a progression rule can move them when the
// session starts, so what the editor shows is an estimate. It is built on buildIntervals itself, so
// it counts exactly the way the player does (own seconds for holds and cardio, an exercise's own
// rest, no rest after the last set). The cap keeps a typo'd 9999 sets from freezing the editor.
const SETS_CAP = 100

/**
 * What the routine would run as an automated workout: { sec, sets, exercises, workSec, restSec, readySec },
 * the time in whole seconds (lead-in included), summed over the same blocks the player counts down.
 */
export function estimateRoutine(routine, settings = intervalSettings(routine)) {
  const ex = (routine?.ex || []).filter(Boolean)
  const entries = ex.map(cfg => ({
    id: cfg.id, target: cfg,
    sets: Array.from({ length: Math.min(SETS_CAP, Math.max(1, Math.round(Number(cfg.sets)) || 1)) }, () => ({ done: false })),
  }))
  const blocks = buildIntervals(entries, settings)
  const work = blocks.filter(b => b.kind === 'work')
  return {
    sec: blocks.reduce((n, b) => n + b.sec, 0),
    sets: work.length,
    exercises: ex.length,
    workSec: work.reduce((n, b) => n + b.sec, 0),
    restSec: blocks.reduce((n, b) => n + (b.kind === 'rest' ? b.sec : 0), 0),
    readySec: blocks.reduce((n, b) => n + (b.kind === 'ready' ? b.sec : 0), 0),
  }
}

/** The estimate as a short word-free value: { h, m } rounded to the minute (at least 1), or null for nothing. */
export function approxTime(sec) {
  if (!(sec > 0)) return null
  const total = Math.max(1, Math.round(sec / 60))
  return { h: Math.floor(total / 60), m: total % 60, total }
}
