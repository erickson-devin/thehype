// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mediaKeyAction, playerKeyAction } from './player-keys.js'

const key = (k, extra = {}) => ({ key: k, target: document.body, ...extra })
const el = (tag, attrs = {}) => {
  const e = document.createElement(tag)
  for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v)
  document.body.appendChild(e)
  return e
}

describe('playerKeyAction', () => {
  it('Enter, Space and Spacebar toggle', () => {
    for (const k of ['Enter', ' ', 'Spacebar']) expect(playerKeyAction(key(k))).toBe('toggle')
  })
  it('ArrowRight skips, ArrowLeft does nothing', () => {
    expect(playerKeyAction(key('ArrowRight'))).toBe('skip')
    expect(playerKeyAction(key('ArrowLeft'))).toBeNull()
  })
  it('mirrors the arrows in RTL', () => {
    expect(playerKeyAction(key('ArrowLeft'), { rtl: true })).toBe('skip')
    expect(playerKeyAction(key('ArrowRight'), { rtl: true })).toBeNull()
  })
  it('more and end are TV only', () => {
    expect(playerKeyAction(key('ArrowDown'), { tv: true })).toBe('more')
    expect(playerKeyAction(key('ContextMenu'), { tv: true })).toBe('more')
    expect(playerKeyAction(key('Escape'), { tv: true })).toBe('end')
    expect(playerKeyAction(key('ArrowDown'))).toBeNull()
    expect(playerKeyAction(key('ContextMenu'))).toBeNull()
    expect(playerKeyAction(key('Escape'))).toBeNull()
  })
  it('media keys map as documented', () => {
    expect(playerKeyAction(key('MediaPlayPause'))).toBe('toggle')
    expect(playerKeyAction(key('MediaPlay'), { paused: true })).toBe('toggle')
    expect(playerKeyAction(key('MediaPlay'), { paused: false })).toBeNull()
    expect(playerKeyAction(key('MediaPause'), { paused: false })).toBe('toggle')
    expect(playerKeyAction(key('MediaPause'), { paused: true })).toBeNull()
    expect(playerKeyAction(key('MediaTrackNext'))).toBe('skip')
    expect(playerKeyAction(key('MediaFastForward'))).toBe('skip')
    expect(playerKeyAction(key('MediaStop'))).toBe('end')
  })
  it('is null with no event, a handled event, a repeat or composition', () => {
    expect(playerKeyAction(null)).toBeNull()
    expect(playerKeyAction(key('Enter', { defaultPrevented: true }))).toBeNull()
    expect(playerKeyAction(key('Enter', { repeat: true }))).toBeNull()
    expect(playerKeyAction(key('Enter', { isComposing: true }))).toBeNull()
  })
  it('leaves modifier combinations alone', () => {
    for (const m of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) expect(playerKeyAction(key('Enter', { [m]: true }))).toBeNull()
  })
  it('is null while a sheet is open', () => {
    expect(playerKeyAction(key('Enter'), { sheetOpen: true })).toBeNull()
    expect(playerKeyAction(key('MediaPlayPause'), { sheetOpen: true })).toBeNull()
  })
  it('leaves text fields alone', () => {
    expect(playerKeyAction({ key: 'Enter', target: el('input') })).toBeNull()
    expect(playerKeyAction({ key: 'ArrowRight', target: el('textarea') })).toBeNull()
  })
  it('lets a focused control keep its own Enter, but media keys still act', () => {
    const b = el('button')
    expect(playerKeyAction({ key: 'Enter', target: b })).toBeNull()
    expect(playerKeyAction({ key: ' ', target: el('div', { role: 'button' }) })).toBeNull()
    expect(playerKeyAction({ key: 'MediaPlayPause', target: b })).toBe('toggle')
    expect(playerKeyAction({ key: 'MediaStop', target: b })).toBe('end')
  })
})

describe('mediaKeyAction', () => {
  it('maps the native media keys without looking at a target', () => {
    expect(mediaKeyAction('MediaPlayPause')).toBe('toggle')
    expect(mediaKeyAction('MediaPlay', { paused: true })).toBe('toggle')
    expect(mediaKeyAction('MediaPlay', { paused: false })).toBeNull()
    expect(mediaKeyAction('MediaPause', { paused: false })).toBe('toggle')
    expect(mediaKeyAction('MediaTrackNext')).toBe('skip')
    expect(mediaKeyAction('MediaStop')).toBe('end')
    expect(mediaKeyAction('Enter')).toBeNull()
    expect(mediaKeyAction(undefined)).toBeNull()
  })
})
