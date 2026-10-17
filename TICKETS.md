# Stabilization backlog

Findings from the codebase audit of 2026-10-17 that were out of scope for a quick fix: larger
changes, architectural work, or items that need a product decision. The quick fixes from the same
audit landed as the `fix(api)`, `fix(frontend)` and `fix(mcp)` commits of that date.

Each row is meant to become one GitHub issue. Remove a row when its issue exists, or when the
work lands. Sizes: S = under a day, M = a few days, L = a week or more.

## P1 — bugs and security

| # | Title | Label | Size | Notes |
|---|---|---|---|---|
| 1 | Add a process-level `unhandledRejection` handler to `api/server.js` | bug, security | S | Nothing is registered today, so any future floating promise exits the process (Node 22 default). Decide: log and keep serving, or exit deliberately and document the container restart policy. |
| 2 | Per-route body caps for anonymous routes | security | S | The 5 MiB `MAX_BODY` applies to the unthrottled, CSRF-exempt `/api/login/verify`, `/api/register/*` and `/api/pair/redeem`, so each junk request costs a 5 MiB JSON parse. Let `readBody(req, max)` take a cap (~64 KiB for auth routes). |
| 3 | Throttle `POST /api/push/test` and subscribe churn | security | S | A signed-in user can make the server send unlimited outbound HTTPS requests to up to 20 hosts of their choice. Add a per-user `createWindow`, as the media routes do. |
| 4 | `clientIp()` should honour `TRUST_PROXY` | security | S | `api/server.js` `clientIp()` trusts the leftmost `X-Forwarded-For` / `CF-Connecting-IP` regardless of `TRUST_PROXY`, so audit-log addresses are forgeable on deployments exposed without the bundled nginx. Reuse `limitAddress`'s trust rule. |
| 5 | Admin *disable* should stop the user's in-flight work | bug | S | `POST /api/admin/user/disable` drops presence and device links but leaves pending rest-timer pushes and queued/running Coach jobs (which keep spending provider budget). Delete already does this; disable should too. |
| 6 | Bound and abort the coach HTTP adapter's body read | bug | M | `api/coach/core/adapters/http.js` clears its timer and the forget-abort listener once headers arrive; `res.text()` then has no deadline or size cap, so a slow or huge provider response pins a job slot past `TIMEOUT_MS` and dodges `clearUser`. Cap at ~4 MiB (matching `spawn.js`). Shared with the phone build. |
| 7 | Restrict the Coach key store to native platforms | security | S | `frontend/src/lib/coach-secrets.js` uses the secure-storage plugin whenever it imports; its web build stores in localStorage, not the in-memory map the design intends. Gate on `Capacitor.isNativePlatform()`. |
| 8 | `nextDropWeight` when no lighter loadable weight exists | bug, decision-needed | S | The grid-function path in `lib/workout-model.js` skips the "never at or above prev" guard: a drop from a bare bar or the lightest dumbbell suggests the same weight, and planned drops then repeat it. Decide: suggest 0, the raw value rounded, or "no drop". |
| 9 | Unit switch should snap increments to the target unit's grid | bug, decision-needed | S | `lib/units.js` converts `inc` like a weight: 2.5 kg → 5.5 lb, 5 lb → 2.25 kg; progression then walks off the plate grid. The code comment says "2.5 kg is 5 lb" but `units.test.js` asserts 5.5. |
| 10 | PR rule inconsistency for per-side rows | bug | S | `finishRecords()` counts a set only when `s.done` (both sides) while `bestWeightForEntry` counts a partly completed side, so a session can advance `exWeights` without awarding a PR badge. |
| 11 | `sync-changes` fingerprint drift | bug (unverified) | S | Server-only keys (`_wid`, `_wids`, `_unstamped`, `_prior`) and `undone`/`resetIds` are hashed into the settings bucket, so a merged copy may report a false "1 change not on your server" at sign-out. Verify with a test, then add them to `NOT_CONTENT`. |

## P2 — the Hype vision (product decisions)

