# AUDIT-FINDINGS.md — Three-persona journey audit (2026-07-27)

Audit run, no feature work — three personas independently walked the full
first-open → sign-out journey against the 10-rule rulebook below, each via
headless Playwright harnesses driving the real app source files (not a live
Supabase backend — noted per-finding where that matters).

**Triage decision (2026-07-27, same day)**: fix all 6 blockers (F1–F6) plus
the systemic F7 annoyance (one shared `friendlyError()` helper) in one batch,
per-step commits, with a permanent automated test added for every finding that
maps to a rulebook rule. Also included: the two quick jargon wins from the
polish list (F12, F14). Everything else (F8–F11, F13, F15–F18) is
**deferred** — triaged, not forgotten; see each finding's status line below.
All fixes are pushed to `redesign`; commit refs are per-finding below.

**Personas:**
- **Roy** — 60, expert shooter (ballistics vocabulary is his language, not
  jargon), not tech-savvy, one-finger typist, brand-new account.
- **Collector** — 50 rifles, ~200 loads, lots of history. Lens: does this
  hold up at scale, or was it only ever tested against 1-2 rifles of demo data.
- **Offline user** — returning account, mid-session at the range, no signal
  from cold launch through reconnect. Lens: does every save tell the truth.

**The rulebook:**
1. Every screen has an obvious way back/home. No roach motels.
2. Every flow launched from a rifle inherits that rifle — no picker, wrong-rifle entry impossible.
3. No flow can dead-end on missing data (no load, no zero, no rifle) — always an inline "create it now" path.
4. Every zero-state coaches: plain words for what to do next, and tapping it goes there.
5. Everything needed mid-flow is reachable mid-flow without losing progress.
6. One gold button per screen; secondary = text links; nothing important hidden behind an unlabeled tap.
7. Roy-language everywhere: no jargon a non-tech expert shooter wouldn't say out loud.
8. Anything with 50+ items must be a scrollable/searchable list, never a swipe or carousel.
9. Nothing destructive without confirm + undo.
10. Offline: every save states its status honestly.

**Verification key**: **[LIVE]** = actually rendered/clicked via a headless
Playwright harness against the real source, screenshotted or DOM-inspected.
**[SOURCE]** = traced by reading the code; not runtime-exercised this pass.
**[N/A-LIVE]** = requires a live Supabase backend unavailable in this sandbox.

**Testing infrastructure note**: this project's only test convention is
plain-Node `tests/test-*.js` (zero dependencies, by design — see CLAUDE.md's
no-build-tools rule). Several findings below are only fully verifiable with a
real DOM/click harness (Playwright), which has no permanent home in this
repo's test suite today — every session this project has used *scratchpad*
Playwright harnesses for verification, then encoded what they can as
structural source-text checks in `tests/test-screen-nav.js`. Where a finding
says "testable structurally," that means the `test-screen-nav.js` pattern
applies directly. Where it doesn't, that's flagged explicitly — it's a real
gap in what this project's test suite can express, not a reason to skip the
fix.

---

## Summary (triage order)

