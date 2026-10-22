import { describe, expect, it } from 'vitest'
import { LICENSE_LABELS as SCRIPT_LABELS } from '../../../scripts/music/lib.mjs'
import { musicPlan } from './auto-music.js'
import {
  DUCK_FACTOR, LICENSE_LABELS, attributionFor, duckLevel, loadPlaylist, musicSource, nextIndex,
  nowPlayingLine, prevIndex, rampSteps, shuffledOrder, trackUrl,
} from './music-player.js'

const t = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i])
const row = (o = {}) => ({ id: 'laserpack', title: 'Laserpack', artist: 'Kevin MacLeod', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Laserpack by Kevin MacLeod (incompetech.com), CC BY 4.0', durationSec: 180, bpm: 128, file: 'laserpack-0123456789ab.mp3', ...o })

describe('LICENSE_LABELS', () => {
  it('mirrors the build script', () => { expect(LICENSE_LABELS).toEqual(SCRIPT_LABELS) })
})

describe('loadPlaylist', () => {
  it('gives [] for anything that is not an index', () => {
    for (const v of [null, undefined, {}, { version: 2, tracks: [] }, { version: 1 }, 'x']) expect(loadPlaylist(v)).toEqual([])
  })
  it('keeps a good row with only the known fields', () => {
    const out = loadPlaylist({ version: 1, tracks: [row({ extra: 1, bytes: 5, sha256: 'x' })] })
    expect(out).toHaveLength(1)
    expect(Object.keys(out[0]).sort()).toEqual(['artist', 'attribution', 'durationSec', 'file', 'id', 'license', 'licenseUrl', 'title'])
  })
  it('drops rows that cannot be played or credited', () => {
    const bad = [row({ file: undefined }), row({ file: '../x.mp3' }), row({ license: 'CC-BY-NC-4.0' }), row({ attribution: '' }), row({ title: '' }), row({ id: 'Bad Id' }), null, 'x']
    expect(loadPlaylist({ version: 1, tracks: bad })).toEqual([])
  })
  it('keeps CC0 without attribution', () => {
    expect(loadPlaylist({ version: 1, tracks: [row({ license: 'CC0-1.0', attribution: '' })] })).toHaveLength(1)
  })
  it('removes a bad m4a but keeps the row, and keeps a good one', () => {
    const [a] = loadPlaylist({ version: 1, tracks: [row({ m4a: 'x.wav' })] })
    expect(a.m4a).toBeUndefined()
    const [b] = loadPlaylist({ version: 1, tracks: [row({ m4a: 'laserpack-0123456789ab.m4a' })] })
    expect(b.m4a).toBe('laserpack-0123456789ab.m4a')
  })
})

describe('musicSource', () => {
  it.each([
    [{ plan: { kind: 'webhook' }, auto: true, enabled: true, hasPlaylist: true }, 'override'],
    [{ plan: { kind: 'link' }, auto: true, enabled: true, hasPlaylist: true }, 'override'],
    [{ plan: { kind: 'webhook' }, auto: false, enabled: true, hasPlaylist: true }, 'override'],
    [{ plan: null, auto: true, enabled: true, hasPlaylist: true }, 'builtin'],
    [{ plan: null, auto: true, enabled: false, hasPlaylist: true }, 'off'],
    [{ plan: null, auto: true, enabled: true, hasPlaylist: false }, 'off'],
    [{ plan: null, auto: false, enabled: true, hasPlaylist: true }, 'off'],
  ])('%j -> %s', (args, want) => { expect(musicSource(args)).toBe(want) })

  it('a blocked webhook falls back to the built-in playlist; with a link it is an override', () => {
    const S = { musicWebhookUrl: 'http://192.168.1.20/x' }
    expect(musicSource({ plan: musicPlan(S, { secureOrigin: true }), auto: true, enabled: true, hasPlaylist: true })).toBe('builtin')
    expect(musicSource({ plan: musicPlan({ ...S, musicDeepLink: 'spotify:playlist:a' }, { secureOrigin: true }), auto: true, enabled: true, hasPlaylist: true })).toBe('override')
  })
})

describe('order', () => {
  it('shuffles deterministically into a permutation', () => {
    const a = shuffledOrder(12, 42)
    expect(shuffledOrder(12, 42)).toEqual(a)
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(12).keys()])
    expect(shuffledOrder(12, 43)).not.toEqual(a)
    expect(shuffledOrder(0, 1)).toEqual([])
    expect(shuffledOrder(1, 1)).toEqual([0])
  })
  it('wraps', () => {
    expect(nextIndex(11, 12)).toBe(0)
    expect(prevIndex(0, 12)).toBe(11)
    expect(nextIndex(0, 0)).toBe(-1)
    expect(prevIndex(0, 0)).toBe(-1)
  })
})

describe('volume', () => {
  it('ducks to a quarter and clamps', () => {
    expect(DUCK_FACTOR).toBe(0.25)
    expect(duckLevel({ speaking: true, base: 0.8 })).toBeCloseTo(0.2)
    expect(duckLevel({ speaking: false, base: 0.8 })).toBe(0.8)
    expect(duckLevel({ speaking: false, base: 2 })).toBe(1)
    expect(duckLevel({ speaking: true, base: -1 })).toBe(0)
  })
  it('ramps linearly and ends on the target', () => {
    const r = rampSteps(0.8, 0.2, 3)
    expect(r).toHaveLength(3)
    ;[0.6, 0.4, 0.2].forEach((v, i) => expect(r[i]).toBeCloseTo(v))
    expect(rampSteps(0, 1).at(-1)).toBe(1)
  })
})

describe('trackUrl and credits', () => {
  it('builds the url, preferring m4a only when asked and present', () => {
    const tr = row({ m4a: 'laserpack-0123456789ab.m4a' })
    expect(trackUrl(tr, '/gym/')).toBe('/gym/workout-music/laserpack-0123456789ab.mp3')
    expect(trackUrl(tr, '/gym/', { m4a: true })).toBe('/gym/workout-music/laserpack-0123456789ab.m4a')
    expect(trackUrl(row(), '/', { m4a: true })).toBe('/workout-music/laserpack-0123456789ab.mp3')
  })
  it('writes the now-playing line with the licence for CC BY only', () => {
    expect(nowPlayingLine(row(), t)).toBe('Now playing: Laserpack — Kevin MacLeod (CC BY 4.0)')
    expect(nowPlayingLine(row({ license: 'CC-BY-3.0' }), t)).toBe('Now playing: Laserpack — Kevin MacLeod (CC BY 3.0)')
    expect(nowPlayingLine(row({ title: 'Game', artist: 'Play House', license: 'CC0-1.0' }), t)).toBe('Now playing: Game — Play House')
  })
  it('attribution is the credit for CC BY, empty for CC0', () => {
    expect(attributionFor(row())).toBe(row().attribution)
    expect(attributionFor(row({ license: 'CC0-1.0', attribution: 'x' }))).toBe('')
  })
})
