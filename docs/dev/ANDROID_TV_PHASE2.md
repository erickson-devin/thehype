# Android TV — Phase 2: the whole app on the remote, with a voice and music

Implementable plan for **Phase 2 of Epic #30** (Android TV / Google TV). Phase 1 (`710f680d`)
put the follow-along player on the TV: TV detection, media-key forwarding, the two-column
player and spatial navigation inside the open sheet. Phase 2 makes a workout on the TV sound
the way it does on a phone, then makes the rest of the app usable from the sofa.

Design provenance: the Phase 1 hardware test of 2026-10-26 on a Sony BRAVIA 4K VH2
(Android 12, Android System WebView 155), sideloaded debug APK paired to the self-hosted
server, plus a browser pass of the deployed `:edge` image with `?tv=1`. This document is the
hand-off; it describes what to build, not a change already made.

---

## 0. What the hardware test found

| Area | Result on the BRAVIA |
|---|---|
| TV detection (`TvModePlugin`) | ✅ Lands on `#/tv`, `html[data-tv]` set |
| Pairing | ✅ TV keyboard opens on the code field; pairs to a plain-http LAN server on another subnet |
| D-pad | ✅ One `keydown` per press; focus moves as scored; ring clearly visible |
| OK / Back | ✅ OK starts a routine; Back closes the sheet, then asks Finish / Discard (Cancel focused) |
| Play/pause, next, fast forward | ✅ Exactly one `opengym:media-key` per press; no duplicate keydown |
| Previous, rewind | ⚠️ Reach the page as plain `keydown` (`MediaTrackPrevious`, `MediaRewind`); the player ignores them |
| **Spoken cues** | ❌ `speechSynthesis` / `SpeechSynthesisUtterance` are **undefined** in the WebView. Google TTS is installed and is the default engine, but the page cannot reach it |
| **Music** | ❌ Silent. The APK has no playlist (§2); the More sheet drops Music off / Next track |
| Paused state | ❌ The TV player layout shows nothing while paused |
| Focus on load | ❌ Onboarding, sign-in and Settings open with nothing focused |
| Layout | ⚠️ Viewport is **960×540 CSS px at DPR 2**, below the 1000 px desktop breakpoint, so every non-TV screen is the phone layout: bottom sheets reaching the screen edge, a bottom tab bar that spatial nav jumps to (skipping rows behind it) |
| Copy | ⚠️ "Local keeps everything on this **phone**" on the TV |

Still to confirm by hand: the physical BRAVIA remote's play/pause button (adb sent the
standard keycodes; Sony remotes can differ).

---

## 1. Native speech (size M) — first

Without it the TV has no "Get ready", no 3-2-1 and no exercise names: the core of the
follow-along experience.

**Today.** All speech goes through `frontend/src/lib/interval-audio.js`: `synth()` (l.7) returns
null on the TV, so `speak()` (42-63) drops every cue and `speechSupported()` (l.30) hides the
Voice cues section in Settings. `speak()` is fire-and-forget with a flushing queue, a
`speechSeq` guard, a safety timer and `tell(true/false)` for music ducking (`onSpeech`, used by
`music-dom.js:86`). `lib/voice.js` is pure and already takes any voice shaped
`{ name, voiceURI, lang, localService, default }`.

**Build.**

- **`android/.../NativeSpeechPlugin.java`**, `@CapacitorPlugin(name = "NativeSpeech")`, registered
  in `MainActivity.onCreate` beside `TvModePlugin`.
  - `TextToSpeech` created lazily; calls before `onInit` are queued; `shutdown()` in `handleOnDestroy`.
  - `isAvailable()` → `{ available, engine }`.
  - `getVoices()` → voices in the `voice.js` shape (`voiceURI = name = Voice.getName()`,
    `lang = getLocale().toLanguageTag()`, `localService = !isNetworkConnectionRequired()`).
  - `speak({ text, lang, voiceURI, rate, pitch })` with `QUEUE_FLUSH`; `setVoice` when the URI
    matches, else `setLanguage`. Resolves per utterance from `UtteranceProgressListener`:
    `done` / `interrupted` (`onStop`) / `error`. Every call resolves, including flushed ones.
  - `stop()`.
  - No audio focus request: it would pause the WebView's `<audio>`; ducking stays in JS.
