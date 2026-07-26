# V3-REPORT.md — Build Contract v3.0 ("One Screen: the app IS the rifle")

Branch `redesign` · started 2026-07-26 · baseline 807 tests green · SW v125 at start.

Thesis: Roy, handed the phone cold, must be able to add what he shot today
without asking anyone. One resting screen (his rifle), one way to add data,
drill-downs for curiosity. This contract supersedes v2.4/v2.5's navigation
wherever they conflict — a deliberate ground-up UX rebuild over the same
engines and data.

---

## Step 0 — Mockup confirmed, architecture plan

`docs/mockups/proven-v3-concept.html` is present (owner placed it) — read in
full. It is a self-contained 11-screen tap-through (`.view.on` show/hide) with
its own inline CSS defining a new visual language: Barlow Semi Condensed
(headings/numbers-labels/buttons), Inter (body), JetBrains Mono (data values),
a warmer paper palette, and specific components (`.numberbox`, `.chart`/`.crow`,
`.feed`/`.fitem`, `.bigchoice`, `.stepper`, `.chip`, `.seg`, `.kv`, `.gold`,
`.link`, `.back`).

### Reuse survey (before writing new code)
Enormous overlap with what v2.4/v2.5 already built — this is UI recomposition,
not new engineering, per the contract's own framing:
- **View 3a (Paper)** = the existing 7-step `SessionFlow` capture pipeline
  (canvas, ArUco calibration, POA, impacts, results) — launch via
  `SessionLaunch.start()`, unchanged.
- **View 3b (Steel, simple)** ≈ v2.5's `log-shooting.js` steel screen +
  `simple-true.js`'s `askHit` screen, merged onto ONE screen per the mockup
  (distance + dialed + hit fields together, no intermediate navigation).
- **View 4 (Payoff)** = `simple-true.js`'s payoff screen almost verbatim —
  `simpleTrueObservation()` / `simpleTruePayoffCopy()` reused as-is (pure,
  already tested, already implements the zero-band/capped honesty guards
  the contract calls out).
- **View 3c (Chrono)** ≈ `mv-entry.js`'s `MvEntry.open()` sheet, rendered as
  a full view instead of an overlay.
- **View 5 (Why)** ≈ `calibration-status.js`'s `CalibrationStatusCard`
  derivation (`deriveCalibrationStatus`) — same four elements, new layout,
  reused as-is (pure).
- **View 6 (Full chart)** — new composition, but built directly on
  `ballistic-solver.js`'s `computeTrajectory` + `truing-core.js`'s
  `deviceCompensation`, exactly as `rifle-simple.js` already did for its
  rangefinder line.
- **View 7 (Record)** — new: the fat-finger edit/delete fix the owner
  flagged in the v2.4 contract's original ask, never actually built until
  now.
- **View 8 (Paperwork)** — reuses `profileManager.showRifleDetail()`
  (already has build sheet, loads, suppressors, barrel, report/certificate,
  export) rather than a rebuild; reordered only if grossly mismatched.
- **Next-action engine** (`next-action.js`) — repurposed per Part 2: its
  output becomes the coach line under the number / in the Why sheet, never
  a separate widget.

### Architecture decision
One new manager, `js/rifle-app.js`, owns ALL of views 1/2/3b/3c/4/5/6/7 as
sibling `.view` divs inside `#view-home` (mirrors the mockup's own
`.phone > .view` structure exactly). View 3a (paper capture) and view 8's
underlying screens (`#view-profiles`) stay separate top-level `.app-view`
containers reached via the existing `AppNav.go()` — RifleApp calls out to
them and they return to `AppNav.go('home')` on completion, exactly the
existing pattern. This avoids rewriting the mature capture wizard or the
paperwork/profile CRUD screens.

The bottom navbar (`#app-nav`) is removed from `index.html`. `switchView`'s
`'home'` branch now mounts `RifleApp` instead of `HomeManager`. Old surfaces
(`home.js`, `categories.js`, `log-shooting.js`, `rifle-simple.js`, `lanes.js`)
stop being called from `app.js` in this step but their `<script>` tags and
files stay — full unlink + retirement documented in step 11 per the build
order.