| # | Severity | Screen | Persona(s) | Rule(s) | One-line | Status |
|---|---|---|---|---|---|---|
| F1 | Blocker | View 1 drop chart | Roy | 3, 4 | Chart card freezes on "loading" forever for any ammo-less rifle | **Fixed** — `3f7dddc` |
| F2 | Blocker | History → session list empty state | Collector | 2 | "Check a target" drops rifle context, opens the blind all-rifles picker | **Fixed** — `c0b5fff` |
| F3 | Blocker | Session flow picker fallback | Roy | 2, 3 | No-load rifle → Add → Paper lands on an unbiased, flat all-rifles picker | **Fixed** — `ad85193` |
| F4 | Blocker | Rifle switcher overlay (view 1) | Collector | 8 | The app's designated primary switcher has no search at 50 rifles | **Fixed** — `b93b070` |
| F5 | Blocker | Record edit/delete (view 7) offline | Offline | 7, 9, 10 | Editing/deleting a logged shot offline always hard-fails with a raw, alarming error | **Fixed** — `87741e5` |
| F6 | Blocker | Chrono import offline | Offline | 3, 5, 10 | Import bypasses existing offline-queue plumbing; a parsed file is lost, not queued | **Fixed** — `1a29ea9` |
| F7 | Annoyance→Blocker (screen-dependent) | App-wide catch handlers | Offline, Roy | 7 | Raw `err.message` / "Failed to fetch" leaks into user-facing text everywhere | **Fixed** — `ea3a6e0` (helper), `87741e5` (wired in) |
| F8 | Annoyance | Record view (view 7) deletes | Roy | 9 | Confirm exists; undo does not, across 4 record types | Deferred |
| F9 | Annoyance | View 1 coaching → Why screen | Roy | 3, 4 | "Add your bullet & box speed" coaching has no 1-tap path to actually do it | Deferred |
| F10 | Annoyance | Paperwork → Loads list | Collector | 8 | No search regardless of load count | Deferred |
| F11 | Annoyance (open question) | Session flow blind picker | Collector | 2, 8 | If reached, renders every rifle's every load unsearchably; reachability unconfirmed | Deferred (reachability narrowed — see note) |
| F12 | Polish | Session flow step 3 | Roy | 7 | "px/in" unit jargon in calibration success messages | **Fixed** — `40ae7ea` |
| F13 | Polish | Session flow step 3 | Roy | 7 | Inconsistent terms: "Set scale" / "calibration" / "Calibrated" | Deferred (explicitly out of scope — no renames this batch) |
| F14 | Polish | Chrono import copy | Roy | 7 | "CSV or XLSX" file-format jargon | **Fixed** — `40ae7ea` |
| F15 | Polish | Categories menu labels | Roy | 7 | "Device export" / "Export data" read as developer terms | Deferred (explicitly out of scope — no renames this batch) |
| F16 | Polish | View 1 dots row | Collector | 8 (spirit) | Illegible smear at 50 rifles (already non-interactive, cosmetic only) | Deferred |
| F17 | Polish (scope question) | Admin dashboard | Roy | 7 | Raw developer labels ("Database", "Month qs") — is Rule 7 in scope for admin-only screens? | Deferred (scope question unresolved) |
| F18 | Polish | Admin dashboard tables | Collector | 8 | No search on per-user/usage tables | Deferred |

---

## Blockers

### F1 — Drop chart silently freezes on "loading" forever when the rifle has no ammo yet
- **Screen**: THE RIFLE / view 1 (`js/rifle-app.js`, `_fillChart`)
- **Persona**: Roy — **[LIVE]**
- **Rule(s)**: 3 (no dead-end on missing data), 4 (zero-state coaching)
- **Status**: **Fixed** — `3f7dddc`. `_fillChart()`'s three early-returns now route through a shared `_noChartYet()` coaching fallback; the card's tap target opens a new `_openAmmoForm()` mini-screen directly (reusing `NewAmmoForm`) instead of Full Chart. Permanent test: `tests/test-screen-nav.js` ("View 1 drop chart… never hangs", "chart card taps straight to ammo creation").
- **Description**: `_fillChart()` silently `return`s when `!g.load || !g.load.bulletBC`, leaving the DROP CHART card on its initial loading placeholder (a blank row with "…") forever — never resolving into data or a coaching message. This is the very first screen a brand-new user sees if they skip the onboarding ammo step. Screenshot: `audit-roy-1-home-noload.png`.
- **Proposed fix**: when there's no BC/velocity, replace the chart card body with a one-line coaching message ("Add your bullet & box speed to see your drop chart") that taps straight into ammo creation.
- **Testable**: structurally — assert `_fillChart`'s early-return branch is followed by a fallback UI write, not a bare `return`.

