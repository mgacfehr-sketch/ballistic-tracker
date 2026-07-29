# UICONSOLIDATION-REPORT.md — UI Consolidation phase build record

**Scope:** surfaces only — no data/engine/schema work, per the phase's
own instruction. Device testing verdict that triggered this phase:
3/10 flow, three separate rifle surfaces, flows dead-ending after
saving, add-rifle findable on only one of three surfaces, capture not
locatable. Five laws enforced, branch `redesign`, one commit per law,
pushed after every commit, `sw.js` `CACHE_VERSION` bumped on every
app-shell-touching commit (155 → 159). One follow-up commit corrects
and acts on a wrong conclusion in this report's first pass on law (5)
— see the "detailed truing" note below.

**No canon contradiction was found or needed.** Every decision below
was resolvable inside this phase's own stated latitude (the surface
budget law, "kill and fold," "no UI feature work" from the *previous*
overnight run does not apply here — this phase explicitly is UI work).

**Full suite green throughout** — every commit verified before the
next began (protected-engine hashes untouched — no engine file was
touched this phase; canon manifest untouched — no canon document was
touched).

---

## Part (a) — Everything completed, by law

### Law (1) — ONE rifle surface: the Card

**Before:** three separate, simultaneously-reachable rifle surfaces —
the Card (`rifle-app.js`), the Paperwork details drawer
(`profiles.js`'s `showRifleDetail`), and a full-page "Rifles" status
list (`profiles.js`'s `showRifleList`/`_renderRifleList` — fleet
summary, search, per-rifle status rows, "Add rifle"/"Scan certificate"
FAB, plus three unrelated sections stuck on the same page: Misc
sessions, Suppressed shooting, Account/privacy/delete).

**After:** exactly three surfaces — the Card, the rifle switcher sheet
(`rifle-app.js`'s `_openRifleList`, an overlay off the Card, tap the
rifle name), and the Paperwork drawer. The list page is retired;
`showRifleList()` survives only as a compatibility redirect to the Card
(`AppNav.go('home')`) so the ~9 existing internal/external fallback
callers across `certificate.js`/`history.js`/`rifle-report.js`/
`profiles.js` itself all correctly land on the Card without each call
site needing an edit. Per-rifle status lines moved into the switcher
sheet (same shared `Readiness.assess` engine every other readiness
surface already uses — moved, not reimplemented). Misc sessions /
Suppressed shooting / Account had no per-rifle home and are genuinely
distinct jobs (not duplicative of anything) — moved into a new
`_showAccountOverlay`, reached from Paperwork's "Settings & sign-out"
row (previously a stub that did nothing useful — just bounced back to
the list). `AppNav.go('profiles')` now redirects to `'home'`
(there is no more bare "profiles" destination) — a one-line change that
fixed roughly 20 legacy call sites across `categories.js`/`home.js`/
`dope-cards.js`/`field.js`/`onboarding.js`/`scope-check.js`/
`session-flow.js`/`ballistic-solver.js` without touching each one.

### Law (2) — every flow ends at the Card

Traced all five named save flows (paper, steel, chrono, cleaning,
truing) to their terminal navigation. Three real problems found and
fixed:

1. **Paper capture — likely the core of the "flows dead-end after
   saving" complaint.** After a session saved, the results screen had
   no forward path at all: Crop/Save image/Share (utility actions,
   correctly preserved), a wizard "back" chevron that walks BACKWARD
   into re-marking impacts, and "Start a new session" (restarts
   capture, doesn't return to the rifle). Fixed with a "Done" button,
   hidden until the save actually succeeds, that goes straight to the
   Card.
2. **Cleaning entries saved back to the cleaning-log list, not the
   Card** — the one named flow that didn't match the law. Fixed.
3. **Session Detail was three taps from the Card**, not two — its
   back button routed through a session LIST that has no live caller
   of its own anymore (it's reached directly from the Card's feed via
   `AppNav.openSession`/`rifle-record.js` today). Fixed to exit
   straight home, matching how it's actually entered.

Steel (`rifle-payoff.js`) and chrono/truing were already correct.
`tests/test-flows-end-at-card.js` (new, 15 checks): Part A traces each
named flow's success path to a direct Card exit; Part B is a
hand-verified <=2-tap hop table for the primary/entry screens, each
hop's exit target checked against source.

### Law (3) — capture is one obvious verb

The gold "+ Add what you shot" button is unconditional in the normal
Card state (verified, not assumed — new test asserts the exact line is
a sibling statement, not nested inside the dots/draft-banner
conditionals next to it). **Real bug found:** `RifleApp.show()`
swallowed ANY `getAllRifles()` rejection into an empty array before
branching on rifle count, which meant a genuine fetch failure was
indistinguishable from "confirmed zero rifles" and rendered the
onboarding "No rifle yet / Add your rifle" empty state — for a shooter
who actually has rifles, that state has no way to start a session at
all, closely matching the device report. `db.js`'s own `getAllRifles`
already falls back to the offline cache and rarely rejects, making this
a narrow, defensive case rather than the common path — but a rejection
must never be silently reinterpreted as "you have no rifles." Fixed
with a distinct `_renderLoadError` state (own copy, own retry) instead
of ever falling through to the onboarding empty state.

### Law (4) — the rotated/twisted target-photo bug

Root cause: `js/utils.js`'s `loadImageFromFile` (the one shared photo
loader every capture path uses — paper, steel, scope-check,
onboarding). Its own comment claimed "modern browsers auto-apply EXIF
orientation via `createImageBitmap`, so we use that" — but the code
never actually called `createImageBitmap`; it only ever loaded through
a plain `new Image(); img.src = objectURL`. A browser's on-screen
"auto-rotate an `<img>` for CSS display" behavior is a different code
path from what `ctx.drawImage()` decodes when painting that same
`<img>` onto a canvas — long documented as inconsistent across engines,
especially WebView/iOS Safari, exactly what a phone camera's portrait
photo goes through. Fixed: `loadImageFromFile` now actually calls
`createImageBitmap(file, { imageOrientation: 'from-image' })`, falling
back to the old `<img>` path when unsupported. `tests/test-exif-orientation.js`
(13 checks) builds a real, byte-correct portrait-shot JPEG fixture
(`tests/fixtures/portrait-exif-orientation-6.jpg` — raw sensor storage
40×30 landscape, genuine EXIF Orientation=6), parses it back with an
independent hand-rolled reader, proves a spec-correct decode must
produce swapped 30×40 portrait dimensions, and confirms the fix
requests exactly that decode.

### Law (5) — the surface sweep

Full inventory below. One apparent duplicate was investigated and
found to be intentional (documented), not a bug — see the note under
"Truing."

---

## Part (b) — Surface inventory: every screen, its single job

**The three rifle surfaces (law 1):**

| Surface | File | Job |
|---|---|---|
| The Card | `rifle-app.js` `_renderRifle` | The one resting screen — status, drop chart, capture, feed |
| Rifle switcher sheet | `rifle-app.js` `_openRifleList` | Pick a different rifle, or add one, from anywhere |
| Paperwork drawer | `profiles.js` `_renderRifleDetail` | Doors to everything NOT on the Card: build sheet, ammo, barrel, trip planning, report/certificate, export, scope check, print target, account |
| Account overlay | `profiles.js` `_showAccountOverlay` | Misc sessions, suppressor toggle, privacy/delete — the three things with no per-rifle home |

**The five named save-flow screens (law 2), each ending at the Card:**

| Surface | File | Job |
|---|---|---|
| Paper capture wizard | `session-flow.js` (7 steps) | Photograph a target, mark impacts, get group stats |
| Steel/zero/chrono fact cards | `rifle-add.js` | Log a confirmed zero, a steel hit, or a clocked speed — one card each |
| Payoff (Keep/Undo) | `rifle-payoff.js` | Show the immediate truing payoff from a logged steel hit |
| Cleaning log + form | `history.js` | Record a barrel cleaning against the round count |
| Detailed truing job | `truing.js` (`TruingJob`) | Full-featured truing wizard — Detailed lane only, see note below |

**Reached from the Card's feed / Why / Chart (one tap, sibling views):**

| Surface | File | Job |
|---|---|---|
| Why | `rifle-why.js` | Explain the PROVEN TO number — the four calibration elements |
| Full chart | `rifle-chart.js` | Complete drop table + rangefinder block |
| A Record | `rifle-record.js` | Edit/delete one logged fact (or hand off to Session Detail for paper sessions) |
| Session Detail | `history.js` `_renderSessionDetail` | View one paper session's stats + annotated photo |

**Deeper surfaces (not gated by a live "Detailed lane" switch — that
switch is dead, see the corrected note below; each row's OWN
reachability was checked individually, not inferred from lanes.js):**

| Surface | File | Job | Live entry path |
|---|---|---|---|
| Steel/Field Session (casual+full) | `steel-session.js` | The full-control steel logging path — wind clock, per-shot MV, holds | Steel card → "advanced" escape hatch (`rifle-add.js`) |
| Truing job | `truing.js` | Full-featured, multi-input truing wizard | `steel-session.js`'s own handoff only — the sanctioned exception, see note below |
| Scope tracking check | `scope-check.js` | Tall-target verification | FIVE live contexts, one screen (not duplicative — see note) |
| Ladder test | `ladder.js` | Multi-group velocity-window test | `session-flow.js`'s `LadderManager.open`, launched as a paper-wizard mode |
| DOPE cards | `dope-cards.js` | Printable range card | Full Chart's Print/Share (`rifle-chart.js`) |

**Flagged, not fixed this pass (out of the truing-specific scope this
follow-up was asked for):** `field.js`'s `FieldCore` and the Categories
"strip" summary rows that call it (`stripCheck`/`stripShoot`/
`stripSteel`) trace back to the same dead `Categories.show()` this
investigation already confirmed unreachable — meaning `field.js`'s
effective-range/wind-call-grading computations may currently have
*zero* live callers too, the same shape of finding as `truing.js` had
before this fix. Not verified exhaustively or touched here; worth its
own pass rather than guessing at it as a side effect of the truing
fix.
| The five job categories | `categories.js` | Detailed-lane home: Range/Steel/Load Dev/Ballistics/Truing/Scope/Records |

**Tools reached from Paperwork or elsewhere, each with one job:**

| Surface | File | Job |
|---|---|---|
| Ballistic solver | `ballistic-solver.js` | Standalone drop/wind calculator |
| Chrono import | `chrono.js` | Garmin ShotView import → assign to a rifle |
| Device export | `device-export.js` | What to punch into a rangefinder/solver device |
| Certificate preflight | `certificate.js` | Generate a Certificate of Performance |
| Transfer (mint/redeem) | `transfer.js` | Cross-account certificate handoff |
| Admin dashboard | `admin.js` | Owner-only — users, AI cost, DB stats, export (URL-only, `#admin`) |
| Crowd data warehouse | `crowd-data.js` | Owner-only — anonymized cross-user export |
| Ask yorT | `ai-assistant.js` | Chat assistant (currently a "coming soon" placeholder, Part 0.5) |
| Onboarding OCR | `onboarding.js` | Ammo-box photo → prefilled load form |
| Target PDF | `target-pdf.js` | Printable calibration target |
| Wind Call | `wind-call.js` | Wind/Coriolis/spin-drift calculator — **beta, hard off for everyone** |
| Come-up verification / BC truing | `dope-log.js` | Verified-hit BC back-calculation — **beta, hard off for everyone** |

### Note — "detailed truing": corrected finding, then folded

**This section originally concluded "confirmed intentional, not
fixed" — that conclusion was wrong, and the correction is worth
recording, not quietly overwriting.** The first pass cited `lanes.js`'s
own header comment ("Detailed lane is everything v2.3/v2.4 built,
UNCHANGED") as if it were still-current doctrine. It isn't: the v3.0
Contract Part 2 explicitly kills the Lanes concept as a *user-facing*
choice, and `V3-REPORT.md` already documented this — *"the user-facing
Simple/Detailed switcher is dead... Roy has no manual toggle
anymore."* The comment was itself stale, the same failure class as
item (4)'s photo-rotation bug (a comment describing behavior/intent
the code no longer implements) — citing it instead of tracing live
reachability was the actual mistake, not the underlying question.

**Re-traced properly:** `truing.js`'s standalone `TruingJob` is a
genuine separate destination (a multi-step wizard rendered into the
same `#view-home` container the Card uses, not an inline reveal on the
steel card). Tracing every one of its four `ToolActions.truing()` call
sites to their own reachability:
- `categories.js` (×2, the "true-rifle" utility tool and the
  standalone "truing" job category) — the literal "Categories → Truing
  tool" door `V4-REPORT.md`'s own OWNER REVIEW QUEUE item #2 had
  already flagged as a likely violation and left unresolved
  ("worth an explicit yes/no from the owner"). Traced fully dead:
  every path into `Categories.show()` runs through `home.js`'s
  `HomeManager.show()`, which itself has zero live callers, or through
  `device-export.js`'s `open()`, which also has zero live callers.
- `home.js`'s own `case 'truing':` coach-dispatch branch — same dead
  `HomeManager` screen family.
- `steel-session.js`'s handoff (after logging a Detailed-lane session
  with enough data to true) — **the one genuinely live path.**

