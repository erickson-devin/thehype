import { describe, expect, it, vi } from 'vitest'
import { cleanDeepLink, cleanWebhookUrl, musicPlan, openLink, startWorkoutMusic, MUSIC_FIELD_MAX } from './auto-music.js'

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
    expect(fetchFn).toHaveBeenCalledWith(hook, { method: 'GET', mode: 'no-cors' })
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
})
