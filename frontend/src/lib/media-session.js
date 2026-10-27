// Lock-screen / notification media controls for the follow-along player. mediaMetadataFor and
// positionStateFor are pure; publishMedia and bindMediaActions are guarded adapters over
// navigator.mediaSession that do nothing where it does not exist.
const FALLBACK_ART = { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }

const workOrdinal = (blocks, idx) => {
  let n = 0
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === 'work') n++
    if (i >= idx && blocks[i].kind === 'work') return n
  }
  return n
}

export function mediaMetadataFor(blocks, idx, { nameOf, artworkOf, t, sessionName }) {
  const b = blocks[idx]
  if (!b) return null
  const nextWork = blocks.slice(idx + 1).find(x => x.kind === 'work')
  const upcoming = b.kind === 'work' ? nextWork : blocks.slice(idx).find(x => x.kind === 'work')
  const total = blocks.filter(x => x.kind === 'work').length
  const shownId = b.kind === 'work' ? b.id : upcoming?.id
  let title, artist
  if (b.kind === 'work') {
    title = nameOf(b.id)
    artist = nextWork ? t('Work {0} s · Up next: {1}', b.sec, nameOf(nextWork.id)) : t('Work {0} s · Last one!', b.sec)
  } else if (b.kind === 'ready') {
    title = t('Get ready')
    artist = t('First up: {0}', upcoming ? nameOf(upcoming.id) : '')
  } else {
    title = t('Rest')
    artist = t('Rest {0} s · Up next: {1}', b.sec, upcoming ? nameOf(upcoming.id) : '')
  }
  const src = shownId != null ? artworkOf(shownId) : null
  const artwork = src ? [{ src, sizes: '512x512', type: /\.webp(\?|$)/.test(src) ? 'image/webp' : 'image/png' }] : [FALLBACK_ART]
  return { title, artist, album: t('{0} · Set {1} of {2}', sessionName, workOrdinal(blocks, idx), total), artwork }
}

export function positionStateFor(block, leftMs) {
  if (!block) return null
  const position = Math.min(block.sec, Math.max(0, block.sec - leftMs / 1000))
  return { duration: block.sec, position, playbackRate: 1 }
}

const session = () => (typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined' ? navigator.mediaSession : null)

export function publishMedia(meta, { playing, position } = {}) {
  const ms = session()
  if (!ms || !meta) return
  try { ms.metadata = new MediaMetadata(meta) } catch { /* unsupported artwork or shape */ }
  try { ms.playbackState = playing ? 'playing' : 'paused' } catch { /* ignore */ }
  if (position) { try { ms.setPositionState(position) } catch { /* out-of-range or unsupported */ } }
}

const set = (ms, action, fn) => { try { ms.setActionHandler(action, fn) } catch { /* unsupported action */ } }

export function bindMediaActions({ onPlay, onPause, onNext, onPrevious }) {
  const ms = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
  if (!ms) return () => {}
  set(ms, 'play', onPlay)
  set(ms, 'pause', onPause)
  set(ms, 'nexttrack', onNext)
  set(ms, 'previoustrack', onPrevious)
  for (const a of ['seekto', 'seekbackward', 'seekforward']) set(ms, a, null)
  return () => { for (const a of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward']) set(ms, a, null) }
}
