// @vitest-environment happy-dom
/* requestErrorText: what a lifter reads when a request to the Coach is refused or never arrives. */
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ MOBILE: false, coachLocal: null }))
vi.mock('./demo.js', () => ({ DEMO: false, DEMO_SEEDED: 'gym_demo_seeded_v1', REPO: '' }))
vi.mock('./mobile.js', () => ({ get MOBILE() { return mocks.MOBILE } }))
vi.mock('./api.js', () => ({ api: vi.fn() }))
vi.mock('../store/useStore.js', () => ({ useStore: { getState: () => ({ S: {}, coachLocal: mocks.coachLocal }) } }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

const { JOB_ERRORS, requestErrorText } = await import('./coach-api.js')

const err = (message, props) => Object.assign(new Error(message), props)

describe('requestErrorText', () => {
  it('uses the app\'s own line for a refusal class', () => {
    expect(requestErrorText({ data: { code: 'cap' } })).toBe(JOB_ERRORS.cap)
  })
  it('says the Coach cannot be reached when the request never arrived', () => {
    expect(requestErrorText(new TypeError('Failed to fetch'))).toBe('The Coach can’t be reached right now. Check your connection and try again.')
  })
  it('gives a bare 5xx the internal line', () => {
    expect(requestErrorText(err('HTTP 502', { status: 502, data: {} }))).toBe(JOB_ERRORS.internal)
  })
  it('keeps the server\'s words for a class with no line here', () => {
    expect(requestErrorText(err('shared credential', { status: 403, data: { code: 'shared', error: 'shared credential' } }))).toBe('shared credential')
  })
  it('keeps the message of a timeout', () => {
    expect(requestErrorText(err('The server did not answer in time.', { code: 'timeout' }))).toBe('The server did not answer in time.')
  })
  it('falls back to a generic line for nothing at all', () => {
    expect(requestErrorText(undefined)).toBe('Could not ask the Coach')
  })
})
