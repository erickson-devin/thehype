#!/usr/bin/env node
// Copies the built-in workout music next to a built app, as workout-music/:
//
//   node scripts/music/stage-music.mjs frontend/dist
//   MUSIC_DIR=/somewhere/files node scripts/music/stage-music.mjs frontend/dist
//
// The source is catalogue/music/files (what fetch-music.mjs wrote: the MP3s, index.json and
// attribution.txt). Tracks are renamed <id>-<sha256[0:12]>.mp3 so the web server can cache them
// immutably, and index.json is rewritten to match. Without an index.json, an attribution.txt or
// any track file nothing is staged and the app simply has no playlist: this never fails a build.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stagePlan } from './lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.argv[2] || 'frontend/dist')
const src = process.env.MUSIC_DIR || path.join(ROOT, 'catalogue/music/files')

const listing = fs.existsSync(src) ? fs.readdirSync(src) : []
const indexPath = path.join(src, 'index.json')
const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null
const plan = stagePlan(indexText, listing)
if (plan.skip) {
  console.log('music: ' + plan.skip)
  process.exit(0)
}

const dest = path.join(out, 'workout-music')
fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })
for (const { from, to } of plan.copies) fs.copyFileSync(path.join(src, from), path.join(dest, to))
fs.writeFileSync(path.join(dest, 'index.json'), JSON.stringify(plan.index, null, 2) + '\n')
console.log(`music: ${plan.index.tracks.length} tracks -> ${path.relative(ROOT, dest) || dest}`)
