// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { focusables, pickInitialFocus } from './sheet-focus.js'

const root = html => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d }

describe('pickInitialFocus', () => {
  it('prefers [data-autofocus]', () => {
    const r = root('<button id="a">A</button><button id="b" data-autofocus>B</button>')
    expect(pickInitialFocus(r).id).toBe('b')
  })
  it('lands on the last button of a destructive confirm', () => {
    const r = root('<button id="d" class="btn danger">Discard</button><button id="c" class="btn">Cancel</button>')
    expect(pickInitialFocus(r).id).toBe('c')
  })
  it('otherwise takes the first focusable', () => {
    const r = root('<h3>Hi</h3><button id="a">A</button><button id="b">B</button>')
    expect(pickInitialFocus(r).id).toBe('a')
  })
  it('is null when nothing can be focused', () => {
    expect(pickInitialFocus(root('<p>text</p>'))).toBeNull()
    expect(pickInitialFocus(null)).toBeNull()
  })
})

describe('focusables', () => {
  it('lists enabled, visible controls only', () => {
    const r = root('<button id="a">A</button><button id="b" disabled>B</button><a href="#x" id="c">C</a><input type="hidden"><div tabindex="-1"></div>')
    for (const el of r.querySelectorAll('*')) el.getClientRects = () => [{}]
    expect(focusables(r).map(e => e.id)).toEqual(['a', 'c'])
    expect(focusables(null)).toEqual([])
  })
})
