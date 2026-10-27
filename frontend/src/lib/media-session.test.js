import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindMediaActions, mediaMetadataFor, positionStateFor, publishMedia } from './media-session.js'

const t = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i])
const nameOf = id => ({ sq: 'Squat', lu: 'Lunge' })[id]
const artworkOf = id => id === 'sq' ? 'img/sq.webp' : null
const B = [
  { kind: 'work', sec: 40, id: 'sq' }, { kind: 'rest', sec: 20 },
  { kind: 'work', sec: 40, id: 'sq' }, { kind: 'rest', sec: 20 }, { kind: 'work', sec: 30, id: 'lu' },
]
const o = { nameOf, artworkOf, t, sessionName: 'Leg day' }
const sqArt = [{ src: 'img/sq.webp', sizes: '512x512', type: 'image/webp' }]

describe('mediaMetadataFor', () => {
  it('work block', () => {
    expect(mediaMetadataFor(B, 0, o)).toEqual({ title: 'Squat', artist: 'Work 40 s · Up next: Squat', album: 'Leg day · Set 1 of 3', artwork: sqArt })
  })
  it('rest block uses the next exercise', () => {
    expect(mediaMetadataFor(B, 1, o)).toMatchObject({ title: 'Rest', artist: 'Rest 20 s · Up next: Squat', artwork: sqArt, album: 'Leg day · Set 2 of 3' })
  })
  it('last block, with the icon fallback', () => {
    expect(mediaMetadataFor(B, 4, o)).toMatchObject({
      artist: 'Work 30 s · Last one!', album: 'Leg day · Set 3 of 3',
      artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    })
  })
})

describe('the get-ready lead-in', () => {
  const RB = [{ kind: 'ready', sec: 20 }, ...B]
  it('names the first exercise and counts as set 1', () => {
    expect(mediaMetadataFor(RB, 0, o)).toEqual({ title: 'Get ready', artist: 'First up: Squat', album: 'Leg day · Set 1 of 3', artwork: sqArt })
    expect(mediaMetadataFor(RB, 1, o).title).toBe('Squat')
  })
  it('has its own position', () => expect(positionStateFor({ sec: 20 }, 15000)).toEqual({ duration: 20, position: 5, playbackRate: 1 }))
})

describe('positionStateFor', () => {
  it('maps time left to a position', () => expect(positionStateFor({ sec: 40 }, 30000)).toEqual({ duration: 40, position: 10, playbackRate: 1 }))
  it('clamps', () => expect(positionStateFor({ sec: 40 }, 50000).position).toBe(0))
  it('null for no block', () => expect(positionStateFor(undefined, 0)).toBeNull())
})

describe('adapter', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  afterEach(() => { Object.defineProperty(globalThis, 'navigator', had); delete globalThis.MediaMetadata })
  const setNav = v => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true })

  it('does nothing without mediaSession', () => {
    setNav({})
    expect(() => { publishMedia({ title: 'x' }, { playing: true, position: null }); bindMediaActions({})() }).not.toThrow()
  })
  it('binds three handlers and unbind nulls them', () => {
    const setActionHandler = vi.fn()
    setNav({ mediaSession: { setActionHandler } })
    const fns = { onPlay: () => {}, onPause: () => {}, onNext: () => {} }
    const unbind = bindMediaActions(fns)
    expect(setActionHandler).toHaveBeenCalledWith('play', fns.onPlay)
    expect(setActionHandler).toHaveBeenCalledWith('pause', fns.onPause)
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', fns.onNext)
    setActionHandler.mockClear()
    unbind()
    expect(setActionHandler.mock.calls.every(c => c[1] === null)).toBe(true)
    expect(setActionHandler.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['play', 'pause', 'nexttrack']))
  })
})
