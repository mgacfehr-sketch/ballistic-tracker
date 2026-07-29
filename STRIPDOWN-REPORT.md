# STRIPDOWN-REPORT.md — Strip-Down Phase build record

**Scope:** owner order. The app now has exactly **three** visible
functions — RIFLES, RANGE SESSION, and **True your rifle** (unhidden
2026-07-29, see Addendum below; the original phase shipped with
exactly two). Everything else built in this codebase stays fully in
place ("code stays, doors close"): no file was deleted, no protected
engine touched, no data-layer schema changed. `sw.js` `CACHE_VERSION`
bumped on every app-shell-touching commit (160 → 165 across the
original phase and the addendum).

**Canon data layer untouched.** No new database column, no migration,
no change to `db.js`'s dual-write into `fact_events`. The one new
piece of data (optional velocity high/low) is stored inside the
session's existing free-form `results` field — additive at the
application layer only, zero schema impact. Every save in this
stripped-down build calls the exact same `db.js` methods every other
flow in this codebase always called, so whatever runs silently
underneath a save (dual-write, memory tables) keeps running exactly as
before.

**Engines byte-identical.** No protected engine
(`calculations.js`, `ballistic-solver.js`, `truing-core.js`,
`simple-true.js`, `velocity-stats.js`, `garmin-import.js`,
`calibration-status.js`, `target-geometry.js`) was touched — confirmed
by `tests/test-protected-engine-hashes.js`, green throughout.

**Full suite green throughout** every commit — 45 test files including
two new ones this phase (`tests/test-stripdown-loop.js`, 27 checks).

---

## Part (a) — What was built

### The new resting screen: MainMenu (`js/main-menu.js`)

Exactly two buttons — **Rifles** and **Range Session** — plus a build
stamp (`Build 161 · 2026-07-29`, bump this string alongside
`CACHE_VERSION` on future builds) at the bottom of the screen, so the
owner can always tell which build a phone is actually running. Renders
into `#view-home` (the same container `RifleApp`'s Card used to own —
`RifleApp` is still instantiated in `app.js`, just never shown).

`app.js`'s `initApp()` now boots into `MainMenu.show()` instead of
`rifleApp.show()`, and `switchView('home')` renders `MainMenu` instead
of the Card. Because the prior UI Consolidation phase had already made
`AppNav.go('home')` the universal "done"/error/fallback redirect used
throughout this entire codebase, repointing what `'home'` renders
retargeted every one of those existing call sites — dozens of them,
across files this phase never touched — to the main menu for free.

### RIFLES (`js/profiles.js`, reusing existing forms as-is)

- **List** (`showRifleList`/`_renderRifleList`) — name + caliber per
  rifle, "+ Add rifle" last. Rebuilt fresh and minimal; was a
  "redirect to the Card" compatibility shim left over from the UI
  Consolidation phase, now a real destination again.
- **Detail** (`showRifleDetail`/`_renderRifleDetail`) — repurposed
  from what used to be THE RIFLE'S PAPERWORK (9 rows: build sheet,
  ammo, barrel, trip planner, certificate/report, export, scope check,
  print target, settings). Now exactly three things: an **Edit rifle**
  row (opens the full existing create/edit form, unchanged — every
  build field: name, caliber, scope height, zero range, turret units,
  barrel twist/direction/round count/install date, suppressor toggle,
  build-sheet/certificate fields, notes), an inline **Ammo** section
  (every load listed, tap to view/edit, "+ New ammo" last), and an
  inline **Sessions** section (every saved range session for this
  rifle, newest first, showing date/group-size/MV, tap for the full
  session detail with its photo).
- **Ammo add/edit** (`showLoadForm`/`_renderLoadForm`,
  `showLoadDetail`/`_renderLoadDetail`) — unchanged except the OCR
  scan button is suppressed (see Part (b)). Full field set: name, lot
  number, bullet name, weight, diameter, BC, drag model, muzzle
  velocity (advertised speed), bullet length, notes. Full round-trip
  editing confirmed (create via `db.addLoad`, edit via
  `db.updateLoad`, both traced in the QA gate test).

### RANGE SESSION — the existing 7-step wizard, entry order refined per an explicit follow-up spec

`SessionLaunch.start({})` → the same 7-step wizard that already
existed (photo capture → calibration → distance/MV/weather → point of
aim → mark impacts → results). Nothing about the measurement engine,
the photo pipeline, or the calibration flow was touched.

