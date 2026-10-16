import { describe, expect, it } from 'vitest'
import { mergeStates, stampEdits } from './sync-merge.js'

// The music setup is two ordinary profile settings. These pin the two things that make it "save
// properly": a change is stamped like any other, and two devices keep the one changed last.
const base = (over = {}) => ({
  unit: 'kg', restSec: 90, lang: 'en', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [],
  favEx: [], exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], musicWebhookUrl: '', musicDeepLink: '', _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))
const change = (from, now, mut) => { const n = clone(from); mut(n); stampEdits(from, n, now); n._ts = now; return n }

describe('music settings in sync', () => {
  it('a change to either field is stamped', () => {
    const a = base()
    const b = change(a, 500, s => { s.musicWebhookUrl = 'http://192.168.1.20:5000/start-music' })
    expect(b.edited.musicWebhookUrl).toBe(500)
    expect(b.edited.musicDeepLink).toBeUndefined()
    const c = change(b, 600, s => { s.musicDeepLink = 'spotify:playlist:abc' })
    expect(c.edited.musicDeepLink).toBe(600)
  })

  it('clearing a field is a change too, and wins over the older value', () => {
    const had = base({ _ts: 100, musicDeepLink: 'spotify:playlist:abc' })
    const cleared = change(had, 500, s => { s.musicDeepLink = '' })
    expect(cleared.edited.musicDeepLink).toBe(500)
    const other = change(had, 300, s => { s.restSec = 60 })
    for (const m of [mergeStates(cleared, other), mergeStates(other, cleared)]) {
      expect(m.musicDeepLink).toBe('')
      expect(m.restSec).toBe(60)
    }
  })

  it('keeps the setup from the device that set it even when the other copy is newer overall', () => {
    const start = base({ _ts: 100 })
    const phone = change(start, 500, s => { s.musicDeepLink = 'spotify:playlist:abc' })
    const desktop = change(start, 900, s => { s.restSec = 60 })   // newer, and never touched the music
    for (const m of [mergeStates(phone, desktop), mergeStates(desktop, phone)]) {
      expect(m.musicDeepLink).toBe('spotify:playlist:abc')
      expect(m.restSec).toBe(60)
    }
  })

  it('the later of two edits to the same field wins', () => {
    const start = base({ _ts: 100 })
    const a = change(start, 500, s => { s.musicWebhookUrl = 'http://a.local/play' })
    const b = change(start, 700, s => { s.musicWebhookUrl = 'http://b.local/play' })
    expect(mergeStates(a, b).musicWebhookUrl).toBe('http://b.local/play')
    expect(mergeStates(b, a).musicWebhookUrl).toBe('http://b.local/play')
  })
})
