// Hype lines: the always-on layer of the Hype persona. A follow-along trainer's short cues
// (halfway, final round, ten seconds left), a word at rest start, and the line on the finish
// summary. No AI provider, nothing leaves the phone. Pure and deterministic for a given seed
// (hype-lines.test.js): which event is due, and which line answers it, never the same line twice
// in a row for one event. Speaking and showing them is the caller's (IntervalPlayer, Workout,
// sheets.jsx doFinishWorkout); so is mute: a muted player still marks an event as fired, so
// unmuting never replays a stale "halfway".
//
// Keys are the English source strings (the nudge.js convention). They go through t() at draw
// time, so a pack that translates them is picked up, and a missing key reads English.
// Spoken lines (halfway, lastRound, finalTen) are kept to 8 words or fewer, no emoji.
import { t } from './i18n-core.js'

export const HYPE_LINES = {
  // Appended to the "Go!" that opens the block.
  halfway: [
    'Halfway there. You’re flying.',
    'Halfway done. Keep that pace.',
    'Half the work is behind you.',
    'Halfway. Strong and steady.',
    'That’s halfway. Keep stacking reps.',
    'Halfway mark. You’ve got this.',
  ],
  // {0}: the exercise. Appended to "Go!".
  lastRound: [
    'Final round: {0}. Finish strong!',
    'Home stretch: {0}. Everything you’ve got.',
    '{0} to close it out. Let’s go!',
    'Last round: {0}. Empty the tank.',
    'This is it: {0}. Bring it home.',
    'Final push: {0}. Make it count.',
  ],
  // Spoken alone, ten seconds before a long work block ends (the 3-2-1 beeps come after).
  finalTen: [
    'Ten seconds. Push!',
    'Ten more. Stay with it.',
    'Final ten. Strong finish.',
    'Ten seconds left. Hold your form.',
    'Almost there. Ten seconds.',
    'Last ten. You’ve got this.',
  ],
  // Toast as an ordinary workout's rest timer starts.
  restStart: [
    'Good set. Breathe and reset.',
    'Nice work. Recover, then go again.',
    'Set done. Shake it out.',
    'Solid. Slow breaths, stay locked in.',
    'That’s one more in the bank.',
    'Strong set. Rest up for the next.',
  ],
  // Finish summary. {0}: the exercise.
  pr: [
    'New PR on {0}! That’s all you.',
    '{0} PR! The work is paying off.',
    'Record broken on {0}. Huge.',
    'You just set a new best on {0}!',
    '{0}: new personal record. Earned it.',
  ],
  // Finish summary. {0}: how many load PRs (2 or more).
  prs: [
    '{0} PRs today. What a session!',
    '{0} new records. You’re on fire.',
    '{0} PRs in one workout. Unreal.',
    'You set {0} new bests today!',
    '{0} records broken. That’s progress.',
  ],
  // Finish summary: a better estimated 1RM, no load PR. {0}: the exercise.
  e1pr: [
    '{0} is trending up. Strength is building.',
    'Your {0} strength just hit a new high.',
    'New strength high on {0}. Keep climbing.',
    '{0}: strongest you’ve been. Nice.',
    'Your {0} is getting stronger. Keep it up.',
  ],
  // Finish summary, no record.
  done: [
    'That’s a wrap. Proud of you.',
    'Done and dusted. Great work.',
    'Session in the bank. Well earned.',
    'You showed up and delivered.',
    'Another one done. Keep stacking.',
    'Great session. Recover well.',
  ],
}
export const HYPE_EVENTS = Object.keys(HYPE_LINES)

export const FINAL_TEN_SEC = 10        // "ten seconds left"
export const FINAL_TEN_MIN_BLOCK = 30  // only in a work block at least this long
export const MIN_WORK_BLOCKS = 3       // halfway / final round only in a plan this big

// 32-bit LCG. The high bits drive the pick (an LCG's low bits cycle).
export const nextSeed = s => (Math.imul(s >>> 0, 1664525) + 1013904223) >>> 0

/** A fresh rotation: `{ seed, last }`, `last` the index each event used last. */
export const initHype = (seed = 0) => ({ seed: seed >>> 0, last: {} })