**Entry order refined in a follow-up** (owner's exact spec): step 1
was originally one combined screen (every rifle listed with its ammo
nested underneath). Split into two sequential screens —
`SessionFlow.prototype._renderRiflePicker` ("Which rifle are you
using?" — rifle list only, nothing else on screen; the dead Quick
Start beta section and the Print/Share-target utility buttons were
removed from this screen, the latter moved to the photo step) and
`_renderAmmoPicker` ("Which ammo are you using?" — ONLY the tapped
rifle's own ammo, fetched by that rifle's id specifically, plus
"+ New ammo" inline: name, bullet, weight, advertised speed). No other
question was found ahead of rifle/ammo selection needing to move —
distance/MV/weather were already collected later, in the DATA step.

- **Added:** optional Velocity high/low fields next to the existing
  average Velocity field in the DATA step (`index.html` +
  `session-flow.js`). Stored inside the session's own `results` blob
  at save time (a shallow copy — `this.results`, the protected
  `calculations.js` engine's own output, is never mutated) —
  deliberately no new database column.
- **Confirmed already correct** (built in the prior UI Consolidation
  phase, unchanged this phase): the photo-orientation fix
  (`loadImageFromFile`'s `createImageBitmap({imageOrientation:
  'from-image'})`) — "photo must display straight" was already solved.
  The post-save "Done" button (revealed only after the save actually
  succeeds, showing "Saved to history"/"Saved — will sync…" first) now
  returns to the main menu instead of the old Card, with zero code
  changes needed there — it already called the now-repointed
  `AppNav.go('home')`.

---

## Part (b) — Every surface, and its current state

**Visible (the two blessed functions):**

| Surface | File | State |
|---|---|---|
| Main menu | `js/main-menu.js` | NEW — the only resting screen |
| Rifles list | `js/profiles.js` `showRifleList` | Rebuilt minimal |
| Rifle detail (edit/ammo/sessions) | `js/profiles.js` `_renderRifleDetail` | Repurposed from Paperwork |
| Rifle create/edit form | `js/profiles.js` `_renderRifleForm` | Unchanged, reused |
| Ammo list/detail/form | `js/profiles.js` (loads) | Unchanged except OCR suppressed |
| Session detail (photo/group/MV) | `js/history.js` `_renderSessionDetail` | Back button repointed to the rifle |
| Range Session wizard (7 steps) | `js/session-flow.js` | Unchanged + MV high/low added |

**Hidden this phase (code intact, zero live entry point):**

| Surface | File(s) | How it's closed |
|---|---|---|
| Ammo-box OCR scan | `js/onboarding.js` (`scanButtonHtml`/`bindScanButton`) | Not called from the ammo form anymore |
| Quick Mode ("Just measure this group") | `js/session-flow.js` (`_selectQuickMode`) | Its button hidden via CSS class in `index.html` |
| Barrel & rounds / cleaning log | `js/history.js` (`showCleaningLog`/`showCleaningForm`), `js/profiles.js` (`showBarrelForm`) | No row links to them from the new rifle detail |
| Planning a trip? (round budgeting) | `js/profiles.js` `_openTripPlanner` | No row link |
| Certificate & report | `js/certificate.js`, `js/rifle-report.js`, `Categories.openReportCertificateFor` | No row link |
| Export everything | `js/data-export.js` | No row link (the data itself is still exportable in principle, just no UI door to it) |
| Scope tracking check | `js/scope-check.js` | No row link |
| Print a target (blank calibration sheet from Paperwork) | `js/target-pdf.js` (the Paperwork door) | No row link — note the in-wizard "Print target"/"Share target" buttons on the Range Session photo step are DIFFERENT and were kept (support the kept photo-capture step, not a separate destination) |
| Settings & account (privacy, delete account, misc sessions, suppressor toggle) | `js/profiles.js` `_showAccountOverlay` | No row link |
| THE CARD (status, PROVEN TO, drop chart, coach line, feed) | `js/rifle-app.js` | Instantiated, never `.show()`n |
| Rifle switcher sheet | `js/rifle-app.js` `_openRifleList` | Unreachable — the Card that opened it is unreachable |
| Fact cards: zero / steel / chrono / payoff / why / chart / record | `js/rifle-add.js`, `js/rifle-payoff.js`, `js/rifle-why.js`, `js/rifle-chart.js`, `js/rifle-record.js` | Unreachable — all were opened from the Card |
| Detailed truing (both the inline flow AND `truing.js`'s standalone wizard) | `js/rifle-payoff.js`, `js/truing.js` | Unreachable — reached only via the now-hidden Card/steel-session escape hatch |
| Detailed Steel/Field Session (full logger) | `js/steel-session.js` | Unreachable — its only live entry was the Card's steel fact card |
| The five job Categories | `js/categories.js` | Already unreachable (confirmed in the prior UI Consolidation follow-up — every path in traced to dead screens) |
| Ladder test | `js/ladder.js` | Unreachable — launched from `session-flow.js`'s old profile-picker context menu, itself replaced |
| Field/steel analytics (effective range, wind grading) | `js/field.js` | Already effectively unreachable (flagged in the prior phase — traces through the same dead Categories rendering) |
| DOPE cards / DOPE log | `js/dope-cards.js`, `js/dope-log.js` | Unreachable (dope-log was already beta-off; dope-cards' only door was Full Chart, now hidden) |
| Wind Call | `js/wind-call.js` | Already beta-hard-off for everyone, additionally now has no UI door regardless |
| Ballistic solver (standalone) | `js/ballistic-solver.js` | Unreachable — no nav tab exists, no button links to `switchView('solver')` |
| Chrono import (Garmin/LabRadar) | `js/chrono.js`, `js/garmin-import.js`, `js/labradar-import.js` | Unreachable — no button links to `switchView('chrono')` |
| Ask yorT (AI assistant) | `js/ai-assistant.js` | Already a "coming soon" placeholder (Part 0.5), still unreachable |
| Onboarding first-run wizard | `js/onboarding.js` (`Onboarding.maybeRunFirstRun`) | Not invoked from `MainMenu`; the app boots straight to the menu |
| Certificate transfer (mint/redeem) | `js/transfer.js` | Unreachable — its only door was Paperwork's report/certificate row |
| Device export | `js/device-export.js` | Unreachable — its only door was Paperwork |
| Admin dashboard | `js/admin.js` | Unchanged — was already URL-only (`#admin`), not a discoverable tap/swipe target either before or after this phase |
| Crowd data warehouse | `js/crowd-data.js` | Unreachable (was already admin-only, gated behind the same undiscoverable `#admin` URL) |
| Home (legacy v2.4 screen), the five job-category Home doors | `js/home.js` | Was already unreachable as a top-level screen since the v3.0 Card replaced it; still true, `HomeManager.show()` has zero live callers |

**Left alone, judged not to be separate "functions":** the sign-out
icon and sunlight/dark-mode toggle in the app's persistent header
chrome (basic account/display controls, not a feature destination);
the passive zero-verdict banner on the Range Session results screen
(informational content within the kept measurement flow, computed from
the same group data the results screen already shows, not a
navigable destination); the Print/Share target buttons on the photo
step (support the kept photo-capture step); the weather auto-fetch
button in the DATA step (an input helper, not a destination); the
Crop/Save image/Share buttons on the results screen (utility actions
on the same screen, not navigation). These are recorded here as
judgment calls, not silently assumed.

---

## The one loop that remains

```
MAIN MENU
├── RIFLES
│   ├── list (name, caliber, + Add rifle)
│   │   └── tap a rifle → RIFLE DETAIL
│   │       ├── Edit rifle → full create/edit form → Save → back to RIFLE DETAIL
│   │       ├── AMMO (inline list)
│   │       │   ├── tap a load → view/edit/delete → back to RIFLE DETAIL
│   │       │   └── + New ammo → full form → Save → back to RIFLE DETAIL
│   │       └── SESSIONS (inline list, date · group size · MV)
│   │           └── tap a session → photo, full stats, MV → back to RIFLE DETAIL
│   └── + Add rifle → full create form → Save → new RIFLE DETAIL
└── RANGE SESSION
    └── Screen 1: "Which rifle are you using?" (rifle list only)
        → tap a rifle → Screen 2: "Which ammo are you using?"
          (that rifle's ammo only, + New ammo inline)
        → target photo (camera or gallery, displays straight)
        → calibrate (existing ArUco/manual flow)
        → distance, bullet diameter, rounds, velocity (avg + optional high/low), weather
        → point of aim
        → mark impacts
        → RESULTS (group size, MOA, stats)
        → Save → confirmation → Done → MAIN MENU
```

Every tap in this diagram is real, traced against current source in
`tests/test-stripdown-loop.js` (Part B, 20 checks) — not an idealized
version of what should happen. Part A of the same file (4 checks) locks
the two-destination law itself: `main-menu.js` has exactly two
clickable ids and nothing else.

---

## Addendum (2026-07-29) — third function unhidden: True your rifle + logo-as-home

Two owner-specified additions on top of the two-function build above.

### (1) The header logo is always a home button

`index.html`'s `.shell-brand` (the PROVEN/Workhorse mark + wordmark in
the persistent header) now carries `id="app-logo-home"`,
`role="button"`, and `tabindex="0"`. `app.js` (`initApp`, next to the
sunlight-mode toggle binding) wires `click` and `keydown`
(Enter/Space) to `switchView('home')` — the exact same destination
`AppNav.go('home')` has always resolved to since the original
strip-down phase. Works from anywhere in the app, one tap, no
exceptions. `css/ui.css` gives it a larger effective tap target
(padding + negative margin, matching the ≥44px touch-target rule)
without shifting its visual position, plus a pressed-state affordance.

