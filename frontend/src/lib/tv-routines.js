// The Android TV picker (views/TvHome.jsx): the routines a remote can start in one press, which are
// the follow-along ones (a manual session needs a touchscreen). Today's come first, then plan order.
import { effectiveRoutineIds } from './history.js'
import { approxTime, estimateRoutine, isAutoRoutine } from './interval-plan.js'

export function tvRoutines(S, iso) {
  const all = (S?.routines || []).filter(r => isAutoRoutine(r) && r.ex?.length)
  let todayIds = []
  try { todayIds = effectiveRoutineIds(S, iso, iso) } catch { /* a state without a plan has no today */ }
  const rows = all.map(r => ({ r, today: todayIds.includes(r.id), est: approxTime(estimateRoutine(r).sec) }))
  return [...rows.filter(x => x.today), ...rows.filter(x => !x.today)]
}