- **Manifest:** add an `android.intent.action.TTS_SERVICE` `<intent>` to `<queries>`. Package
  visibility (targetSdk 35) can otherwise stop the engine binding. Verify on the BRAVIA.
- **`src/lib/native-tts.js`** (+ test): lazy loader in the `lib/tv.js` pattern (object wrapper
  around `registerPlugin`, never the bare proxy — the #42 hang; `isAndroid()` gate; timeout).
  `probeNativeSpeech()`, `nativeSpeak(opts) → Promise<'done'|'interrupted'|'error'>`, `nativeStop()`.
- **`interval-audio.js`:** pick the backend: web when `speechSynthesis` exists, otherwise native
  once the probe succeeds. Keep `speechSeq`, `tell()` and the safety timer on the native path;
  `stopSpeaking()` also calls `nativeStop()`; `availableVoices()` returns the native list and
  bumps `voicesVersion` when it arrives; `speechSupported()` = web || native. Export
  `primeSpeech()` and call it once at boot (MOBILE only) so the first cue and Settings see the
  result.
- **Settings:** `ctx.speech` (`Settings.jsx:397`) must re-render when the probe lands
  (subscribe to `onVoicesChanged`). The footer copy at l.518 is iPhone-specific.
- **`voice.js`:** Google TTS names look like `en-us-x-iol-local`; extend `voiceTier` / labels so
  "Automatic" prefers a good local voice and the picker shows readable names.

**Tests.** Native-backend cases in `interval-audio.test.js` (mock `./native-tts.js`);
`native-tts.test.js`; a `tv-native.test.js`-style source check for the plugin registration and
the manifest query.

**Accept on the BRAVIA.** Settings → Workout shows Voice cues and lists Google voices; picking
one speaks; a follow-along workout says "Get ready", the exercise name and 3-2-1; music ducks
under speech once §2 lands.

**Decision.** On Android *phones*, keep web speech where it exists (minimal change, saved
`gym_voice` keeps working) or always prefer native (same voices as system settings, more
reliable)? Recommendation: **native only where web speech is missing** for this phase.

---

## 2. Music from the paired server (size S–M) — moved up from Phase 3

**Why it is silent.** The playlist is `appBase() + 'workout-music/index.json'`
(`music-dom.js:25-38`). The tracks (~102 MB) are staged only into the web image
(`web/Dockerfile:34-36`, served by nginx at `/workout-music/`), deliberately not into the APK.
In the APK that request goes to `https://localhost/workout-music/index.json`, Capacitor answers
with `index.html`, the JSON parse fails and the playlist is `[]`, so `musicRow` is false
(`IntervalPlayer.jsx:180`) and nothing plays.

**The paired server already has it.** `<server>/workout-music/index.json` on the `:edge` image
returns the 12-track playlist. `<audio>` from the `https://localhost` page to an `http` server
is allowed (`allowMixedContent: true`, cleartext permitted, autoplay without gesture). One
blocker: nginx sends **no CORS headers** on `/workout-music/`, so a WebView `fetch` of the
index fails.

**Build.**

- `music-dom.js`: a `musicRoot()` that is the paired server's base when MOBILE and remote,
  else `appBase()`; use it for the index, `setSrc` and the attribution link
  (`IntervalPlayer.jsx:382`). Feed the base with a small `setMusicBase()` called beside every
  `setRemoteAuth` (`useStore.js:1857`, `remote.js:42/51/61`), so music-dom does not import
  `api.js`.
- Fetch the index with the existing `capacitor-fetch.js` (`nativeFetch`, no CORS) on MOBILE.
  The audio files need no CORS.
- `loadBuiltinPlaylist` caches its first result forever: key the cache by base and reload on
  connect / forget, or an early `[]` at boot sticks.
- Local mode, or a server without music, stays silently at `[]` as today.

**Licence (required before enabling).** The tracks are CC BY: title, artist and licence must be
on screen. The TV player layout (`IntervalPlayer.jsx:339-352`) has no now-playing line; render
`nowPlayingLine(music.track, t)` there (§3a).

**Caveats.** A server behind Cloudflare Access cannot serve `<audio>` (no service-token headers
on media elements): document it. A `musicDeepLink` (`spotify:` etc.) would navigate the TV's
WebView away: ignore deep links in TV mode.

**Tests.** `music-dom.test.js` already injects `fetchFn` and base: add remote-base and
base-change cases.

**Accept on the BRAVIA.** Music plays during a follow-along workout, ducks under speech, the
More sheet shows Music off / Next track, and the title and artist are on screen.

---

## 3. Player polish (size S–M)

**a) Paused state.** The TV branch of `IntervalPlayer.jsx` never reads `paused` (l.64) and the
hint (l.349) is fixed. Add a dimmed count with a "Paused" badge (`aria-live`), switch the hint
to "OK Resume · …", and add the now-playing line from §2. Test with `useUI.tv = true`.