### CSS decision
New component classes use existing token variable NAMES (no parallel token
system) but the mockup's exact color VALUES are adopted into `tokens.css`
(mockup is the new source of truth, same relationship as v2.3's
`proven-templates-v2.html → tokens.css` precedent). New font tokens
(`--font-display` for Barlow Semi Condensed) added; `--font-ui`/`--font-mono`
gain Inter/JetBrains Mono as preferred faces with the existing system-font
stacks as fallback (offline-safe — Google Fonts CDN failure just degrades to
the fallback stack already in the token, no functional break). Dark theme
values are NOT mockup-specified (light-only mockup) — left as-is; new v3
classes reference tokens exclusively so dark mode inherits automatically,
verified visually in QA.

New v3 component classes are prefixed `v3-` (`.v3-numberbox`, `.v3-chart`,
`.v3-stepper`, `.v3-chip`, etc.) to avoid any collision with existing
`.chip`/`.chip-opt`/`.stepper` classes still used by `steel-session.js`'s
full logger, which view 5 (advanced inline reveal) re-renders as-is.

### Judgment calls (step 0)
- Admin dashboard access (header utility button, owner-only) is OUT OF
  SCOPE for the eight-view kill list — it was never a Roy-facing nav tab
  (v2.3 already made it a header button, not a tab) and isn't named in
  Part 2. Left untouched.
- "Advanced" (3b) will route to the existing full `steel-session.js` screen
  (a separate, already-built, already-tested screen with its own Back)
  rather than a literal DOM-inline merge into the same screen element —
  functionally one tap deep either way, same "not a mode/setting" property,
  but much lower risk than refactoring steel-session.js's rendering to be
  embeddable. Flagged per the contract's own guidance ("choose the smaller
  change and flag it when uncertain").

---

## Step 1 — View shell, color law, safe-area, scroll lock

- **`tokens.css`** repointed to the v3 mockup's palette (mapped onto the
  EXISTING variable names — no parallel token system): warmer paper
  background, refreshed ink/soft/gold/rule/green/red values. New font
  tokens: `--font-display` (Barlow Semi Condensed — headings/title/
  heading tiers now use it sitewide, a deliberate unified type refresh
  since headings are sparse and benefit from brand consistency); `--font-ui`
  gains Inter, `--font-mono` gains JetBrains Mono, both as PREFERRED faces
  with the existing system stacks as fallback (CDN failure degrades
  visually only, never functionally). New `--type-fieldlabel` token kept
  SEPARATE from `--type-label` deliberately — `--type-label`/`.t-micro` is
  used at high density across dozens of untouched legacy screens (the
  paperwork drill-down, the advanced steel logger) and changing it
  globally would visibly break those screens; the mockup's condensed
  letter-spaced field-label treatment is new and scoped to v3 screens only.
  New `--type-mono-hero` (56px) for the number.
- **Google Fonts CDN** pinned in `index.html` (Barlow Semi Condensed
  600/700/800, Inter 400/500/600, JetBrains Mono 500/600/700) with
  `preconnect` hints — matches the mockup's own font request exactly.
- **New `css/ui.css` §19** — all v3 component classes, prefixed `v3-` to
  guarantee zero collision with legacy classes the retained screens still
  use (`.chip`/`.chip-opt`/`.stepper` are all still live in
  `steel-session.js`'s full logger, reached via the "advanced" link in
  step 5): `.v3-brand`, `.v3-rname`/`.v3-dots`, `.v3-numberbox`,
  `.v3-chart`/`.v3-crow`, `.v3-feed`/`.v3-fitem`, `.v3-gold`/`.v3-link`/
  `.v3-back`, `.v3-bigchoice`, `.v3-fieldlbl`/`.v3-chips`/`.v3-chip`,
  `.v3-stepper`, `.v3-payoff`, `.v3-seg`, `.v3-kv`, `.v3-rfbox`.
