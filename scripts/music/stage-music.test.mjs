// stagePlan: what stage-music.mjs copies, and when it copies nothing. Pure, no files touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagePlan } from './lib.mjs'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const track = (id, sha, extra = {}) => ({ id, title: id, artist: 'x', license: 'CC-BY-4.0', file: id + '.mp3', sha256: sha, ...extra })
const index = (tracks, version = 1) => JSON.stringify({ version, tracks })
const fixture = () => [track('a', A), track('b', B)]
const LIST = ['a.mp3', 'b.mp3', 'attribution.txt']

test('no index.json: nothing staged', () => {
  const p = stagePlan(null, [])
  assert.match(p.skip, /no index\.json/)
  assert.deepEqual(p.copies, [])
  assert.equal(p.index, null)
})

test('an index that is not JSON or not version 1', () => {
  assert.match(stagePlan('{', ['attribution.txt']).skip, /not valid JSON/)
  assert.match(stagePlan(index(fixture(), 2), LIST).skip, /unsupported shape/)
  assert.match(stagePlan('{"version":1,"tracks":{}}', LIST).skip, /unsupported shape/)
})

test('without attribution.txt nothing ships', () => {
  const p = stagePlan(index(fixture()), ['a.mp3', 'b.mp3'])
  assert.match(p.skip, /attribution\.txt/)
  assert.deepEqual(p.copies, [])
})

test('tracks are renamed by content hash and the index follows', () => {
  const p = stagePlan(index(fixture()), LIST)
  assert.equal(p.skip, null)
  assert.deepEqual(p.copies, [
    { from: 'a.mp3', to: 'a-aaaaaaaaaaaa.mp3' },
    { from: 'b.mp3', to: 'b-bbbbbbbbbbbb.mp3' },
    { from: 'attribution.txt', to: 'attribution.txt' },
  ])
  assert.equal(p.index.tracks[0].file, 'a-aaaaaaaaaaaa.mp3')
  assert.equal(p.index.tracks[1].file, 'b-bbbbbbbbbbbb.mp3')
})

test('a listed m4a is copied and renamed; an unlisted one is dropped from the index', () => {
  const withM4a = index([track('a', A, { m4a: 'a.m4a' })])
  const p = stagePlan(withM4a, ['a.mp3', 'a.m4a', 'attribution.txt'])
  assert.deepEqual(p.copies[1], { from: 'a.m4a', to: 'a-aaaaaaaaaaaa.m4a' })
  assert.equal(p.index.tracks[0].m4a, 'a-aaaaaaaaaaaa.m4a')
  const q = stagePlan(withM4a, ['a.mp3', 'attribution.txt'])
  assert.equal(q.copies.length, 2)
  assert.equal('m4a' in q.index.tracks[0], false)
})

test('a track whose file is missing, unpinned or oddly named is dropped', () => {
  const missing = stagePlan(index(fixture()), ['a.mp3', 'attribution.txt'])
  assert.deepEqual(missing.index.tracks.map(t => t.id), ['a'])
  const b = fixture(); b[1].sha256 = null
  assert.deepEqual(stagePlan(index(b), LIST).index.tracks.map(t => t.id), ['a'])
  const a = fixture(); a[0].file = '../x.mp3'
  assert.deepEqual(stagePlan(index(a), LIST).index.tracks.map(t => t.id), ['b'])
})

test('files that are not in the index are never copied', () => {
  const p = stagePlan(index(fixture()), [...LIST, 'old.mp3'])
  assert.equal(p.copies.some(c => c.from === 'old.mp3'), false)
})

test('no track files present: nothing staged', () => {
  const p = stagePlan(index(fixture()), ['attribution.txt'])
  assert.match(p.skip, /no track files present/)
  assert.deepEqual(p.copies, [])
  assert.equal(p.index, null)
})
