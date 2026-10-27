import { describe, expect, it, vi } from 'vitest'
vi.mock('./music-dom.js', () => ({ startBuiltinMusic: vi.fn(() => false), builtinPlaylist: vi.fn(() => null) }))
import { cleanDeepLink, cleanWebhookUrl, musicPlan, openLink, startWorkoutMusic, webhookBlockedReason, MUSIC_FIELD_MAX } from './auto-music.js'

describe('cleanWebhookUrl', () => {
  it('keeps an http or https address, trimmed', () => {
    expect(cleanWebhookUrl('  http://192.168.1.20:5000/start-music ')).toBe('http://192.168.1.20:5000/start-music')
    expect(cleanWebhookUrl('https://hooks.example.com/play?token=a')).toBe('https://hooks.example.com/play?token=a')
  })
  it('refuses everything else', () => {
    for (const v of ['', '   ', null, undefined, 'not a url', 'spotify:playlist:abc', 'javascript:alert(1)', 'ftp://host/x', 'file:///etc/passwd']) expect(cleanWebhookUrl(v), String(v)).toBe('')
  })
  it('refuses one that is too long', () => {
    expect(cleanWebhookUrl('https://a.example/' + 'x'.repeat(MUSIC_FIELD_MAX))).toBe('')
  })
})

