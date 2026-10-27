// Android system back (the gesture and the hardware/nav button are the same event).
//
// Capacitor's BridgeActivity does not handle back at all — without a JS listener the
// activity simply finishes, so a back swipe quit the app from anywhere, whatever the
// WebView history said. That made the sheet history entries from #63 dead weight in the
// packaged app: they only ever worked in a browser tab, where the browser walks history
// itself.
//
// Once a `backButton` listener exists, the plugin stops falling through to finish() —
// back can then ONLY leave the app through App.exitApp(), which is why the last step is
// an explicit press-again-to-exit rather than a silent no-op.
import { MOBILE } from './mobile.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'

// How long a first back press stays armed as "press again to exit" (the toast shows 2.2s).
export const EXIT_WINDOW = 2000

// A screen that owns back while it is mounted (the TV follow-along player: back ends the
// workout rather than leaving the page). A sheet on top still wins. Returns a remover that only
// clears its own function, so a screen unmounting late cannot unset its successor's.
let override = null
export function setBackOverride(fn) {
  override = fn
  return () => { if (override === fn) override = null }
}
export const getBackOverride = () => override

// What a back press means, given what is on screen. Pure, so the table below is testable.
// `atRoot` (the TV home): there is nowhere to go back to, whatever the history says.
export function decideBack({ top, canGoBack, exitArmed, override = null, atRoot = false }) {
  if (top) return top.locked ? 'ignore' : 'sheet'   // a locked sheet swallows back on purpose
  if (override) return 'override'
  if (atRoot) return exitArmed ? 'exit' : 'arm-exit'
  if (canGoBack) return 'history'                   // a page/tab we pushed ourselves
  return exitArmed ? 'exit' : 'arm-exit'
}

export function makeBackHandler({ getSheets, closeSheet, toast, goBack, exit, isRoot = () => false, now = Date.now }) {
  let armedAt = -Infinity
  return (ev = {}) => {
    const sheets = getSheets()
    const action = decideBack({
      top: sheets[sheets.length - 1],
      canGoBack: !!ev.canGoBack,
      exitArmed: now() - armedAt < EXIT_WINDOW,
      override,
      atRoot: !!isRoot(),
    })
    if (action !== 'arm-exit') armedAt = -Infinity
    if (action === 'sheet') closeSheet(sheets[sheets.length - 1].id)
    else if (action === 'override') override?.()
    else if (action === 'history') goBack()
    else if (action === 'arm-exit') { armedAt = now(); toast(t('Press back again to exit')) }
    else if (action === 'exit') exit()
    return action
  }
}

// Registers the listener for the native shell. No-op in web builds, where the browser
// (or the PWA shell) walks history on its own and there is no plugin to talk to.
export async function initBackButton() {
  if (!MOBILE) return () => {}
  try {
    const { App } = await import('@capacitor/app')
    const handler = makeBackHandler({
      getSheets: () => useUI.getState().sheets,
      closeSheet: id => useUI.getState().closeSheet(id),
      toast: msg => useUI.getState().toast(msg),
      goBack: () => window.history.back(),
      exit: () => App.exitApp(),
      // The TV home is the root: back there arms and exits, whatever the history holds.
      isRoot: () => !!useUI.getState().tv && location.hash.split('?')[0] === '#/tv',
    })
    const sub = await App.addListener('backButton', handler)
    return () => sub.remove()
  } catch (e) {
    return () => {}   // no plugin (older install): leave back to the default behaviour
  }
}
