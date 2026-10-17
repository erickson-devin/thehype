// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard.js'

const setClipboard = v => Object.defineProperty(navigator, 'clipboard', { value: v, configurable: true })
afterEach(() => { setClipboard(undefined); delete document.execCommand; document.body.innerHTML = '' })

describe('copyText', () => {
  it('removes the textarea and reports false when the selection copy throws', async () => {
    setClipboard(undefined)
    document.execCommand = () => { throw new Error('x') }
    expect(await copyText('hi')).toBe(false)
    expect(document.querySelectorAll('textarea').length).toBe(0)
  })
  it('selection copy succeeds and leaves no textarea', async () => {
    setClipboard(undefined)
    document.execCommand = () => true
    expect(await copyText('hi')).toBe(true)
    expect(document.querySelectorAll('textarea').length).toBe(0)
  })
  it('uses the Clipboard API when there is one', async () => {
    const writeText = vi.fn().mockResolvedValue()
    setClipboard({ writeText })
    expect(await copyText('hi')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hi')
  })
  it('falls back to the selection copy when the Clipboard API refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('no')) })
    document.execCommand = () => true
    expect(await copyText('hi')).toBe(true)
  })
})