describe('cleanDeepLink', () => {
  it('keeps a scheme link, trimmed', () => {
    expect(cleanDeepLink(' spotify:playlist:37i9dQZF1DX ')).toBe('spotify:playlist:37i9dQZF1DX')
    expect(cleanDeepLink('https://open.spotify.com/playlist/abc')).toBe('https://open.spotify.com/playlist/abc')
    expect(cleanDeepLink('music://music.apple.com/playlist/x')).toBe('music://music.apple.com/playlist/x')
  })
  it('refuses what cannot open an app, and anything that runs code or reads a file', () => {
    for (const v of ['', null, 'spotify', 'spotify:', 'has space:x', 'spotify:play list', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd', 'blob:abc', '1http:x', 'sp\notify:x']) expect(cleanDeepLink(v), String(v)).toBe('')
  })
})

describe('musicPlan', () => {
  const hook = 'http://192.168.1.20:5000/start-music', link = 'spotify:playlist:abc'
  it('prefers the webhook when both are set', () => {
    expect(musicPlan({ musicWebhookUrl: hook, musicDeepLink: link })).toEqual({ kind: 'webhook', url: hook })
  })
  it('falls back to the deep link, then to nothing', () => {
    expect(musicPlan({ musicWebhookUrl: '', musicDeepLink: link })).toEqual({ kind: 'link', url: link })
    expect(musicPlan({ musicDeepLink: link })).toEqual({ kind: 'link', url: link })
    expect(musicPlan({ musicWebhookUrl: '', musicDeepLink: '' })).toBeNull()
    expect(musicPlan({})).toBeNull()
    expect(musicPlan(null)).toBeNull()
  })
  it('re-checks stored values: an unusable webhook does not hide a good deep link, and a bad link is never used', () => {
    expect(musicPlan({ musicWebhookUrl: 'javascript:alert(1)', musicDeepLink: link })).toEqual({ kind: 'link', url: link })
    expect(musicPlan({ musicDeepLink: 'javascript:alert(1)' })).toBeNull()
  })
})

describe('startWorkoutMusic', () => {
  const hook = 'http://192.168.1.20:5000/start-music', link = 'spotify:playlist:abc'
  it('calls the webhook with a silent no-cors request and leaves the deep link alone', () => {
    const fetchFn = vi.fn(() => Promise.resolve()), open = vi.fn()
    expect(startWorkoutMusic({ musicWebhookUrl: hook, musicDeepLink: link }, { fetchFn, open })).toBe('webhook')
    expect(fetchFn).toHaveBeenCalledWith(hook, { method: 'POST', mode: 'no-cors' })
    expect(open).not.toHaveBeenCalled()
  })
  it('opens the deep link when there is no webhook', () => {
    const fetchFn = vi.fn(), open = vi.fn()
    expect(startWorkoutMusic({ musicDeepLink: link }, { fetchFn, open })).toBe('link')
    expect(open).toHaveBeenCalledWith(link)
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('does nothing with neither', () => {
    const fetchFn = vi.fn(), open = vi.fn()
    expect(startWorkoutMusic({}, { fetchFn, open })).toBeNull()
    expect(startWorkoutMusic({ musicWebhookUrl: ' ', musicDeepLink: '' }, { fetchFn, open })).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
  it('never throws or leaves a rejection behind when the request or the open fails', async () => {
    const rejected = Promise.reject(new Error('network'))
    expect(() => startWorkoutMusic({ musicWebhookUrl: hook }, { fetchFn: () => rejected })).not.toThrow()
    await rejected.catch(() => {})
    expect(() => startWorkoutMusic({ musicWebhookUrl: hook }, { fetchFn: () => { throw new TypeError('blocked') } })).not.toThrow()
    expect(() => startWorkoutMusic({ musicDeepLink: link }, { open: () => { throw new Error('no handler') } })).not.toThrow()
  })
})

describe('openLink', () => {
  const fake = () => ({ open: vi.fn(), location: { href: '' } })
  it('opens an https link in a new tab on the web, leaving the app in place', () => {
    const win = fake()
    openLink('https://open.spotify.com/playlist/x', { win, native: false })
    expect(win.open).toHaveBeenCalledWith('https://open.spotify.com/playlist/x', '_blank', 'noopener,noreferrer')
    expect(win.location.href).toBe('')
  })
  it('navigates for an app-scheme link', () => {
    const win = fake()
    openLink('spotify:playlist:x', { win, native: false })
    expect(win.location.href).toBe('spotify:playlist:x')
    expect(win.open).not.toHaveBeenCalled()
  })
  it('navigates for any link inside the native shell', () => {
    const win = fake()
    openLink('https://open.spotify.com/playlist/x', { win, native: true })
    expect(win.location.href).toBe('https://open.spotify.com/playlist/x')
    expect(win.open).not.toHaveBeenCalled()
  })
  it('does nothing on a TV: the WebView is never sent away', () => {
    const win = fake()
    openLink('spotify:playlist:x', { win, native: true, tv: true })
    openLink('https://open.spotify.com/playlist/x', { win, native: true, tv: true })
    expect(win.location.href).toBe('')
    expect(win.open).not.toHaveBeenCalled()
  })
})

describe('webhookBlockedReason', () => {
  const lan = 'http://192.168.1.20:5000/start-music'
  it('blocks a plain http address from an https page', () => {
    expect(webhookBlockedReason(lan, { secureOrigin: true })).toBe('mixed')
    expect(webhookBlockedReason('HTTP://ha.local:8123/api/webhook/x', { secureOrigin: true })).toBe('mixed')
  })
  it('lets it through from an http page', () => {
    expect(webhookBlockedReason(lan, { secureOrigin: false })).toBeNull()
    expect(webhookBlockedReason(lan)).toBeNull()
  })
  it('lets https and loopback through', () => {
    expect(webhookBlockedReason('https://hooks.example.com/play', { secureOrigin: true })).toBeNull()
    for (const u of ['http://localhost:5000/x', 'http://127.0.0.1/x', 'http://[::1]:8123/x', 'http://speaker.localhost/x']) expect(webhookBlockedReason(u, { secureOrigin: true }), u).toBeNull()
  })
  it('allows cleartext in the Android app', () => {
    expect(webhookBlockedReason('http://192.168.1.20/x', { native: true, android: true, secureOrigin: true })).toBeNull()
  })
  it('applies App Transport Security in the iOS app', () => {
    expect(webhookBlockedReason('http://192.168.1.20/x', { native: true })).toBeNull()
    expect(webhookBlockedReason('http://ha.local/x', { native: true })).toBeNull()
    expect(webhookBlockedReason('http://speaker/x', { native: true })).toBeNull()
    expect(webhookBlockedReason('http://hooks.example.com/x', { native: true })).toBe('cleartext')
    expect(webhookBlockedReason('https://hooks.example.com/x', { native: true })).toBeNull()
  })
  it('has nothing to say about an unusable address', () => {
    for (const v of ['', null, undefined, 'javascript:alert(1)', 'spotify:playlist:x', 'ftp://h/x']) expect(webhookBlockedReason(v, { secureOrigin: true }), String(v)).toBeNull()
  })
})

describe('musicPlan falls back', () => {
  const hook = 'http://192.168.1.20/x', link = 'spotify:playlist:abc'
  it('uses the link when the webhook cannot fire from here', () => {
    expect(musicPlan({ musicWebhookUrl: hook, musicDeepLink: link }, { secureOrigin: true })).toEqual({ kind: 'link', url: link })
  })
  it('keeps the webhook where it can fire', () => {
    expect(musicPlan({ musicWebhookUrl: hook, musicDeepLink: link }, { secureOrigin: false })).toEqual({ kind: 'webhook', url: hook })
  })
  it('is nothing when blocked and there is no link', () => {
    expect(musicPlan({ musicWebhookUrl: hook }, { secureOrigin: true })).toBeNull()
  })
})

describe('startWorkoutMusic: the built-in playlist', () => {
  const hook = 'http://192.168.1.20:5000/start-music', link = 'spotify:playlist:abc'
  it('plays it for a follow-along routine with no webhook or link', () => {
    const builtin = vi.fn(() => true)
    expect(startWorkoutMusic({}, { auto: true, builtin })).toBe('builtin')
    expect(builtin).toHaveBeenCalledTimes(1)
  })
  it('reports nothing when there is nothing to play', () => {
    expect(startWorkoutMusic({}, { auto: true, builtin: vi.fn(() => false) })).toBeNull()
  })
  it('leaves it alone when a link or webhook is set', () => {
    const builtin = vi.fn(() => true), open = vi.fn(), fetchFn = vi.fn(() => Promise.resolve())
    expect(startWorkoutMusic({ musicDeepLink: link }, { auto: true, builtin, open })).toBe('link')
    expect(startWorkoutMusic({ musicWebhookUrl: hook }, { auto: true, builtin, fetchFn })).toBe('webhook')
    expect(builtin).not.toHaveBeenCalled()
  })
  it('is for follow-along routines only', () => {
    const builtin = vi.fn(() => true)
    expect(startWorkoutMusic({}, { auto: false, builtin })).toBeNull()
    expect(builtin).not.toHaveBeenCalled()
  })
  it('is off when the profile turned it off', () => {
    const builtin = vi.fn(() => true)
    expect(startWorkoutMusic({ builtinMusic: false }, { auto: true, builtin })).toBeNull()
    expect(builtin).not.toHaveBeenCalled()
  })
  it('takes over from a webhook that cannot fire from here', () => {
    const builtin = vi.fn(() => true)
    expect(startWorkoutMusic({ musicWebhookUrl: 'http://192.168.1.20/x' }, { auto: true, builtin, ctx: { secureOrigin: true } })).toBe('builtin')
  })
  it('never throws when the player does', () => {
    expect(startWorkoutMusic({}, { auto: true, builtin: () => { throw new Error('no audio') } })).toBeNull()
  })
})
