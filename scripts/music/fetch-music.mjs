#!/usr/bin/env node
// Downloads the workout music listed in catalogue/music/manifest.json into catalogue/music/files/
// (gitignored; never committed, see NOTICE.md "Workout music"):
//
//   node scripts/music/fetch-music.mjs                 fetch + verify pinned sha256 (build)
//   node scripts/music/fetch-music.mjs --pin           also record sha256/bytes for unpinned tracks (maintainer)
//   node scripts/music/fetch-music.mjs --check         validate the manifest only, no network (CI)
//   node scripts/music/fetch-music.mjs --encode        also write <id>.m4a (AAC 96k) if ffmpeg is on PATH
//   node scripts/music/fetch-music.mjs --only shiny-tech,game --out /tmp/music
//
// Tracks with a mirrorUrl (this repo's music-v1 release assets) are fetched from the mirror first; the original host is the fallback.
//
// Policy: CC0-1.0 / CC-BY-3.0 / CC-BY-4.0 only, and no AI-generated music. Every entry carries
// "ai": false as an explicit attestation; anything else is refused before a byte is fetched.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { attributionText, fetchCandidates, indexFor, looksLikeMp3, parseArgs, serializeManifest, validateManifest } from './lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = path.join(ROOT, 'catalogue/music/manifest.json')
const USAGE = 'usage: node scripts/music/fetch-music.mjs [--pin] [--check] [--encode] [--only id,id] [--out dir]'

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// Same pattern as api/durable.js: temporary file, fsync, rename, tmp removed on error.
function writeAtomic(file, content) {
  const tmp = file + '.tmp'
  try {
    const fd = fs.openSync(tmp, 'w')
    try {
      fs.writeFileSync(fd, content)
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* never created */ }
    throw e
  }
}

const sniff = (buf) => JSON.stringify(buf.subarray(0, 16).toString('latin1')).slice(1, -1)

async function tryFetch({ url, headers }) {
  const res = await fetch(url, { redirect: 'follow', headers, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${res.url}`)
  if ((res.headers.get('content-type') || '').includes('text/html')) throw new Error(`got an HTML page, not audio (from ${res.url})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!looksLikeMp3(buf)) throw new Error(`not an MP3 (got "${sniff(buf)}")`)
  return buf
}

// Returns { buf, label } from the first source that serves an MP3; throws with every reason otherwise.
async function download(t) {
  const reasons = []
  for (const c of fetchCandidates(t)) {
    try { return { buf: await tryFetch(c), label: c.label } } catch (e) { reasons.push(`${c.label}: ${e.message}`) }
  }
  throw new Error(reasons.join('; '))
}

async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (e) {
    console.error(`${e.message}\n${USAGE}`)
    process.exit(1)
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const errs = validateManifest(m)
  if (errs.length) {
    for (const e of errs) console.error(e)
    console.error(`manifest: ${errs.length} problem(s)`)
    process.exit(1)
  }
  if (args.check) {
    console.log(`manifest: ${m.tracks.length} tracks ok`)
    return
  }
  let tracks = m.tracks
  if (args.only) {
    const ids = new Set(m.tracks.map((t) => t.id))
    const unknown = args.only.filter((id) => !ids.has(id))
    if (unknown.length) {
      console.error(`unknown track id: ${unknown.join(', ')}`)
      process.exit(1)
    }
    tracks = m.tracks.filter((t) => args.only.includes(t.id))
  }
  const out = path.resolve(args.out || process.env.MUSIC_OUT || path.join(ROOT, 'catalogue/music/files'))
  fs.mkdirSync(out, { recursive: true })

  const failures = []
  const verified = []
  let dirty = 0
  let pinned = 0
  for (const t of tracks) {
    const dest = path.join(out, t.id + '.mp3')
    const isPinned = t.sha256 !== null
    try {
      let buf = null
      let source = ''
      if (fs.existsSync(dest)) {
        const have = fs.readFileSync(dest)
        if (isPinned && sha256(have) === t.sha256) {
          console.log(`skip ${t.id} (verified)`)
          verified.push(t)
          continue
        }
        if (isPinned) fs.unlinkSync(dest)
        else if (args.pin && looksLikeMp3(have)) buf = have
      }
      if (!buf && !isPinned && !args.pin) {
        failures.push(`${t.id}: no pinned sha256 — run with --pin (maintainer) and commit the manifest`)
        continue
      }
      const fromDisk = buf !== null
      if (!buf) ({ buf, label: source } = await download(t))
      const hash = sha256(buf)
      if (isPinned && (hash !== t.sha256 || buf.length !== t.bytes)) {
        throw new Error(`sha256 mismatch: expected ${t.sha256}, got ${hash} (bytes ${t.bytes} vs ${buf.length}). The upstream file changed; re-verify the licence, then set sha256/bytes to null and re-run --pin`)
      }
      if (!fromDisk) writeAtomic(dest, buf)
      if (!isPinned) {
        t.sha256 = hash
        t.bytes = buf.length
        dirty++
      }
      verified.push(t)
      console.log(`ok ${t.id} ${Math.round(buf.length / 1024)} KB ${hash.slice(0, 12)}${source ? ` (${source})` : ''}`)
    } catch (e) {
      failures.push(`${t.id}: ${e.message}`)
    }
  }
  pinned = dirty
  if (dirty) {
    writeAtomic(manifestPath, serializeManifest(m))
    console.log(`pinned ${pinned} track(s) in catalogue/music/manifest.json`)
  }

  const m4a = new Set()
  if (args.encode) {
    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    if (probe.error || probe.status !== 0) console.error('--encode: ffmpeg not found on PATH, keeping the MP3s only')
    else {
      for (const t of verified) {
        const mp3 = path.join(out, t.id + '.mp3')
        const dest = path.join(out, t.id + '.m4a')
        if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(mp3).mtimeMs) {
          const tmp = dest + '.tmp'
          const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', mp3, '-vn', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-f', 'mp4', tmp], { stdio: 'inherit' })
          if (r.error || r.status !== 0) {
            try { fs.unlinkSync(tmp) } catch { /* never created */ }
            failures.push(`${t.id}: ffmpeg failed to encode the m4a`)
            continue
          }
          fs.renameSync(tmp, dest)
        }
        m4a.add(t.id)
      }
    }
  }

  if (args.only) console.log('index.json/attribution.txt not written (--only)')
  else if (!failures.length) {
    writeAtomic(path.join(out, 'index.json'), JSON.stringify(indexFor(m, { m4a }), null, 2) + '\n')
    writeAtomic(path.join(out, 'attribution.txt'), attributionText(m))
  }

  for (const f of failures) console.error(f)
  console.log(`music: ${verified.length} ok, ${failures.length} failed -> ${path.relative(ROOT, out) || out}`)
  if (failures.length) process.exit(1)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