### F2 — "Check a target" (History empty state) drops rifle context, opens the blind picker
- **Screen**: History → session list, `HistoryManager.prototype._renderSessionList` (`js/history.js` ~line 137-139)
- **Persona**: Collector — **[LIVE]**
- **Rule(s)**: **2** (flows launched from a rifle must inherit that rifle)
- **Status**: **Fixed** — `c0b5fff`. Now calls `SessionLaunch.start({ rifleId: rifle.id })`. Audited every other `AppNav.go('session')` call site while fixing this one — all others are either already correct (`profiles.js`, `rifle-add.js`, `rifle-why.js` already use `SessionLaunch.start` as primary) or legitimately rifle-less by design (Misc Sessions). `js/ladder.js`'s "Run a ladder test" overlay has a similar-looking blind call but `rifle` isn't in scope in that function at all — flagged as a possible sibling but unconfirmed, not fixed (out of this batch). Permanent test: `tests/test-screen-nav.js` ("History's 'Check a target'…").
- **Description**: This function is unambiguously rifle-scoped (`rifle.id` used elsewhere in the same function, e.g. the back button). But its empty-state "Check a target" button does `AppNav.go('session')` — the blind entry, no `rifleId` — instead of `SessionLaunch.start({ rifleId: rifle.id })`, which the sibling "Confirm zero" button in `js/profiles.js`'s `_renderRifleDetail` already does correctly with the same data in scope.
- **Proposed fix**: change to `SessionLaunch.start({ rifleId: rifle.id })`, keeping the `AppNav.go('session')` fallback only for the theoretical case `SessionLaunch` is undefined, matching every other call site's pattern.
- **Testable**: structurally — assert this function's source does not call `AppNav.go('session')` without a preceding `SessionLaunch.start({ rifleId:` in the same handler.