**Owner ruling:** keep `steel-session.js` → `TruingJob` as the
sanctioned deep escape hatch for multi-string/multi-distance work the
inline flow can't do (steel-session.js's own escape-hatch status was
already established in `V4-REPORT.md`'s owner review); delete the
confirmed-dead doors so they can't resurrect the forced-primary-door
pattern; add a test locking the single-entry-path guarantee; fix the
stale `lanes.js` comment that caused the original wrong conclusion.

**Done:** removed `categories.js`'s "true-rifle" tool and the whole
standalone `truing` category (its `key`/`registryTools`/`tools`/`strip`
— confirmed self-contained; the SEPARATE, still-live `HISTORY_CHIPS`
array and `_uhTruing` history-rendering function that also use the
string `'truing'` were left untouched, since they're an independent,
reachable feature via `rifle-simple.js` → `showHistory`, not part of
this dead navigation door); removed `home.js`'s `case 'truing':`
branch; redirected `device-export.js`'s three dead
`Categories.show('ballistics', ...)` fallbacks to `AppNav.go('home')`,
consistent with every other "done"/error destination in this phase.
Rewrote `lanes.js`'s header comment to state plainly that the Lanes
UI switch (and `Copy.t()`/`Copy.roy()`, also checked and confirmed
dead — same `HomeManager` family) are historical context, not current
navigation, with an explicit note not to repeat this mistake.
`tests/test-truing-single-entry.js` (new, 9 checks) asserts exactly
one file calls `ToolActions.truing()` with real arguments
(`steel-session.js`, twice), that the three removed doors stay
removed, and that the untouched history-chip feature stays intact.

