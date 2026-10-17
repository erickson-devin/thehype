// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { setLang } from './i18n.js'
import { getLang } from './i18n-core.js'

describe('setLang', () => {
  it('the latest call wins when two overlap', async () => {
    await Promise.all([setLang('fr'), setLang('de')])
    expect(getLang()).toBe('de')
    expect(document.documentElement.lang).toBe('de')
  })
  it('setting the same language twice is harmless', async () => {
    await setLang('en')
    await setLang('en')
    expect(getLang()).toBe('en')
  })
})
