// The native half of the TV's spoken cues is Java and XML the unit tests cannot run, so the contract
// is read from the source: the plugin is registered, named as lib/native-tts.js expects, and the
// manifest lets the app see the text-to-speech engine.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const dir = new URL('../../android/app/src/main/', import.meta.url)
const read = p => readFileSync(new URL(p, dir), 'utf8')
const java = 'java/ch/duartesantos/opengym/'

describe('native speech, native side', () => {
  it('the plugin is registered before super.onCreate and named NativeSpeech', () => {
    expect(read(java + 'MainActivity.java')).toMatch(/registerPlugin\(NativeSpeechPlugin\.class\);[\s\S]*super\.onCreate/)
    expect(read(java + 'NativeSpeechPlugin.java')).toContain('@CapacitorPlugin(name = "NativeSpeech")')
  })
  it('the plugin never asks for audio focus and shuts the engine down', () => {
    const p = read(java + 'NativeSpeechPlugin.java')
    expect(p).not.toMatch(/AudioFocus/)
    expect(p).toContain('shutdown()')
  })
  it('the manifest can see the TTS service', () => {
    expect(read('AndroidManifest.xml')).toMatch(/<queries>[\s\S]*<intent>\s*<action android:name="android\.intent\.action\.TTS_SERVICE" \/>\s*<\/intent>[\s\S]*<\/queries>/)
  })
})