/**
 * The next line for `event`: { text, index, state }. `state` is what to keep for the next draw.
 * Never the index `event` used last time (once it has more than one line). Unknown event: ''.
 */
export function drawHype(state, event, ...args) {
  const lines = HYPE_LINES[event]
  const cur = state || initHype()
  if (!lines) return { text: '', index: -1, state: cur }
  const seed = nextSeed(cur.seed)
  const r = seed >>> 16
  const n = lines.length
  const prev = cur.last?.[event]
  const index = prev == null || n < 2 ? r % n : (prev + 1 + (r % (n - 1))) % n
  return { text: t(lines[index], ...args), index, state: { seed, last: { ...(cur.last || {}), [event]: index } } }
}

/**
 * Where the player's block-start cues fall, as block indices (-1: none):
 *   lastRound — the first work block of the final exercise (the trailing run of work blocks with
 *               the last one's entry index `ei`); when that run is the whole plan (one exercise),
 *               the last work block instead.
 *   halfway   — the first work block after the first whose start is at or past half the plan's
 *               seconds (work + rest); dropped when it is not before lastRound.
 * Both need MIN_WORK_BLOCKS work blocks. Neither is ever block 0 ("First up" owns that one).
 */
export function hypeMarks(blocks) {
  const list = blocks || []
  const work = []
  list.forEach((b, i) => { if (b.kind === 'work') work.push(i) })
  if (work.length < MIN_WORK_BLOCKS) return { halfway: -1, lastRound: -1 }
  const lastEi = list[work[work.length - 1]].ei
  let k = work.length - 1
  while (k > 0 && list[work[k - 1]].ei === lastEi) k--
  const lastRound = k === 0 ? work[work.length - 1] : work[k]
  const total = list.reduce((n, b) => n + b.sec, 0)
  let elapsed = 0, halfway = -1
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && list[i].kind === 'work' && elapsed * 2 >= total) { halfway = i; break }
    elapsed += list[i].sec
  }
  return { halfway: halfway >= 0 && halfway < lastRound ? halfway : -1, lastRound }
}

/**
 * The events due in the player now: block `idx` with `leftSec` to go, minus the keys in `fired`.
 * [{ event, key, id? }] — the caller adds each `key` to `fired` (and speaks, unless muted).
 *   lastRound / halfway: at the block's start (leftSec >= its sec), at most one, lastRound first.
 *   finalTen: a work block of FINAL_TEN_MIN_BLOCK s or more, from 10 s left down to 4 s (the
 *             3-2-1 beeps own the last three), once per block (key 'finalTen:<idx>').
 */
export function hypeEventsFor(blocks, idx, leftSec, fired = new Set(), marks = hypeMarks(blocks)) {
  const b = blocks?.[idx]
  if (!b) return []
  const out = []
  if (leftSec >= b.sec) {
    if (idx === marks.lastRound && !fired.has('lastRound')) out.push({ event: 'lastRound', key: 'lastRound', id: b.id })
    else if (idx === marks.halfway && !fired.has('halfway')) out.push({ event: 'halfway', key: 'halfway' })
  }
  const key = 'finalTen:' + idx
  if (b.kind === 'work' && b.sec >= FINAL_TEN_MIN_BLOCK && leftSec <= FINAL_TEN_SEC && leftSec > 3 && !fired.has(key)) {
    out.push({ event: 'finalTen', key })
  }
  return out
}

/** Whether a rest the workout screen starts earns a hype toast: a real rest, not "Switch sides". */
export const restStartHype = (sec, opts) => sec > 0 && opts?.kind !== 'switch'

/**
 * The finish summary's line: { event, id } (name the exercise) or { event, n }, or null when
 * nothing was logged. Load PRs first, then an estimated-1RM-only record, else 'done'.
 */
export function finishHype(prs = [], e1prs = [], setsDone = 1) {
  if (prs.length > 1) return { event: 'prs', n: prs.length }
  if (prs.length === 1) return { event: 'pr', id: prs[0] }
  if (e1prs.length) return { event: 'e1pr', id: e1prs[0].id }
  return setsDone > 0 ? { event: 'done' } : null
}