### Note — ScopeCheck: five callers, one screen, not five duplicates

`ScopeCheck.start()` is called from `categories.js`, `home.js`,
`profiles.js` (Paperwork's `rd-scope` row), `rifle-app.js`'s coach
line, and `rifle-why.js`. Each call site supplies its own "where to
land when you're done" callback — this is the intended "many doors,
one room" pattern (same room `AppNav.openRifle` and the switcher both
open, per law 1's own design), not duplicate screens with separate
jobs. No action needed.

### Killed this phase (law 1)

`profiles.js`'s standalone Rifles-list page (`_renderRifleList`,
`_fillFleetReadiness`, `_bindRifleListEvents`) — retired as a page,
content redistributed per the table above. `showRifleList()` itself
kept alive only as a compatibility name (redirects to the Card).

### Already dead, from the prior overnight run (not re-litigated here)

`js/rifle-cards.js` and `css/main.css` — confirmed dead and deleted in
`OVERNIGHT2-REPORT.md`, item 4. Nothing new found dead at the whole-file
level this phase; the sweep above operates at the screen/surface level.

---

## STOP

All five laws are enforced: the rifle-surface budget is down to three
(Card, switcher, Paperwork, plus the Account overlay folded off
Paperwork); every one of the five named save flows — and the two
detail/error paths found to be three taps deep — now ends at the Card
within two taps; the capture button is unconditional and a fetch
failure can no longer masquerade as "no rifles yet"; the rotated-photo
bug's actual root cause (a comment describing behavior the code never
implemented) is fixed and proven against a real EXIF-tagged fixture;
and the full surface inventory is recorded above. Law (5)'s "detailed
truing" finding was WRONG in this report's first pass (cited a stale
`lanes.js` comment instead of tracing live reachability) — caught on
review, corrected, and acted on: the confirmed-dead "Categories →
Truing tool" doors are deleted, the one genuinely live path
(`steel-session.js`'s escape hatch) is kept and locked with a
single-entry-path test, and the stale comment that caused the mistake
is rewritten so it can't mislead the next audit. Full suite green
throughout, protected-engine hashes and canon manifest untouched,
`sw.js` `CACHE_VERSION` 155 → 160 across six commits.