### (2) True your rifle — the third MainMenu button

`js/main-menu.js` now renders a third button, `id="mm-true-rifle"`,
below Rifles and Range Session. Tapping it calls the new
`TruingLaunch.start()` (wired in `app.js` next to `SessionLaunch`,
same pattern — a thin launcher closed over `db`), which hands off to
the new `js/truing-wizard.js` (`TruingWizard.start(db)`).

**The wizard — one question per screen, Roy's words, in order:**

1. Which rifle are you using? (`db.getAllRifles()`, same picker style
   as Range Session's screen 1)
2. Which ammo are you using? (`db.getLoadsByRifle(rifleId)` — that
   rifle's ammo only). Ammo missing a BC or a base velocity dead-ends
   here with "Add BC & speed" (mirrors `rifle-add.js`'s
   `_loggedNeedsNumbers` — there's nothing to true without those
   numbers on file) instead of asking questions that can't be answered.
3. "How far is the target?" — distance, yards.
4. "What did you dial?" — elevation, in the rifle's own turret unit
   (MOA or MIL, `rifle.angleUnit`).
5. "What was your muzzle velocity?" — average from the chrono, typed.
6. "Where did it hit?" — magnitude + HIGH/LOW + a unit toggle
   (Inches / Clicks). Clicks convert through `DEFAULT_CLICK_MOA = 0.25`
   — the same click-value convention `calculations.js`'s `zeroVerdict`
   already established, not a new invented constant.

**Routing — the untouched protected engine, nothing new.** The six
answers assemble the exact `simpleTrueObservation()` input shape
`js/rifle-payoff.js` already builds from the steel flow (same
`_profileFor`-style profile: `truedBc||bulletBC`,
`truedMv||muzzleVelocity`, `dragModel||'G7'`, etc.). `simple-true.js`
and `truing-core.js` were not touched — the doctrine (Amendment 1 A1)
still routes silently to `mv` or `bc` on its own authority, never
forced by this flow having asked for a measured velocity. A `null`
return (the same honesty guard every caller gets — zero-band hit or a
bracket-capped correction) shows a plain "couldn't use that, nothing
was changed" screen, never a fake result.

**Result screen** states the corrected number plainly, with the drag
model labeled when it's a BC correction (`"Your G7 BC: 0.297 — was
0.311"`) or in fps when it's a velocity correction, PLUS the same
dial-change sentence the steel payoff already uses
(`"Your 900-yard dial changes from 7.2 to 7.5"`). **Keep it** writes
through `SimpleTrue.keep` — the identical append-only
`addTruingEvent` + `load.truedBc`/`truedMv` write path every other
truing caller in this codebase shares, so this flow doesn't introduce
a second way to persist a correction. **Undo** is a bare return to the
main menu — no write happens. Both land on `AppNav.go('home')`.

Covered by `tests/test-stripdown-loop.js` Part C (11 checks, traced
hop-by-hop against current source, same rigor as Part B) plus updated
Part A checks (three buttons, not two; the logo-home wiring).
`tests/test-protected-engine-hashes.js` stayed green — `simple-true.js`
and `truing-core.js` are byte-identical to before this addendum.

---

## STOP

The app had exactly two visible functions at the end of the original
phase; the Addendum above unhid a third, owner-specified one (True
your rifle) with its own hop-by-hop test coverage. Every other surface built
in this codebase — the Card, all seven fact-card screens, both truing
UIs, the detailed steel logger, Categories, ladder, field analytics,
DOPE cards/log, wind call, the solver, chrono import, Ask yorT, device
export, certificates/transfer, admin, crowd data, the account overlay,
onboarding OCR, Quick Mode — is HIDDEN: present in the codebase,
correctly wired to whatever it was wired to before, reachable by
nothing a user could tap, swipe, or stumble onto by URL (admin's
existing `#admin`-only door is the one exception, already
undiscoverable before this phase and left exactly as it was). The data
layer underneath every save in this build is the identical `db.js`
code path every other flow in this app has always used — dual-write
into `fact_events`, the memory tables, all of it keeps running exactly
as before, silently, because nothing about how a save actually happens
was changed, only what UI can trigger one. Full suite green throughout,
protected-engine hashes and the canon data-layer schema both untouched
by either the original phase or the addendum, `sw.js` `CACHE_VERSION`
160 → 165 across both.
