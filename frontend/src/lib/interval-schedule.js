// The follow-along player's clock, as pure functions. Time is a wall-clock origin plus paused spans,
// never a count of ticks, so a page that was frozen (locked screen, background tab) lands in the right
// block when it wakes. All times are milliseconds.
export const GAP_MS = 5000
// What happens to work blocks that ended while the page was frozen (no ticks for > GAP_MS):
// 'tick' logs them like a video that kept playing (the product decision); 'ask' / 'short' are kept
// as named alternatives so the policy is a one-line change.
export const AWAY_POLICY = 'tick'

export const startClock = now => ({ startedAt: now, pausedAt: null, pausedMs: 0, cuts: {} })
export const lengthsOf = (blocks, clock) => blocks.map((b, i) => clock.cuts[i] ?? b.sec * 1000)
export const elapsedOf = (clock, now) => Math.max(0, (clock.pausedAt ?? now) - clock.startedAt - clock.pausedMs)

const startOf = (lengths, idx) => { let s = 0; for (let i = 0; i < idx; i++) s += lengths[i]; return s }

export function positionAt(blocks, clock, now) {
  const elapsedMs = elapsedOf(clock, now)
  const lengths = lengthsOf(blocks, clock)
  let end = 0
  for (let i = 0; i < lengths.length; i++) {
    end += lengths[i]
    if (end > elapsedMs) return { idx: i, leftMs: end - elapsedMs, elapsedMs, done: false }
  }
  return { idx: blocks.length, leftMs: 0, elapsedMs, done: true }
}

export const pauseClock = (clock, now) => clock.pausedAt != null ? clock : { ...clock, pausedAt: now }
export const resumeClock = (clock, now) => clock.pausedAt == null ? clock : { ...clock, pausedAt: null, pausedMs: clock.pausedMs + (now - clock.pausedAt) }
// A retroactive pause: the clock stopped at `at`, already in the past.
export const holdFrom = (clock, at) => clock.pausedAt != null && clock.pausedAt <= at ? clock : { ...clock, pausedAt: at }

// Cut the current block short here; what follows starts now.
export function skipBlock(blocks, clock, now) {
  const pos = positionAt(blocks, clock, now)
  if (pos.done) return clock
  const lengths = lengthsOf(blocks, clock)
  return { ...clock, cuts: { ...clock.cuts, [pos.idx]: pos.elapsedMs - startOf(lengths, pos.idx) } }
}

// Further into a block than this, back restarts it; sooner, back goes to the block before.
export const RESTART_MS = 3000

// Back one: restart the current block, or (within RESTART_MS of its start) go to the start of the
// previous one. The cuts of every block it re-enters are dropped so they play in full again, and
// the clock is shifted (pausedMs) so it works the same while paused. Sets already ticked stay ticked.
export function backBlock(blocks, clock, now) {
  const pos = positionAt(blocks, clock, now)
  if (pos.done) return clock
  const inBlock = pos.elapsedMs - startOf(lengthsOf(blocks, clock), pos.idx)
  const target = inBlock > RESTART_MS ? pos.idx : Math.max(0, pos.idx - 1)
  const cuts = {}
  for (const k of Object.keys(clock.cuts)) if (+k < target) cuts[k] = clock.cuts[k]
  const to = startOf(lengthsOf(blocks, { ...clock, cuts }), target)
  return { ...clock, cuts, pausedMs: (clock.pausedAt ?? now) - clock.startedAt - to }
}

// Indices of work blocks whose end falls in (fromElapsed, toElapsed].
export function endedWork(blocks, clock, fromElapsed, toElapsed) {
  const lengths = lengthsOf(blocks, clock)
  const out = []
  let end = 0
  for (let i = 0; i < blocks.length; i++) {
    end += lengths[i]
    if (blocks[i].kind === 'work' && end > fromElapsed && end <= toElapsed) out.push(i)
  }
  return out
}

export function awayDecision(blocks, clock, lastTickAt, now, policy = AWAY_POLICY) {
  const none = { kind: 'none' }
  if (now - lastTickAt <= GAP_MS || clock.pausedAt != null) return none
  const from = positionAt(blocks, clock, lastTickAt)
  const to = positionAt(blocks, clock, now)
  if (from.idx === to.idx) return none
  const awayMs = now - lastTickAt
  const sets = endedWork(blocks, clock, from.elapsedMs, to.elapsedMs).length
  let kind = policy
  if (policy === 'short') kind = awayMs < lengthsOf(blocks, clock)[from.idx] ? 'tick' : 'ask'
  return { kind, awayMs, fromIdx: from.idx, toIdx: to.idx, sets, finishes: to.idx >= blocks.length }
}