**b) Previous / rewind → back.** No "previous" exists yet.
- `lib/interval-schedule.js`: pure `backBlock(blocks, clock, now)` (+ test). More than ~3 s
  into a block restarts it; otherwise jumps to the start of the previous block and clears its
  `cuts[i]`. Works while paused (shift `pausedMs`).
- `lib/player-keys.js`: `MediaTrackPrevious` and `MediaRewind` → `'back'` (they already arrive
  as keydown). Decide whether ArrowLeft also means back on TV (mirrored in RTL).
- `MainActivity.mediaKeyName`: add `KEYCODE_MEDIA_PREVIOUS` and `KEYCODE_MEDIA_REWIND` so all
  media keys come one way; update `tv-native.test.js`.
- IntervalPlayer: `back` action; set `lastElapsed` so work-ended logic does not re-fire; a nonce
  so a restarted block re-announces; wire `onPrevious` into the media session; update the hint
  and `docs/MOBILE.md`.

---

## 4. Focus on every screen (size S)

One hook in `App.jsx` `Shell`, deps `[tv, pathname, authed, needsMobileOnboarding]` (Login and
Onboarding replace the routes without changing the path; TV detection resolves late, so `tv`
must be a dep). It acts only when focus is on `body` (or detached) and no sheet is open, so
screens that focus themselves win (child effects run first). Run it in a
`requestAnimationFrame` plus one retry for late content. Target: `[data-autofocus]`, else the
first button or link in `#app`, never an input (it would raise the TV keyboard) and never
`#tabbar`. The pure picker goes in `lib/tv-focus.js` with a test, reusing `focusables`.

Also: `data-autofocus` on the primary buttons of `MobileOnboarding` and `Login`;
`Modals.jsx:216` falls back to the picker when the element to restore is gone; `ConnectSheet`
(`MobileOnboarding.jsx:93`) must not auto-focus its input on TV (it races sheet focus and pops
the keyboard).

---

## 5. Ten-foot layout (size M)

All TV styling is the `html[data-tv]` block (`index.css:933-953`); at 960 px everything else is
the phone layout.

- **Centered dialogs.** `html[data-tv] .sheet` centered, `width: min(640px, 80vw)`,
  `max-height: 85vh`, rounded, pop-in instead of `sheetup`, `.grab` hidden; override the
  `[data-native-kb] .sheet` bottom rule. Fixes the More sheet's last row sitting 20 px from the
  bottom edge, where TVs can overscan. Check with the TV keyboard up.
