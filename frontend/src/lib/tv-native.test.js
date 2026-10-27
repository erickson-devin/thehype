// The native half of Android TV is Java and XML the unit tests cannot run, so the contract is read
// from the source: one APK that lists in the TV launcher without demanding TV-only or phone-only
// hardware, a plugin that says whether this is a TV, and the remote's media keys forwarded to the page.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

const dir = new URL('../../android/app/src/main/', import.meta.url)
const read = p => readFileSync(new URL(p, dir), 'utf8')
const java = 'java/ch/duartesantos/opengym/'

describe('Android TV, native side', () => {
  it('the manifest lists the app in the TV launcher and requires no TV or phone hardware', () => {
    const m = read('AndroidManifest.xml')
    expect(m).toContain('android.intent.category.LEANBACK_LAUNCHER')
    for (const f of ['android.software.leanback', 'android.hardware.touchscreen', 'android.hardware.camera', 'android.hardware.camera.autofocus'])
      expect(m).toMatch(new RegExp(`<uses-feature android:name="${f.replace(/\./g, '\\.')}" android:required="false" />`))
    expect(m).toContain('android:banner="@drawable/tv_banner"')
    expect(m).not.toContain('screenOrientation')
  })
  it('the banner exists', () => {
    expect(existsSync(new URL('res/drawable/tv_banner.xml', dir))).toBe(true)
  })
  it('the plugin is registered before super.onCreate and detects a television', () => {
    const activity = read(java + 'MainActivity.java')
    const plugin = read(java + 'TvModePlugin.java')
    expect(activity).toMatch(/registerPlugin\(TvModePlugin\.class\);[\s\S]*super\.onCreate/)
    expect(plugin).toContain('@CapacitorPlugin(name = "TvMode")')
    expect(plugin).toContain('UI_MODE_TYPE_TELEVISION')
  })
  it('the activity forwards the six remote media keys to the page', () => {
    const activity = read(java + 'MainActivity.java')
    for (const k of ['MEDIA_PLAY_PAUSE', 'MEDIA_PLAY', 'MEDIA_PAUSE', 'MEDIA_NEXT', 'MEDIA_FAST_FORWARD', 'MEDIA_STOP'])
      expect(activity).toContain('case KeyEvent.KEYCODE_' + k + ':')
    expect(activity).toContain('opengym:media-key')
  })
})