### F3 — SessionLaunch's no-load fallback leaves an unbiased, flat all-rifles picker as the recovery UI
- **Screen**: Session flow step 1 / profile picker (`js/session-flow.js` `_renderProfilePicker`, `js/app.js` `SessionLaunch.start`)
- **Persona**: Roy — **[SOURCE]** (session-flow.js needs the full canvas/session DOM scaffolding, not built in this pass)
- **Rule(s)**: **2**, 3
- **Status**: **Fixed** — `ad85193`. `SessionLaunch.start` now fetches the rifle alongside its loads/sessions and, when there's no ammo, renders the picker scoped to just that rifle (which already offers "+ New ammo" per rifle group). A genuine race was also found and fixed: `_loadProfilePicker`'s flat render fires synchronously inside `switchView('session')`, before the scoped lookup resolves, and could win the race on a fast connection — a new `_scopedLaunchPending` flag makes the flat picker skip itself whenever a scoped launch is in flight, verified against a worst-case-timing harness (the flat picker's chain deliberately made faster). Permanent tests: `tests/test-screen-nav.js` ("SessionLaunch.start… flags a pending scoped launch", "_loadProfilePicker… yields to a pending scoped launch").
- **Description**: `SessionLaunch.start({rifleId})`'s auto-select bails out silently (`if (!loads.length ...) return;`) when the origin rifle has zero loads, leaving `switchView('session')`'s unconditional `_loadProfilePicker()` call as the only visible UI — a flat list of **every** rifle the user owns, with no highlighting, filtering, or indication of which rifle was meant. Invisible on a 1-rifle account; a real wrong-rifle risk the moment an account has 2+ rifles and taps Add → Paper on an ammo-less one.
- **Proposed fix**: when auto-select can't complete, still constrain/highlight the picker to the origin rifle's group, or render it in "add ammo for THIS rifle" mode instead of a flat all-rifles list.
- **Testable**: partially structurally (assert the failure path doesn't fall through to the generic picker with no rifle hint); full verification needs a DOM harness with a 2-rifle fixture where only one has zero loads.
- **Cross-reference**: F2 is one concrete way this fallback gets reached; F11 (below) is what the fallback screen itself looks like at scale.

### F4 — Rifle switcher (the app's designated primary switcher) has no search at 50 rifles
- **Screen**: View 1 "Which rifle?" overlay, `RifleApp.prototype._openRifleList` (`js/rifle-app.js`)
- **Persona**: Collector — **[LIVE]**, 50-rifle fixture
- **Rule(s)**: **8**
- **Status**: **Fixed** — `b93b070`. Applied the identical `rifles.length > 8` → search-input pattern from `profiles.js`, filtering rows client-side; "+ Add a rifle"/"Scan certificate" stay visible regardless of the filter. Verified live at 50 rifles: search box appears, typing filters to the matching row. Permanent test: `tests/test-screen-nav.js` ("Rifle switcher gets a search box…").
- **Description**: Confirmed via harness: the overlay scrolls correctly (`overlayMaxHeight: 725.84px`, `overflow: auto`) but `hasSearchInput: false` — no search box anywhere. This screen was specifically redesigned this project to be the primary rifle switcher (moved off the dots, onto the name tap) explicitly because "fleets of 50+ are real" — yet it doesn't meet the bar the app already sets elsewhere: `js/profiles.js`'s own Rifles list adds a search input automatically once `rifles.length > 8`. Screenshot: `audit-collector-2-switcher.png`.
- **Proposed fix**: apply the same `rifles.length > N` → search-input pattern from `profiles.js`'s `_renderRifleList` to `_openRifleList`'s overlay markup, filtering rows client-side like the existing `#rifle-search` handler does.
- **Testable**: structurally, once fixed — assert `_openRifleList`'s template contains a count-gated search `<input>`.

### F5 — Editing/deleting a logged shot offline always hard-fails with a raw, alarming error
- **Screen**: A RECORD / view 7 (`js/rifle-record.js`) — `_editSteelShot` Save, and Delete (steel/zero/mv/cleaning)
- **Persona**: Offline — **[LIVE]**
- **Rule(s)**: 7 (Roy-language), **9** (confirm+undo — confirm exists, no acknowledgment offline changes what "destructive" means here), 10 (offline honesty)
- **Status**: **Fixed** (message honesty) — `87741e5`, via the shared `friendlyError()` helper from `ea3a6e0`. Both catch sites in `rifle-record.js` now say "No signal right now — try again once you have a connection" instead of the raw error. **Deferred**: extending real offline queueing to updates/deletes — `sync-queue.js`'s own comments state this is "out of scope by design," a deliberate prior decision the owner should re-affirm rather than have silently changed. Permanent test: `tests/test-friendly-error-usage.js`.
- **Description**: `updateSteelShot`/`deleteSteelString`/`deleteZeroEvent`/`deleteMvMeasurement`/`deleteCleaningLog` are not in `SyncQueueCore.FN_TABLE` — only `add*` writes are queueable. Verified live: Delete shows a working `confirm()`, then the actual call rejects and the user sees a bare `alert('Delete failed: Failed to fetch')`. Nothing is silently lost (the record is correctly left untouched), but the message doesn't say that — it reads like a crash. This is the exact screen view 7 exists to fix ("the fat-finger bug"), failing silently at exactly the place (the range, offline) that bug happens most.
- **Proposed fix**: at minimum, route this through the Finding-7 `friendlyError()` helper so the message reads "Can't do that without a signal — try again once you're back in range." Whether to extend real offline queueing to updates/deletes is a bigger, deliberate architecture question — `sync-queue.js`'s own comments already state offline delete is "out of scope by design," so that's a decision to re-affirm, not an oversight to silently fix.
- **Testable**: structurally (catch blocks route through the shared helper); behaviorally via a Playwright harness asserting specific Roy-language alert text (no permanent home in this repo's test tier yet — see the infrastructure note above).

### F6 — Chrono import bypasses existing offline-queue infrastructure; a parsed file is lost, not queued
- **Screen**: Chrono import save chain (`js/chrono.js` ~line 570-593)
- **Persona**: Offline — **[SOURCE]** (parsing traced through code; the save-path failure mode reuses the verified pattern from F7, not independently re-run)
- **Rule(s)**: 3, 5, **10**
- **Status**: **Fixed** — `1a29ea9`. The save loop now routes through `SyncQueue.write('addVelocityString', record)` when available. Verified live offline: zero direct `db` calls, one item correctly queued instead of rejected. Permanent test: `tests/test-screen-nav.js` ("Chrono import… saves through SyncQueue…").
- **Description**: `addVelocityString` **is already listed** in `SyncQueueCore.FN_TABLE` (`js/sync-queue.js`) — the architecture already treats it as queueable, exactly like steel strings/shots. But `chrono.js`'s save loop calls `self.db.addVelocityString(record)` directly, bypassing `SyncQueue.write(...)` — unlike `rifle-add.js`/`steel-session.js`, which correctly go through a `_write()` wrapper. Parsing (`file.text()`, `parseShotViewCSV`, `parseLabRadarCSV`) is pure/local and works fine offline; only the save step fails, after the user has already done the sometimes-fiddly work of picking and parsing a file.
- **Proposed fix**: change `self.db.addVelocityString(record)` to route through `SyncQueue.write('addVelocityString', record)` when available, matching the existing `_write` pattern used elsewhere — a small, scoped change reusing infrastructure that already exists.
- **Testable**: structurally — assert `js/chrono.js` never calls `db.addVelocityString(` directly without a `SyncQueue.write`/`_write` wrapper.

---

## Annoyances

### F7 — Raw network/JS error text leaks into user-facing messages, app-wide
- **Screens**: `js/new-ammo.js` (Save), `js/rifle-record.js` (Edit/Delete — see F5), `js/chrono.js` (bulk-save catch), `js/certificate.js` (`_render` catch), `js/admin.js` (`show()` catch), `js/app.js` (sign-in/sign-up/reset-password `showAuthError`).
- **Persona**: Offline (live-verified 2 of 6 sites) + Roy (auth site, source-only)
- **Rule(s)**: 7, 10
- **Status**: **Fixed** — `ea3a6e0` (new `friendlyError(err)` helper in `utils.js`, reusing `SyncQueueCore.isNetworkError` exactly as proposed) + `87741e5` (wired into all 15 call sites across the 6 flagged files — turned out to be 7 sites in `chrono.js` alone, not just the bulk-save one, plus all 4 `app.js` auth sites, not just login). Permanent tests: `tests/test-friendly-error.js` (the helper itself, 5 checks) and `tests/test-friendly-error-usage.js` (no raw `err.message` remains in any of the 6 files, 7 checks).
- **Description**: every catch handler builds its message as `'<label>: ' + err.message` with no classification. Offline, the literal text is things like `"Could not save — Failed to fetch"` **[LIVE]** and `"Save failed: Failed to fetch"` **[LIVE]**; by source, the same pattern applies to chrono's bulk-save (`"…then failed: Failed to fetch…"` — otherwise well-written, only the fragment is wrong), certificate load, admin load, and auth errors (`showAuthError(result.error.message)` verbatim). "Failed to fetch" is a browser/runtime string no shooter would say — it reads like the app crashed, not "you're offline."
- **Severity**: annoyance in general (surrounding copy is otherwise fine); **blocker** specifically at the two Record sites (F5), where there's also no recovery framing at all.
- **Proposed fix**: one shared helper (e.g. `friendlyError(err)` in `utils.js`) that checks the already-existing, already-tested `SyncQueueCore.isNetworkError(err)` and returns "no signal right now" for network failures, else falls back to the raw message. Swap every site above to use it — one change, reused everywhere, matching this project's existing small-shared-helper pattern (`NewAmmoForm`, `_toolbarHtml`).
- **Testable**: structurally — grep each file for `err.message` inside a user-facing string that doesn't route through the helper (once it exists); plus a small pure-unit test for `friendlyError()` itself, alongside the existing `isNetworkError` tests in `tests/test-sync-queue.js`.

### F8 — Record view deletes have confirm but no undo, across four record types
- **Screen**: A RECORD / view 7 (`js/rifle-record.js`) — steel, zero, speed, cleaning-log deletes
- **Persona**: Roy — **[SOURCE]**
- **Rule(s)**: **9**
- **Status**: Deferred — not part of this triage batch.
- **Description**: all four delete actions use a native `confirm()`, then delete immediately with no subsequent undo affordance. The rule requires both halves; only confirm exists. The steel-record delete is the highest-stakes of the four since it can also silently revert a load's trued values.
- **Proposed fix**: after a successful delete, show a brief in-app toast with an "Undo" action (hold the deleted data client-side ~5-10s before it's truly final).
- **Testable**: structurally (each `deleteX` call site followed by an undo-affordance render call); full regression needs a DOM harness.

### F9 — The #1 coaching message has no direct one-tap path to fix it
- **Screen**: View 1 → WHY / view 5 (`js/rifle-app.js` `_fillNumber`, `js/rifle-why.js`)
- **Persona**: Roy — **[LIVE]**
- **Rule(s)**: 3, **4**
- **Status**: Deferred — not part of this triage batch. (`NewAmmoForm`/`_openAmmoForm`, built for F1, would make this an easy follow-up.)
- **Description**: The coach text "Bullet, BC, and the number on the box — two minutes" lives inside the `#rf-number` button, whose tap target is the Why screen — four diagnostic rows (Zero / Bullet speed / Checked at distance / Scope check), **none of which is "add a load."** "Bullet speed" routes to Chronograph, which only offers ammo creation *after* typing a number and hitting Save on the guess sub-path. The promised action is at least two taps and one wrong-seeming menu away from the words that told Roy to do it.
- **Proposed fix**: either add a 5th Why row ("Ammo — none on file yet") opening `NewAmmoForm` directly, or make the coach text itself tap straight to the ammo form when `!hasLoad`.
- **Testable**: structurally — when `hasLoad` is false, some tap target within 1 hop of the coaching text opens an ammo-creation flow.

### F10 — Paperwork's Loads list has no search regardless of count
- **Screen**: Paperwork (view 8) → Loads, `ProfileManager.prototype._renderRifleDetail` (`js/profiles.js` ~line 736-758)
- **Persona**: Collector — **[SOURCE]** (code path identical regardless of count; not separately reproduced at high load-count)
- **Rule(s)**: **8**
- **Status**: Deferred — not part of this triage batch.
- **Description**: builds one row per load into a single card with no filter/search, unconditionally. A serious reloader plausibly runs 20-40+ load-development iterations on one favorite rifle — a real possibility, if less common than the 50-rifle case.
- **Proposed fix**: same count-gated search pattern as the Rifles list.
- **Testable**: structurally, once fixed.

### F11 — Blind session picker, if reached, renders every rifle's every load unsearchably (open reachability question)
- **Screen**: Session flow step 1, `SessionFlow.prototype._renderProfilePicker` (`js/session-flow.js`)
- **Persona**: Collector — **[SOURCE]**
- **Rule(s)**: 2, **8**
- **Status**: Deferred — not part of this triage batch. Reachability narrowed while fixing F2/F3: audited every rifle-context-available `AppNav.go('session')` call site and found no other confirmed leak besides F2 (now fixed). `categories.js`'s `launchSession(rifle, quickMode)` remains the one unresolved "could `ctx.rifle` ever be null" question this finding flagged — still open, not traced further this batch.
- **Description**: with 50 rifles × 4 loads, this function would render 50 headings + 200 load buttons + 50 "+ New ammo" rows + 50 hidden panels in one linear, unsearchable screen — no search, no collapsing, no pagination. Per Rule 2 this screen *should* be unreachable whenever a rifle context exists; F2 proves at least one supposedly-scoped call site still lands here. `js/categories.js`'s `launchSession(rifle, quickMode)` passes `rifleId: rifle ? rifle.id : null` — whether `ctx.rifle` can actually be null in practice wasn't fully traced in the time available. **Flagged as an open question, not asserted as confirmed-reachable.**
- **Proposed fix**: (a) close F2 and audit any other rifle-context-available call site still using the blind entry; (b) if provably still reachable, add search + collapse-by-default to this picker too.
- **Testable**: the "no search box" fact is a trivial structural test today; full reachability tracing needs either a static call-graph pass or an end-to-end click-through with the real `index.html` shell.

---

## Polish

### F12 — "px/in" unit jargon in calibration success messages
- **Screen**: Session flow step 3 (`js/session-flow.js`, ArUco + manual calibration success text)
- **Persona**: Roy — **[SOURCE]**
- **Rule(s)**: 7
- **Status**: **Fixed** — `40ae7ea`. Both messages drop the unit ("scale set" / "Calibrated"). Permanent test: `tests/test-jargon.js`.
- **Description**: "Proven target detected — auto-scaled (120 px/in)" / "Calibrated: 24.5 px/in" — no shooter says "pixels per inch" out loud.
- **Proposed fix**: drop the unit from the user-facing message entirely.
- **Testable**: structurally — grep banning `px/in` from user-facing strings in this file.

### F13 — Inconsistent terminology: "Set scale" / "calibration" / "Calibrated"
- **Screen**: Session flow step 3 (index.html + `js/session-flow.js`)
- **Persona**: Roy — **[SOURCE]**
- **Rule(s)**: 7
- **Status**: Deferred — explicitly out of scope this batch ("no other polish, no renames"). F12's px/in fix touched the same messages but deliberately left the "Calibrated" word alone rather than renaming it to match "Set scale."
- **Description**: the step's title is "Set scale," its help button is `showHelp('calibration')` titled "What is calibration?", and the success line says "Calibrated: …" — three words for one concept.
- **Proposed fix**: pick one term ("Set scale" is the most Roy-friendly) and use it everywhere on this step.
- **Testable**: structurally — enforce the chosen term consistently via grep.

### F14 — "CSV or XLSX" file-format jargon in chrono import copy
- **Screen**: Chrono import (`js/chrono.js` ~line 62)
- **Persona**: Roy — **[SOURCE]**
- **Rule(s)**: 7
- **Status**: **Fixed** — `40ae7ea`. Now reads "Garmin ShotView or a LabRadar report — straight from the device." The file-picker's own `.csv`/`.xlsx` error-message wording was deliberately left alone — a genuinely different, actionable context this finding didn't flag. Permanent test: `tests/test-jargon.js`.
- **Description**: "Garmin ShotView (CSV or XLSX) or a LabRadar series report (CSV)" — the file picker already filters by extension; the acronyms add nothing Roy needs.
- **Proposed fix**: "Garmin ShotView or a LabRadar report, straight from the device."
- **Testable**: structurally — grep banning `CSV`/`XLSX` from user-facing text.

### F15 — "Device export" / "Export data" menu labels read as developer terms
- **Screen**: Categories menu rows (`js/categories.js` ~lines 184, 330)
- **Persona**: Roy — **[SOURCE]**
- **Rule(s)**: 7
- **Status**: Deferred — explicitly out of scope this batch (renames excluded).
- **Description**: the screen bodies underneath are well-written and shooter-appropriate; only the menu labels themselves are software-flavored.
- **Proposed fix**: rename the rows only (e.g. "Device export" → "Rangefinder numbers").
- **Testable**: no strong automated test — a copy-review judgment call for the owner.

### F16 — Decorative dots row illegible at 50 rifles
- **Screen**: View 1, `.v3-dots` (`js/rifle-app.js` / `css/ui.css`)
- **Persona**: Collector — **[LIVE]**
- **Rule(s)**: 8 (spirit — not a functional violation since it's already non-interactive)
- **Status**: Deferred — not part of this triage batch.
- **Description**: 50 tiny dots in one line reads as a gray smear, not a position indicator. Not a rule break since switching is correctly handled by the name-tap list, but it doesn't do its one decorative job at this scale.
- **Proposed fix**: hide the dots row above a threshold (e.g. >12 rifles).
- **Testable**: structurally — assert `.v3-dots` rendering is gated by an upper bound, not just `length > 1`.

### F17 — Admin dashboard uses raw developer labels (scope question)
- **Screen**: Admin (`js/admin.js`)
- **Persona**: Roy — **[LIVE]** (harness reused from the prior device-testing pass; back-button fix confirmed still present)
- **Rule(s)**: 7
- **Status**: Deferred — scope question unresolved, not part of this triage batch.
- **Description**: "Database," "Month qs," "Scope adj." Roy himself would never see this screen — flagged only because the audit's required journey list included checking admin regardless of persona fit.
- **Proposed fix**: low priority. Recommend the owner explicitly decide whether Rule 7 applies to admin-only, owner-facing screens at all, rather than treating this as equal-priority to user-facing findings.
- **Testable**: not recommended as an automated test given the open scoping question.

### F18 — Admin's per-user/usage tables have no search
- **Screen**: Admin dashboard (`js/admin.js`)
- **Persona**: Collector — **[SOURCE]**
- **Rule(s)**: 8
- **Status**: Deferred — not part of this triage batch.
- **Description**: both the `perUser` AI-usage table and the main users table render every row unconditionally, no search/sort. Distant concern until the *user base* itself is large, not this persona's own data.
- **Proposed fix**: same count-gated search pattern as elsewhere.
- **Testable**: structurally, once fixed.

---

## Coverage gaps (not findings — things this audit could not verify)

- **Sign out / sign in**: both Roy and the offline persona flagged this identically — no live Supabase backend exists in this sandbox, so the actual round-trip (state clears correctly, re-sign-in lands on the right rifle, whether a confirm exists before sign-out) could not be runtime-verified. Source review found nothing obviously broken (the auth screen's copy is clean, jargon-free) but also can't prove it works. **Recommend one manual device pass by the owner.**

## Confirmed working (positive notes, so a future audit doesn't re-flag them)

- **Rule 1 (back/home everywhere)**: already covered by the existing `tests/test-screen-nav.js` (49 checks from the prior device-testing pass). All three personas re-spot-checked several screens in this walk and found no new violations.
- Cold app launch fully offline renders THE RIFLE correctly from cache — name, chevron, "Rifle details" link, client-computed drop chart, accurate empty-state coaching, correct empty sync banner. No console/page errors.
- Starting a paper session offline no longer dead-ends (prior fix confirmed still in place).
- A full steel entry offline correctly queues both writes via `SyncQueue`, and the resting-screen feed shows an honest, specific `"Steel at 600 · waiting to sync"` label — not a vague spinner.
- Reconnect + flush works automatically via the existing `'online'` listener; the sync banner clears correctly.
- The rifle switcher overlay **does** scroll correctly at 50 rifles (`overlay-card`'s `max-height: 86dvh; overflow-y: auto`) — only search is missing (F4), not basic usability.
- `js/profiles.js`'s Rifles list already implements the correct search-at-scale pattern — the fix for F4/F10/F18 already exists in this codebase, it just hasn't been applied everywhere the same rule applies.
- No console or page errors surfaced in any of the three personas' full walks.

---

## Raw persona reports

Full unedited findings from each fork, including additional verification detail and screenshots referenced above, are preserved at:
- `audit-roy-findings.md`
- `audit-collector-findings.md`
- `audit-offline-findings.md`

(scratchpad directory: `C:\Users\FEHR\AppData\Local\Temp\claude\C--AI-Projects-ballistic-app\6c570418-80b7-4697-a0c2-8a10ca9b34c3\scratchpad\`)