- **The bottom tab bar is REMOVED** (`index.html`'s `#app-nav` deleted per
  Part 2). `.app-view` gains `env(safe-area-inset-bottom)` padding via
  `.screen` (previously absorbed by the navbar's own padding — now every
  view needs it directly since nothing sits below it).
- **`app.js`**: `switchView('home')` now mounts `RifleApp` instead of
  `HomeManager`; `HomeManager`/`Categories`/`Lanes` stay instantiated
  (nothing calls them to render) for an orderly step-11 retirement rather
  than a risky mid-contract rip-out.
- Fixed two dead click handlers left over from navbar removal
  (`session-flow.js`, `ballistic-solver.js` — both clicked
  `.nav-tab[data-view="profiles"]`, now call `AppNav.go('profiles')`
  directly).
- **New `js/rifle-app.js`** — `RifleApp` manager, the shell + rifle
  resolution (by id, by Recents, else first) + no-rifle invite. Full
  number/chart/feed data wiring is step 2's job; this step proves the
  mount/routing/fonts/safe-area/color-law mechanics.
- Headless proof: no-rifle, with-rifle (2 rifles, dots visible), and dark
  theme all screenshot-verified against the mockup's composition —
  condensed headings, mono hero number, letter-spaced field label, gold
  button, warm paper background all render correctly in both themes.
- **807 tests green** (unchanged — this step is shell/CSS/routing, no new
  pure logic yet).

---

## Step 2 — View 1: The Rifle, fully wired

