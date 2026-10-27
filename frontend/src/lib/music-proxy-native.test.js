// The Android proxy for a plain-http server's music is Java the unit tests cannot run, so the contract is
// read from the source: MainActivity installs it, and it only answers /_hype_music/ and bare file names.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const dir = new URL('../../android/app/src/main/java/ch/duartesantos/opengym/', import.meta.url)
const read = p => readFileSync(new URL(p, dir), 'utf8')

describe('music proxy, native side', () => {
  it('MainActivity installs it after super.onCreate', () => {
    expect(read('MainActivity.java')).toMatch(/super\.onCreate\([^)]*\);[\s\S]*setWebViewClient\(new MusicProxyClient\(bridge\)\)/)
  })
  it('it wraps Capacitor\'s client and falls through for other requests', () => {
    const c = read('MusicProxyClient.java')
    expect(c).toContain('extends BridgeWebViewClient')
    expect(c).toContain('return super.shouldInterceptRequest(view, request)')
  })
  it('it is restricted to /_hype_music/, workout-music and a bare file name', () => {
    const c = read('MusicProxyClient.java')
    expect(c).toContain('"/_hype_music/"')
    expect(c).toContain('"workout-music"')
    expect(c).toContain('^[A-Za-z0-9._-]+$')
    expect(c).toContain('contains("..")')
    expect(c).toMatch(/"http".*"https"/)
  })
})
