// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ duck: null }))
vi.mock('./interval-audio.js', () => ({ onSpeech: vi.fn(fn => { h.duck = fn; return () => {} }) }))
vi.mock('./app-base.js', () => ({ appBase: () => '/gym/' }))

import {
  _audioForTests, _resetForTests, builtinPlaylist, loadBuiltinPlaylist, musicState, onMusicChange,
  pauseMusic, resumeMusic, setMusicVolume, startBuiltinMusic, stopMusic,
} from './music-dom.js'

const mk = id => ({ id, title: id.toUpperCase(), artist: 'X', license: 'CC0-1.0', licenseUrl: '', attribution: '', durationSec: 100, file: id + '.mp3' })
const TRACKS = [mk('a'), mk('b'), mk('c')]
const index = { version: 1, tracks: TRACKS }
const okFetch = body => vi.fn(() => Promise.resolve({ ok: true, redirected: false, json: () => Promise.resolve(body) }))
const ev = name => _audioForTests().dispatchEvent(new Event(name))
const srcEnd = () => _audioForTests().getAttribute('src')

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
  _resetForTests()
})
afterEach(() => { vi.useRealTimers() })

describe('loadBuiltinPlaylist', () => {
  it('asks for the index under the app base, once', async () => {
    const f = okFetch(index)
    await loadBuiltinPlaylist({ fetchFn: f, base: '/gym/' })
    await loadBuiltinPlaylist({ fetchFn: f, base: '/gym/' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe('/gym/workout-music/index.json')
  })
  it.each([
    ['a 404', () => Promise.resolve({ ok: false, status: 404 })],
    ['a redirect', () => Promise.resolve({ ok: true, redirected: true, json: () => Promise.resolve(index) })],
    ['bad json', () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('x')) })],
    ['a failed fetch', () => Promise.reject(new Error('offline'))],
  ])('is empty on %s', async (_, fn) => {
    expect(await loadBuiltinPlaylist({ fetchFn: vi.fn(fn) })).toEqual([])
    expect(builtinPlaylist()).toEqual([])
  })
  it('holds the tracks and announces them', async () => {
    expect(builtinPlaylist()).toBeNull()
    const cb = vi.fn()
    onMusicChange(cb)
    const list = await loadBuiltinPlaylist({ fetchFn: okFetch(index) })
    expect(list.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(builtinPlaylist()).toEqual(list)
    expect(cb).toHaveBeenCalled()
  })
})

describe('startBuiltinMusic', () => {
  it('does nothing without tracks', () => {
    expect(startBuiltinMusic({ tracks: [] })).toBe(false)
    expect(_audioForTests()).toBeNull()
  })
  it('plays the first track', () => {
    expect(startBuiltinMusic({ tracks: TRACKS, shuffle: false })).toBe(true)
    expect(srcEnd()).toMatch(/workout-music\/a\.mp3$/)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(musicState().track.id).toBe('a')
    expect(musicState().started).toBe(true)
  })
  it('moves on when a track ends, and wraps', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    ev('ended')
    expect(srcEnd()).toMatch(/b\.mp3$/)
    ev('ended'); ev('ended')
    expect(srcEnd()).toMatch(/a\.mp3$/)
  })
  it('skips a track that errors, and gives up when all do', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    ev('error')
    expect(srcEnd()).toMatch(/b\.mp3$/)
    ev('error'); ev('error')
    expect(musicState().failed).toBe(true)
    expect(musicState().track).toBeNull()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3)
  })
  it('notes a blocked autoplay', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('x', 'NotAllowedError')))
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    await Promise.resolve(); await Promise.resolve()
    expect(musicState().blocked).toBe(true)
  })
})

describe('ducking', () => {
  it('drops to a quarter while speech runs and comes back', () => {
    vi.useFakeTimers()
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    setMusicVolume(0.8)
    h.duck(true)
    vi.advanceTimersByTime(150)
    expect(_audioForTests().volume).toBeCloseTo(0.2)
    h.duck(false)
    vi.advanceTimersByTime(150)
    expect(_audioForTests().volume).toBeCloseTo(0.8)
  })
})

describe('pause, resume, stop', () => {
  it('a user pause survives an automatic resume, not a user one', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    const play = HTMLMediaElement.prototype.play
    pauseMusic({ user: true })
    resumeMusic()
    expect(play).toHaveBeenCalledTimes(1)
    resumeMusic({ user: true })
    expect(play).toHaveBeenCalledTimes(2)
  })
  it('an automatic pause resumes automatically', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    pauseMusic()
    resumeMusic()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  })
  it('stop releases the element', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    const cb = vi.fn()
    onMusicChange(cb)
    stopMusic()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(_audioForTests().hasAttribute('src')).toBe(false)
    expect(musicState().started).toBe(false)
    expect(cb).toHaveBeenCalled()
  })
  it('stops calling a listener after unsubscribe', () => {
    startBuiltinMusic({ tracks: TRACKS, shuffle: false })
    const cb = vi.fn()
    const off = onMusicChange(cb)
    off()
    ev('ended')
    expect(cb).not.toHaveBeenCalled()
  })
})
