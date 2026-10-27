// Hardware keys on the follow-along player: a TV remote, a keyboard, a media key on a headset.
// Only the decisions live here; views/IntervalPlayer.jsx listens and acts on them.

// Where a key belongs to the element rather than to the player (a text field, a slider).
const OWNS_KEYS = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="slider"],[role="spinbutton"]'
// What Enter presses when focus is on it.
const CONTROL = 'button,a[href],[role="button"]'

/**
 * What a media key means: 'toggle', 'skip', 'back', 'end' or null. Play and Pause are one-way, so a
 * second "play" while playing does not pause the clock.
 */
export function mediaKeyAction(key, { paused = false } = {}) {
  switch (key) {
    case 'MediaPlayPause': return 'toggle'
    case 'MediaPlay': return paused ? 'toggle' : null
    case 'MediaPause': return paused ? null : 'toggle'
    case 'MediaTrackNext':
    case 'MediaFastForward': return 'skip'
    case 'MediaTrackPrevious':
    case 'MediaRewind': return 'back'
    case 'MediaStop': return 'end'
    default: return null
  }
}

/**
 * What a key press means on the player: 'toggle', 'skip', 'back', 'more', 'end', or null when it is not
 * one of these keys or not the player's to take. 'more' and 'end' (ArrowDown/ContextMenu and
 * Escape) are TV-only: on a phone or laptop Escape and the arrows keep their own meaning.
 */
export function playerKeyAction(event, { paused = false, rtl = false, tv = false, sheetOpen = false } = {}) {
  if (!event || event.defaultPrevented || event.repeat || event.isComposing) return null
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (sheetOpen) return null
  const target = event.target
  const within = selector => !!(target && typeof target.closest === 'function' && target.closest(selector))
  const media = mediaKeyAction(event.key, { paused })
  if (media) return media   // a media key is the player's wherever focus is
  if (event.key?.startsWith?.('Media')) return null
  if (target?.isContentEditable || within(OWNS_KEYS)) return null
  if (within(CONTROL)) return null
  switch (event.key) {
    case 'Enter':
    case ' ':
    case 'Spacebar': return 'toggle'
    case 'ArrowLeft': return rtl ? 'skip' : null
    case 'ArrowRight': return rtl ? null : 'skip'
    case 'ArrowDown':
    case 'ContextMenu': return tv ? 'more' : null
    case 'Escape': return tv ? 'end' : null
    default: return null
  }
}
