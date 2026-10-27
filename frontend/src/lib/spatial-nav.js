// D-pad navigation for TV mode (Android TV remotes send the four arrow keys and Enter).
// A WebView has no spatial navigation of its own beyond Tab order, so the arrows move focus
// to the nearest focusable control in that direction. Enter stays native: it clicks the focus.

import { focusables } from './sheet-focus.js'

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/**
 * The candidate to focus when moving `dir` from `fromRect`: it must lie beyond the edge of
 * `fromRect` in that direction; score = gap along the axis + 2 x the perpendicular offset
 * (0 when the two overlap on that axis). Lowest score wins; null when none is in that direction.
 * `candidates` is [{ el, rect }], a rect being { left, top, right, bottom }.
 */
export function nextInDirection(fromRect, candidates, dir) {
  const horizontal = dir === 'left' || dir === 'right'
  let best = null, bestScore = Infinity
  for (const c of candidates || []) {
    const r = c.rect
    let gap
    if (dir === 'right') gap = r.left - fromRect.right
    else if (dir === 'left') gap = fromRect.left - r.right
    else if (dir === 'down') gap = r.top - fromRect.bottom
    else if (dir === 'up') gap = fromRect.top - r.bottom
    else return null
    if (gap < 0) continue   // not beyond the edge in that direction
    const lo = horizontal ? r.top : r.left, hi = horizontal ? r.bottom : r.right
    const flo = horizontal ? fromRect.top : fromRect.left, fhi = horizontal ? fromRect.bottom : fromRect.right
    const off = hi < flo ? flo - hi : lo > fhi ? lo - fhi : 0
    const score = gap + 2 * off
    if (score < bestScore) { best = c; bestScore = score }
  }
  return best
}

/**
 * Where the arrows may go: the newest sheet when one is open (focus stays inside it), else the
 * page without the sheet layer.
 */
export function currentScope(doc = document) {
  const root = doc.getElementById('modal-root')
  if (root && root.children.length) return root.children[root.children.length - 1]
  return doc.body || doc
}

const inScope = (scope, doc, el) => {
  if (scope === doc.body) { const root = doc.getElementById('modal-root'); return !(root && root.contains(el)) }
  return true
}

export function installSpatialNav({ doc = document, rectOf = el => el.getBoundingClientRect() } = {}) {
  const onKey = e => {
    const dir = ARROWS[e.key]
    if (!dir || e.defaultPrevented) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const target = e.target
    const within = sel => !!(target && typeof target.closest === 'function' && target.closest(sel))
    if (within('[data-dpad-owner]')) return
    const tag = target?.tagName
    if (tag === 'TEXTAREA') return
    if (tag === 'INPUT' && (dir === 'left' || dir === 'right')) return
    const scope = currentScope(doc)
    const all = focusables(scope).filter(el => inScope(scope, doc, el))
    if (!all.length) return
    const active = doc.activeElement
    if (!active || active === doc.body || active === doc.documentElement) {
      e.preventDefault()
      all[0].focus()
      all[0].scrollIntoView?.({ block: 'nearest' })
      return
    }
    const candidates = all.filter(el => el !== active).map(el => ({ el, rect: rectOf(el) }))
    const found = nextInDirection(rectOf(active), candidates, dir)
    if (!found) return
    e.preventDefault()
    found.el.focus()
    found.el.scrollIntoView?.({ block: 'nearest' })
  }
  doc.addEventListener('keydown', onKey)
  return () => doc.removeEventListener('keydown', onKey)
}