- **New `js/feed-core.js`** (pure, 39 tests) — `buildFeed()` merges six event
  families (sessions/zero/steel/truing/speed/cleaning) for one rifle into a
  single newest-first list, worded the way Roy would say it. The one
  genuinely tricky piece: correlating a simple-lane steel string with its
  truing event (same distance, applied within 10 minutes — exactly how
  `log-shooting`/`simple-true` save the pair) so they render as ONE feed
  item ("Steel at 600 · dial corrected 4.0 → 3.8") instead of two. A zero-
  confirming session and its zero_event fold into one "Zero confirmed" item
  the same way — never double-counted. Uncorrelated truing (detailed lane,
  or the owner's 925-yd string reviewed later) shows standalone as "Rifle
  trued". `pickDropRows(hotYd)` — the embedded chart's 4 rows, always
  ending on the proven-to distance, padding forward when it's small so the
  chart is never sparse.
- **`simple-true.js`** gains one additive field: `_keep()` now stashes the
  computed `payoff` (oldDial/newDial/units/moved) into the truing event's
  `inputs` blob, so the feed can render "dial corrected X → Y" by reading
  it back instead of re-running trajectory math per feed item.
- **`js/rifle-app.js`** — `_renderRifle` now pulls real data: calibration
  status via the existing `CalibrationStatusCard.gather()` (untouched, pure
  derivation reused verbatim) drives the number and the zero✓/speed✓
  indicators; the coach line under the number is the next-action engine's
  output, exactly as Part 2 mandates ("repurposed... never a separate
  widget") — ported the gathering logic from v2.4's `home.js` rather than
  calling into it (home.js is slated for full retirement in step 11, no
  sense wiring a dependency on code about to be deleted); the embedded
  chart calls `computeTrajectory` directly (same engine `rifle-simple.js`
  used for its rangefinder line) for the 4 rows from `pickDropRows`; the
  feed gathers all six sources and renders via `buildFeed`. Swipe/dots
  ported from v2.4's card-nav gesture handler. Tap targets wired to
  `RifleWhy`/`RifleChart`/`RifleAdd`/`RifleRecord` — stub globals that
  steps 3–7 will implement; tapping them today is a silent no-op (`if
  (window.X)` guards), never a crash.
- **CSS bug found and fixed**: `.v3-rname-tap` was written as a descendant
  selector (`.v3-rname button.v3-rname-tap`) but the button carries BOTH
  classes on one element, not a nested structure — it never matched, so
  the multi-rifle name button wasn't centered. Fixed to a compound selector
  (`.v3-rname.v3-rname-tap`) plus an explicit `width:100%` (buttons don't
  reliably fill their container under `display:flex` the way a `div`
  does). Caught by the headless screenshot, not by eyeballing the code —
  confirms the "verify each step's screens against the mockup" discipline
  the contract asks for.
- **Word choice**: the mockup's coach text is illustrative ("one more shot
  at 600 confirms it"); I render next-action's OWN derived detail/title
  text rather than hand-copying the mockup's exact sentence, since
  next-action's ladder already covers every state (not just "confirm-true")
  and its wording is tested. `_confWord()` maps engine confidence words to
  Roy's ("Thin"→"rough", "Moderate"→"getting there", "Good"→"solid",
  "High"→"locked in") — new local vocabulary, NOT routed through the old
  `Copy.roy()`/Lanes system, which Part 2 kills as a concept; v3 screens
  speak Roy's words directly, unconditionally.
- Headless proof: the full mockup composition (brand → rifle+dots → number
  with confidence/coach line → embedded 4-row chart with the proven
  distance highlighted gold → gold button → feed with 4 correctly-merged,
  correctly-worded items) renders pixel-close to the mockup in both
  themes, using entirely real computed data (a genuine `computeTrajectory`
  drop table, genuine `deriveCalibrationStatus`/`deriveNextAction` output,
  genuine `buildFeed` merge).
- **846 tests green** (807 + 39 feed-core).

---

## Steps 3+4 — Add flow (views 2/3a/3b/3c) + Payoff (view 4), combined

**Judgment call: merged into one commit.** Steel's "Done" button and the
payoff screen are one continuous user action — building the steel screen
without a working Done (step 3 alone) would mean either a dead button or
throwaway placeholder code immediately replaced by step 4. Splitting them
would have cost real work for no verification benefit; the contract itself
says "choose the smaller change when uncertain." Both are still their own
files, independently reviewable, and the QA gate (screenshots + a full
data-write inspection) covers the whole flow as one unit.

- **New `js/rifle-add.js`** — view 2 (three big buttons, exact mockup
  copy) · view 3a hands off to the existing `SessionLaunch.start()`
  (untouched capture pipeline) · view 3b (Steel) puts HOW FAR (chips +
  custom) / I DIALED / IT HIT on ONE screen exactly per the mockup —
  a real compositional change from v2.5's two-screen `log-shooting.js` +
  `simple-true.js` flow. "advanced" routes to the existing
  `steel-session.js` full logger (step 5's call, made now since it's a
  one-line wire); "add bullet speed" reveals an inline field. Suppressor/
  lot apply silently from last-used (`Suppressors.getLastUsed`, the
  load's `lotNumber`) — no visible question, matching the contract's
  steel spec (no suppressor UI mentioned at all for view 3b). Done ALWAYS
  saves the string + shot first (Part 2 §3.4), then hands off to
  `RiflePayoff.run()`. View 3c (Chronograph) — type-in primary (average
  stepper + shot-count chips including "just a guess" → honest estimated
  fallback, same provenance rule as v2.5's `mv-entry.js`), "import a file
  instead" routes to the existing chrono-import screen.
- **New `js/rifle-payoff.js`** — runs `simpleTrueObservation()`
  (unchanged, already-tested pure engine) and renders the mockup's exact
  payoff copy, byte-for-byte: "Got it. Your 600-yard dial changes from
  10.9 to 11.6." with strikethrough-old/green-new, the two-line sub, gold
  Keep it, text Undo. The honesty guards (zero-band / bracket-capped)
  render "Couldn't use that one" with the plain reason — the string
  still stands, exactly as Part 1 requires.
- **`simple-true.js`'s `_keep()` exposed publicly** (`SimpleTrue.keep`)
  so `rifle-payoff.js` shares the exact same append-only truing-event
  write path as the old `askHit` flow, instead of a second copy of that
  logic. Caught and fixed a real bug while wiring the caller: `_keep`
  reads `ctx.dialed`/`ctx.env`/`ctx.mvMeasured`, which my first draft of
  `rifle-payoff.js`'s `ctx` object omitted — would have silently stored
  `dialed: 0` and the wrong env source on every kept correction. Fixed
  before it shipped by re-reading `_keep`'s actual field reads against my
  call site, not just trusting the function signature.
- **Two real layout bugs found by screenshot comparison, not code review:**
  (1) `.v3-back` was `position:absolute` with no positioned ancestor in
  the real DOM — pinned to the viewport instead of the screen, colliding
  with headings. Replaced everywhere with the app's existing in-flow
  `.pagehead`/`.backline`/`.pagetitle` pattern (already used by dozens of
  screens) rather than fixing the custom class — removed `.v3-back`
  entirely so it can't be reused broken. (2) Per-screen `.v3-brand`
  duplicated the persistent `#app-header`'s brand lockup, which is
  already visible above every view in the real app (invisible in my
  isolated scratchpad harnesses, which don't include that header) —
  removed the redundant rendering from view 1 rather than hiding the
  real header. Both bugs are exactly why the contract insists on
  screenshot verification each step, not just "looks right in the code."
- **Verified end-to-end, not just visually**: a scripted click-through
  (dial 11.0 MOA at 600, hit 4" low, Done, Keep) was inspected at the
  data layer — the real steel string, real shot (correct sign), and real
  truing event all landed with correct values; the doctrine correctly
  routed to BC (not MV) because MV was already measured in the test
  fixture, exactly matching engine doctrine ("MV is measured — the
  honest fix is BC... at 40% of supersonic range... extrapolated");
  the load's `truedBc` updated. No fork was shown to Roy at any point.
- Headless proof: views 2/3b/4 screenshot-verified against the mockup
  (light + dark) after both bug fixes — pixel-close composition, correct
  copy, correct color law.
- **846 tests green** (unchanged — this step is UI wiring over
  already-tested engines; no new pure logic).

---

## Step 5 — Advanced inline reveal on steel

Confirmed the step-0 judgment call and fixed what it exposed. "advanced"
(view 3b) already routed to the existing `steel-session.js` full logger via
`ToolActions.steelSession(db, rifle.id)` — wired in step 3. What step 5
actually needed: that screen's OWN navigation (back, done, no-rifle
fallback) still pointed at `Categories.show('steel', ...)`, a screen that
no longer renders anything reachable from the new UI. Tapping back from the
full logger would have dumped Roy into a stale, orphaned intermediate
screen instead of returning to the rifle.

- **`js/steel-session.js`**: 5 call sites (`open`'s no-rifle fallback,
  the setup screen's back button, the saved-string screen's Done, and both
  `ToolActions` launcher fallbacks) now call `AppNav.go('home')`.
- **`js/truing.js`**: found and fixed the identical pattern — 6 call
  sites (reachable from the full logger's own "Send string to Truing"
  follow-on, and from the why-sheet's "Checked at distance" row landing
  in step 6). Same fix, same reasoning.
- Neither file is a protected engine (`STANDARDS.md` §3 lists them as UI
  managers, not engines) — safe to edit; this is exactly the "decorate the
  engines, rebuild the surface" mandate the contract describes.
- Headless proof: a full click-through (view 1 → Add → Steel → advanced)
  renders the complete existing logger (wind clock, distance chips,
  dialed steppers — all untouched, inheriting the v3 font system for
  free since it already used the shared token classes) at full fidelity;
  tapping back lands cleanly on view 1 with the correct rifle, correct
  status, and the empty-feed message rendering correctly.
- **846 tests green** (unchanged — navigation-target fixes only, no new
  pure logic).

---

## OWNER REVIEW QUEUE

- (accumulates during the run)