- **Side rail.** `html[data-tv] #tabbar` as a vertical left rail and `#app`
  `margin-inline-start`. Fixes spatial nav jumping to the bottom bar and skipping rows behind it.
  `TabBar.jsx` can stay as is.
- **Scroll margin.** Spatial nav scrolls with `block: 'center'` so a focused row is never under
  a fixed element (rail, RestTimer, SyncBanner, Toast).
- **Ten-foot pass per screen.** TvHome (fills a quarter of the screen; header spacing), the
  player at 960×540, Settings and its sub-pages, Home, Plan, Stats, History, Library, Coach.
  Each gets: reachable by D-pad, sensible first focus, Back works, nothing in the outer 5 %.

---

## 6. Copy (size S, touches every locale)

"This phone" on the TV: `MobileOnboarding.jsx:56, 106, 142`, `Settings.jsx:614, 881, 961`,
`CoachSetup.jsx`. Use device-neutral wording (`t('Use on this device')` already exists) or TV
variants. New strings need every locale pack (`check-source-strings.mjs`, `check-locales.mjs`).
Fix `docs/MOBILE.md` Known limits: speech needs the native plugin; music streams from the paired
server.

---

## 7. Reverse QR pairing (size L) — last, separable

Today the TV types a code made in a signed-in browser (`/api/pair/create` → `/api/pair/redeem`,
`api/server.js:2163-2193`). Reverse it so the TV shows a QR and a phone approves:

1. `POST /api/pair/request` (anonymous, CSRF-exempt, rate-limited, capped in-memory map) →
   `{ code, secret }`.
2. The TV shows a QR for `<server>/#/pair-tv?code=…` (`lib/qr.js`, lean-qr, already a
   dependency) and polls `POST /api/pair/claim { code, secret }`: 202 pending, 200
   `{ token, user }` once, 400 expired.
3. The signed-in phone opens the link and confirms with `POST /api/pair/approve { code }`
   (session cookie, origin-checked, not exempt).

Also openapi.yaml, api tests, logout-all cleanup, audit events. The TV still needs the server
address first (`VITE_DEFAULT_SERVER` or typed once). Today's typed-code flow worked on the
BRAVIA, so this is a convenience, not a blocker.

---

## 8. Order and what moves where

| # | Work | Size | Native change |
|---|---|---|---|
| 1 | Native speech | M | yes (plugin + manifest) |
| 2 | Music from paired server + TV now-playing line | S–M | no |
| 3 | Paused state, previous/rewind | S–M | small (`mediaKeyName`) |
| 4 | Focus on every screen | S | no |
| 5 | Centered dialogs, side rail, ten-foot pass | M | no |
| 6 | Device-neutral copy, MOBILE.md | S | no |
| 7 | Reverse QR pairing | L | no (API + UI) |

1–3 make a workout on the TV complete and can ship together as one APK test. 4–6 are the
whole-app pass. 7 can slip to Phase 3 without hurting anyone.

**Phase 3 after this:** TV banner art, pointing the updater at the fork, sharper exercise
clips (180 px today looks soft on a big screen). Music streaming moved into Phase 2.

---

## 9. Testing on the TV

Needs JDK 21, Node 22 and the Android SDK (platform 35, build-tools, platform-tools). Put
`VITE_DEFAULT_SERVER=<your server>` in `frontend/.env.local`, then `cd frontend && npm run
build:mobile`. Its `cap sync` also syncs iOS and fails without CocoaPods; if so, finish with
`npx cap sync android && node scripts/check-mobile-bundle.mjs`. Then
`cd android && ./gradlew assembleDebug`. Gradle 9.7.1 with AGP 8.7.2 builds.

`adb connect <tv>:5555`, `adb install -r app/build/outputs/apk/debug/app-debug.apk`. Drive keys
with `adb shell input keyevent KEYCODE_DPAD_* | KEYCODE_MEDIA_*`. The debug build's WebView is
inspectable: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` and read the page
over the DevTools protocol (or `chrome://inspect`).