| # | Title | Label | Size | Notes |
|---|---|---|---|---|
| 12 | Put the Hype persona into the Coach prompt | feature, decision-needed | M | `api/coach/core/system-prompt.js` still says "You are the openGym Coach" and the task prompts are neutral; none of the persona promises reach any provider. The prompt must stay identical across adapters (prefix caching, `coach-parity.test.js`) and keep the medical-safety lines. |
| 13 | In-workout hype without an AI provider | feature | L | PR celebration and rest-period focus do not exist; the Coach is reachable only from the Plan menu and is invisible on a default install with no provider. A pure, tested `lib/hype-lines.js` fired on PR detection (`finish-workout.js`), rest-timer start and interval cues would deliver the persona on every install with no dependencies. |
| 14 | Offer a "Hype me up" debrief / PR card in the finish flow | feature | M | Debriefs only happen when the user asks from the chat menu. When the Coach is available and the session set PRs, the finish flow could offer one (`requestDebrief`). |
| 15 | Add a `hype` nudge tone | feature | S | `NUDGE_TONES` is `friendly`, `guilt`, `drill`. The missed-workout nudge is the one place consistency encouragement already exists. |
| 16 | The Coach does not know about follow-along mode | decision-needed | S–M | `add-routine` and `canonicalPlan` in `lib/coach.js` drop `auto`, `autoWorkSec` and `autoRestSec`, so a Coach-built plan never runs as follow-along and the Coach cannot reason about interval routines. |
| 17 | Music webhook transport | bug, decision-needed | S–M | Every example (Settings, tests, docs) is `http://192.168…`, which an HTTPS PWA and the Android app both refuse, and the failure is silent by design. It is also a GET where Home Assistant expects POST. Options: warn in Settings when the URL is http on an HTTPS page, change the examples, offer a method choice, or proxy through the api (needs SSRF review). |
| 18 | Music only starts for follow-along routines | decision-needed | S | `sheets.jsx` `beginWorkout` triggers music only when `auto` is set. Users may expect it for every workout. |
| 19 | Follow-along in the background or with the screen locked | feature, decision-needed | M–L | Time beyond the current block is lost on return (the player advances exactly one block), and Web Audio / Speech are throttled when hidden. Options: Media Session API, a native cue path (the `RestTone.java` pattern), or auto-advancing through missed blocks — which would auto-tick sets the user never did, so it needs a product call. |
| 20 | Per-profile Coach credentials (`authMode: 'profile'`) are half-built | feature, decision-needed | L | `saveProfileAuth` and `credentialFor`'s profile branch exist, but no route switches the mode or connects/clears a profile credential (`api/coach/routes.js`, "deliberately absent" comment). Either build them or remove the dead branch. |
| 21 | Rebrand the Coach docs for the fork | tech-debt | S | `docs/AI_COACH.md` and the in-app "Coach" naming are unchanged upstream openGym; nothing describes Hype behaviour. Do after #12 and #13 so the docs describe real behaviour. |

## P3 — tech debt and test coverage

| # | Title | Label | Size | Notes |
|---|---|---|---|---|
| 22 | One state-shape normalizer for every way state comes in | tech-debt | M | The audit only sanitized the backup-import path (`sanitizeWorkoutShape`). Server pull, file-mirror restore and tab join can still deliver `null` workouts or entries without `sets`. A `normalizeState()` in `lib/` run from `loadState`/`persist` closes the class. |
| 23 | Unify file persistence and fix mutate-before-save | tech-debt | M | `media.js` `writeMarks` still has its own write path, and in-memory `db` is mutated *before* `saveDb()`, so a failed save leaves memory ahead of disk (e.g. `register/verify` pushes the user, the save throws, the client gets a 500, the user exists in memory anyway). Consider save-then-commit or rollback. |
| 24 | `envInt(name, default, min)` helper with a warning on garbage | decision-needed | S | `AUDIT_MAX=abc` / `AUDIT_DAYS=abc` silently mean "no cap"; `PORT=abc` fails at listen with a generic error; numeric settings use inconsistent idioms. Document in `docs/SELF_HOSTING.md`. |
| 25 | Cost of `update()` / `persist` on large histories | tech-debt (perf) | M–L | Every set tick deep-clones the whole state, stringifies it again for persist, and JSON-compares in `stampChange`/`sameCopy`/`joinSaved` (`store/useStore.js`). Profile with ~2,000 workouts on a mid-range phone before optimizing. |
| 26 | `GET /api/admin/users` cost | tech-debt | S | Runs a synchronous `readState` (full JSON parse) per user on every dashboard load instead of `readStateCached`; blocks the event loop on multi-MB states. |
| 27 | HTTP tests for admin invites, audit clear and push unsubscribe | test-coverage | S | Zero tests today: invites `new`/`revoke` (used code → 400, unknown → 404, case-folding, note truncation), `audit/clear` (id gap kept, the clear is audited), `push/unsubscribe` (cannot remove another user's endpoint). Use the `server-admin-state.test.js` harness. |
| 28 | Make `openapi-routes.test.js` check more than route names | test-coverage | M | It does not catch a route documented without its 401/403/409 codes, conditionally mounted routes (password/media become 404 when their flag is off), or schema drift. |
| 29 | IntervalPlayer coverage and logging correctness | test-coverage, bug | S | Add tests for resume-after-reload (blocks rebuilt from undone sets), the routine deleted mid-session, per-side sets, timed and cardio logging. Decide whether cardio blocks should record `min` and whether timed detection should use the same mode check as `workSecFor`. |
| 30 | MCP robustness | tech-debt, test-coverage | S | `mcp/src/state.js` `init()` sets `_uid` before `reloadDb()`, so a corrupt `db.json` leaves it half-initialised. Add tests for corrupt `db.json`, mtime reload, a `null` element in `workouts`, and an `OPENGYM_UID` with filename-unsafe characters. |
| 31 | `units.js` per-side rows and `fmtDateRange` have no tests | test-coverage | S | Cases where `convertStateUnit` converts `sides.L`/`sides.R` (with drops) and resyncs the aggregate `w`; `fmtDateRange` spanning two years or the current year. |
| 32 | Stale comments | tech-debt | S | `api/coach/config.js` ("this PR ships only the in-repo fixture" — real providers are in the table); `frontend/src/views/IntervalPlayer.jsx` catch-up claim (see #19). |
