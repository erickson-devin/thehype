// Where focus lands when a sheet opens on a TV: the d-pad cannot reach a control it has not
// started from, so the sheet picks a sensible first one.

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [role=button]'
const visible = el => !!(el.offsetParent || (typeof el.getClientRects === 'function' && el.getClientRects().length))

/** The focusable, visible elements inside `scope`. */
export function focusables(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return []
  return [...scope.querySelectorAll(FOCUSABLE)].filter(visible)
}

/**
 * `[data-autofocus]` first; a destructive confirm (a `.btn.danger`) lands on its LAST button,
 * Cancel, so one stray OK never discards anything; otherwise the first focusable.
 */
export function pickInitialFocus(root) {
  if (!root || typeof root.querySelector !== 'function') return null
  const auto = root.querySelector('[data-autofocus]')
  if (auto) return auto
  const all = focusables(root)
  if (!all.length) return null
  if (root.querySelector('.btn.danger')) {
    const buttons = all.filter(el => el.tagName === 'BUTTON')
    if (buttons.length) return buttons[buttons.length - 1]
  }
  return all[0]
}
