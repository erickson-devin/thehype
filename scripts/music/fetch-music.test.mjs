import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  attributionLines, attributionText, fetchOptionsFor, indexFor, looksLikeMp3, parseArgs, serializeManifest, validateManifest,
} from './lib.mjs'

const text = fs.readFileSync(new URL('../../catalogue/music/manifest.json', import.meta.url), 'utf8')
const real = JSON.parse(text)
const clone = () => structuredClone(real)
const bad = (mutate, re) => {
  const m = clone()
  mutate(m)
  const errs = validateManifest(m)
  assert.ok(errs.length > 0, 'expected an error')
  assert.match(errs.join('\n'), re)
}

test('validateManifest accepts the real manifest', () => {
  assert.deepEqual(validateManifest(real), [])
})

test('validateManifest rejects policy violations', () => {
  bad((m) => { m.tracks[0].ai = true }, /ai/)
  bad((m) => { delete m.tracks[0].ai }, /ai/)
  bad((m) => { m.tracks[0].license = 'CC-BY-NC-4.0' }, /not allowed/)
  bad((m) => { m.tracks[0].attribution = '' }, /attribution/)
  bad((m) => { m.tracks[1].id = m.tracks[0].id }, /duplicate/)
  bad((m) => { delete m.tracks[0].downloadUrl }, /downloadUrl/)
  bad((m) => { m.tracks[0].licenseUrl = 'https://creativecommons.org/licenses/by/3.0/' }, /licenseUrl/)
  bad((m) => { m.tracks[0].downloadUrl = 'https://files.freemusicarchive.org/x.mp3' }, /downloadUrl/)
  bad((m) => { m.tracks[0].sha256 = 'a'.repeat(64) }, /sha256/)
  bad((m) => { m.policy.licenses.push('CC-BY-SA-4.0') }, /licenses/)
  bad((m) => { m.tracks[0].AI = false }, /AI/)
})

test('validateManifest accepts an empty attribution on a CC0 track', () => {
  const m = clone()
  const g = m.tracks.find((t) => t.id === 'game')
  assert.equal(g.attribution, '')
  assert.deepEqual(validateManifest(m), [])
})

test('looksLikeMp3', () => {
  assert.equal(looksLikeMp3(Buffer.from('ID3\x04\x00xx')), true)
  assert.equal(looksLikeMp3(Buffer.from([0xff, 0xfb, 0x90, 0x00])), true)
  assert.equal(looksLikeMp3(Buffer.from([0xff, 0xf3, 0x90, 0x00])), true)
  assert.equal(looksLikeMp3(Buffer.from('<!DOCTYPE html><html>')), false)
  assert.equal(looksLikeMp3(Buffer.from('{"error":1}')), false)
  assert.equal(looksLikeMp3(Buffer.alloc(0)), false)
})

test('attributionLines', () => {
  const lines = attributionLines(real)
  const shiny = real.tracks.find((t) => t.id === 'shiny-tech')
  assert.ok(lines.includes(shiny.attribution))
  assert.ok(!lines.some((l) => l.includes('Play House')))
  assert.equal(lines.length, 11)
  const prop = lines.find((l) => l.includes('Propulsion'))
  assert.ok(prop.endsWith('https://creativecommons.org/licenses/by/4.0/'))
  const cc = lines.findIndex((l) => l.includes('ccmixter.org'))
  const last4 = lines.map((l, i) => (l.includes('CC BY 3.0') || l.includes('Attribution 3.0') || l.includes('licenses/by/3.0') ? i : -1)).filter((i) => i >= 0)
  assert.ok(cc >= 0 && last4.length)
  lines.forEach((l, i) => { if (l.includes('licenses/by/4.0')) assert.ok(i < cc) })
})

test('attributionText', () => {
  const t = attributionText(real)
  assert.match(t, /CC BY 3\.0/)
  assert.match(t, /CC0 1\.0[^\n]*\n[^\n]*Play House/)
})

test('fetchOptionsFor', () => {
  const ayr = fetchOptionsFor(real.tracks.find((t) => t.id === 'are-you-ready'))
  const st = fetchOptionsFor(real.tracks.find((t) => t.id === 'shiny-tech'))
  assert.equal(ayr.headers.Referer, 'https://ccmixter.org/')
  assert.deepEqual(Object.keys(st.headers), [])
  assert.equal(ayr.redirect, 'follow')
  assert.equal(st.redirect, 'follow')
})

test('indexFor', () => {
  const idx = indexFor(real)
  assert.equal(idx.tracks.length, 12)
  for (const [i, t] of idx.tracks.entries()) {
    for (const k of ['sourceUrl', 'downloadUrl', 'fetch', 'verifiedOn', 'verifiedBy', 'ai', 'm4a']) assert.ok(!(k in t), k)
    assert.equal(t.file, t.id + '.mp3')
    assert.equal(t.licenseUrl, real.tracks[i].licenseUrl)
  }
  const withM4a = indexFor(real, { m4a: new Set(['game']) })
  for (const t of withM4a.tracks) {
    if (t.id === 'game') assert.equal(t.m4a, 'game.m4a')
    else assert.ok(!('m4a' in t))
  }
})

test('serializeManifest round-trips the committed file', () => {
  assert.equal(serializeManifest(JSON.parse(text)), text)
})

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['--pin', '--only', 'a,b', '--out', '/x']), { pin: true, encode: false, check: false, only: ['a', 'b'], out: '/x' })
  assert.throws(() => parseArgs(['--bogus']))
})
