// @vitest-environment node

/* The built-in workout music. Tracks are 8 MB files that <audio> streams in byte ranges, so the
 * worker leaves them to the browser and caches nothing; index.json is answered like the shell.
 * public/sw.js is evaluated as-is against a small worker environment (same harness as
 * sw-media.test.js). */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SW = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://gym.test'
const keyOf = r => (typeof r === 'string' ? new URL(r, ORIGIN + '/').href : r.url)

class OrderedCache {
  constructor() { this.m = new Map() }
  async put(req, res) { const k = keyOf(req); this.m.delete(k); this.m.set(k, res) }
  async match(req) { const r = this.m.get(keyOf(req)); return r ? r.clone() : undefined }
  async keys() { return [...this.m.keys()].map(url => ({ url })) }
  async delete(req) { return this.m.delete(keyOf(req)) }
  urls() { return [...this.m.keys()] }
}
function worker(all = new Map()) {
  const handlers = {}
  const caches = {
    open: async n => { if (!all.has(n)) all.set(n, new OrderedCache()); return all.get(n) },
    keys: async () => [...all.keys()],
    delete: async n => all.delete(n),
    match: async req => { for (const c of all.values()) { const hit = await c.match(req); if (hit) return hit } return undefined },
  }
  const env = { fetched: [], all, caches }
  const fetch = async req => {
    env.fetched.push(keyOf(req))
    return new Response('{"version":1,"tracks":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const self = { addEventListener: (t, f) => { handlers[t] = f }, skipWaiting: () => {}, clients: { claim: async () => {} }, registration: {} }
  new Function('self', 'caches', 'fetch', 'location', SW)(self, caches, fetch, new URL(ORIGIN + '/sw.js'))
  env.get = async (path, headers) => {
    const pending = []
    let responded = null
    const e = { request: { url: ORIGIN + path, method: 'GET', mode: 'no-cors', headers: new Headers(headers || {}) }, respondWith: p => { responded = p }, waitUntil: p => { pending.push(p) } }
    handlers.fetch(e)
    const res = await responded
    await Promise.all(pending)
    for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 0)); await Promise.all(pending) }
    return res
  }
  return env
}

describe('sw.js workout music', () => {
  it('leaves a track to the browser: no respondWith, nothing cached', async () => {
    const w = worker()
    expect(await w.get('/workout-music/a-0123456789ab.mp3', { range: 'bytes=0-' })).toBeNull()
    expect(await w.get('/workout-music/a-0123456789ab.m4a')).toBeNull()
    expect(w.fetched).toEqual([])
    for (const c of w.all.values()) expect(c.urls()).toEqual([])
  })

  it('still answers index.json', async () => {
    const w = worker()
    expect(await w.get('/workout-music/index.json')).not.toBeNull()
  })
})
