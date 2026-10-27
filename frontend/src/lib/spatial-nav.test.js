// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { nextInDirection, installSpatialNav } from './spatial-nav.js'

const R = (left, top, w = 100, h = 40) => ({ left, top, right: left + w, bottom: top + h })
const cand = (id, rect) => ({ el: id, rect })
const pick = (from, cs, dir) => nextInDirection(from, cs, dir)?.el ?? null

describe('nextInDirection', () => {
  it('walks a column', () => {
    const cs = [cand('a', R(0, 0)), cand('b', R(0, 60)), cand('c', R(0, 120))]
    expect(pick(cs[0].rect, cs.slice(1), 'down')).toBe('b')
    expect(pick(cs[2].rect, cs.slice(0, 2), 'up')).toBe('b')
    expect(pick(cs[0].rect, cs.slice(1), 'up')).toBeNull()
  })
  it('walks a row', () => {
    const cs = [cand('a', R(0, 0)), cand('b', R(120, 0)), cand('c', R(240, 0))]
    expect(pick(cs[0].rect, cs.slice(1), 'right')).toBe('b')
    expect(pick(cs[2].rect, cs.slice(0, 2), 'left')).toBe('b')
    expect(pick(cs[2].rect, cs.slice(0, 2), 'right')).toBeNull()
  })
  it('walks a 3x3 grid', () => {
    const cs = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cs.push(cand(`${r}${c}`, R(c * 120, r * 60)))
    const others = id => cs.filter(c => c.el !== id)
    const at = id => cs.find(c => c.el === id).rect
    expect(pick(at('11'), others('11'), 'up')).toBe('01')
    expect(pick(at('11'), others('11'), 'down')).toBe('21')
    expect(pick(at('11'), others('11'), 'left')).toBe('10')
    expect(pick(at('11'), others('11'), 'right')).toBe('12')
    expect(pick(at('00'), others('00'), 'down')).toBe('10')
  })
  it('prefers an overlapping candidate over a nearer diagonal', () => {
    const from = R(0, 0)
    const diagonal = cand('diag', R(150, 45))   // gap 5, far off to the side
    const straight = cand('straight', R(0, 80))
    expect(pick(from, [diagonal, straight], 'down')).toBe('straight')
  })
  it('is null when nothing lies in that direction', () => {
    expect(pick(R(0, 0), [cand('a', R(0, 0, 100, 40))], 'down')).toBeNull()
    expect(nextInDirection(R(0, 0), [], 'left')).toBeNull()
  })
})

describe('installSpatialNav', () => {
  let off
  afterEach(() => { off?.(); document.body.innerHTML = '' })
  const rects = {}
  const rectOf = el => rects[el.id]
  const mount = html => {
    document.body.innerHTML = html
    for (const el of document.querySelectorAll('[id]')) el.scrollIntoView = () => {}
    // happy-dom has no layout: make everything count as visible
    for (const el of document.querySelectorAll('*')) el.getClientRects = () => [{}]
  }
  const press = (key, target = document.activeElement || document.body) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    target.dispatchEvent(ev)
    return ev
  }

  it('moves focus to the neighbour in that direction', () => {
    mount('<button id="a">A</button><button id="b">B</button>')
    Object.assign(rects, { a: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    document.getElementById('a').focus()
    const ev = press('ArrowDown')
    expect(document.activeElement.id).toBe('b')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('focuses the first control when nothing has focus', () => {
    mount('<button id="a">A</button><button id="b">B</button>')
    Object.assign(rects, { a: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    document.body.focus()
    press('ArrowRight', document.body)
    expect(document.activeElement.id).toBe('a')
  })

  it('leaves [data-dpad-owner] alone', () => {
    mount('<div id="o" data-dpad-owner tabindex="0"></div><button id="b">B</button>')
    Object.assign(rects, { o: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    document.getElementById('o').focus()
    const ev = press('ArrowDown')
    expect(ev.defaultPrevented).toBe(false)
    expect(document.activeElement.id).toBe('o')
  })

  it('does not prevent the default when nothing lies that way', () => {
    mount('<button id="a">A</button><button id="b">B</button>')
    Object.assign(rects, { a: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    document.getElementById('a').focus()
    const ev = press('ArrowUp')
    expect(ev.defaultPrevented).toBe(false)
    expect(document.activeElement.id).toBe('a')
  })

  it('leaves Left/Right to an input and every arrow to a textarea', () => {
    mount('<input id="i"><textarea id="t"></textarea><button id="b">B</button>')
    Object.assign(rects, { i: R(0, 0), t: R(0, 60), b: R(200, 0) })
    off = installSpatialNav({ rectOf })
    document.getElementById('i').focus()
    expect(press('ArrowRight').defaultPrevented).toBe(false)
    document.getElementById('t').focus()
    expect(press('ArrowUp').defaultPrevented).toBe(false)
  })

  it('stays inside the top sheet when #modal-root has one', () => {
    mount('<button id="page">P</button><div id="modal-root"><div id="s1"><button id="x">X</button><button id="y">Y</button></div></div>')
    Object.assign(rects, { page: R(0, 0), x: R(0, 100), y: R(0, 200) })
    off = installSpatialNav({ rectOf })
    document.getElementById('x').focus()
    press('ArrowUp')
    expect(document.activeElement.id).toBe('x')   // the page button above is out of scope
    press('ArrowDown')
    expect(document.activeElement.id).toBe('y')
  })

  it('stays out of #modal-root when no sheet is open', () => {
    mount('<button id="a">A</button><div id="modal-root"></div><button id="b">B</button>')
    Object.assign(rects, { a: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    document.getElementById('a').focus()
    press('ArrowDown')
    expect(document.activeElement.id).toBe('b')
  })

  it('detaches with the remover', () => {
    mount('<button id="a">A</button><button id="b">B</button>')
    Object.assign(rects, { a: R(0, 0), b: R(0, 100) })
    off = installSpatialNav({ rectOf })
    off(); off = null
    document.getElementById('a').focus()
    press('ArrowDown')
    expect(document.activeElement.id).toBe('a')
  })
})
