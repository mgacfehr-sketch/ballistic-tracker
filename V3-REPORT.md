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

## Step 6 — Views 5 (Why) and 6 (Full Chart)

- **New `js/rifle-why.js`** — "Proven to 600 — rough" + the four
  calibration elements as tappable rows, reusing
  `CalibrationStatusCard.gather()` (unchanged, pure) for every number and
  word. Rows jump DIRECTLY into their flow, not via the Add chooser:
  Zero → `SessionLaunch.start` (paper capture) · Bullet speed →
  `RifleAdd.showChrono` (a newly-exposed direct entry to view 3c,
  skipping the Paper/Steel/Chronograph picker) · Checked at distance →
  the existing DETAILED `TruingJob.open` (the fixed v2.5 flow, for power
  users — the payoff/view 4 remains the everyday path from the steel
  screen) · Scope check → the existing `ScopeCheck.start` tall-target
  wizard.
- **Real bug caught by screenshot, not code review:** a Thin-confidence
  "Checked at distance" row rendered its ROUGH status word in green
  (confirmed-style) instead of gold — my first pass collapsed a
  three-state row (not done / rough / solid) into a two-state
  `ok`-boolean, so any non-untrued trued state fell through to the "ok"
  (green) branch regardless of confidence. Rewrote with an explicit
  `cls` per state (`ZERO_CLS`/`MV_CLS` maps, and dedicated Good/High-vs-
  Thin/Moderate branching for `trued`) so ROUGH renders gold exactly
  like the mockup's own inline override
  (`style="color:var(--gold-deep)"`).
- **New `js/rifle-chart.js`** — the full 10-row drop table (100–1000 yd)
  plus "FOR YOUR RANGEFINDER: BC · speed" using the same
  `deviceCompensation` math `rifle-simple.js` (v2.5) used, labeled
  "enter as-is" or "enter as-is — do the scope check to refine" per Part
  1's exact wording when tracking is unverified. Print/Share both open
  the existing DOPE card wizard (`ToolActions.dopeCards`) — no new PDF
  generator; the wizard already owns format selection and its own
  print/share sheet.
- Headless proof: both views screenshot-verified against the mockup
  (light + dark) after the color-class fix; a scripted click confirms
  the "Bullet speed" row lands directly on the chrono screen (not the
  chooser), matching "Speed→chrono flow" literally.
- **846 tests green** (unchanged — UI wiring over already-tested
  engines).

### Judgment calls (step 6)
- `ScopeCheck.start`'s wizard still asks Roy to pick a rifle from ALL
  rifles (pre-dates the always-a-specific-rifle model) even though he's
  tapping from THAT rifle's Why screen — a minor redundant tap, not a
  bug. Left as-is rather than rewriting a tested wizard mid-contract;
  worth a follow-up polish pass, noted in the owner queue.

---

---

## Step 7 — View 7 (Record) + edit/delete (Part 3 §3.2)

- **New `js/rifle-record.js`** — tapping a feed item opens a "kv rows +
  Edit/Delete" screen matching the mockup's `#v-record` exactly. Feed
  items (`feed-core.js`) carry only `{id, type, date, title, sub,
  pending}` — no raw row attached — so each type re-fetches its own
  record by id from `db.js`, mirroring the gather-by-rifle pattern
  `rifle-app.js` already uses, rather than threading raw records
  through the feed (would have coupled `feed-core.js`, a pure/tested
  module, to per-type shapes it doesn't otherwise need).
- **Per-type behavior (this is the actual owner-facing design, not just
  wiring):**
  - `steel` (a string, alone or correlated with a truing event) —
    **Edit** appears only for the simple-lane case (exactly one shot):
    lets Roy fix the elevation/windage miss or bullet speed via the
    existing `db.updateSteelShot()`, a **pure data correction with no
    recompute cascade** — it does not re-run truing. Strings with >1
    shot (the advanced/full-tier log) show a shot count instead of a
    per-shot Edit; that log's own screen remains the place to fix it.
    **Delete** removes the string (+ its shots, cascaded in the new
    `db.deleteSteelString()`) and, if the correlated truing event is
    still the load's *current* correction (`load.truedBc`/`truedMv`
    still equals the event's `newValue`), asks a second, separate
    confirm to also "undo" — reverting the load's trued value back to
    the event's `oldValue` via `updateLoad`. The `truing_events` row
    itself is **never deleted** (append-only, STANDARDS §6.2) — it just
    stops being "current."
  - `zero` / `speed` / `cleaning` — plain Delete only (no Edit — these
    are direct log entries, not something to hand-correct in place).
    New additive `db.js` methods: `deleteZeroEvent`, `deleteMvMeasurement`
    (both follow the existing `deleteCleaningLog` shape exactly).
    Deleting a `zero` record removes only the confirmation event — the
    underlying paper session stays in the rifle's paperwork untouched.
  - `correction` (an uncorrelated truing event — the detailed lane, or
    a simple correction with no matching string) — **read-only, no
    Delete**, with an explicit one-line note that this is a permanent
    history entry. This is the append-only doctrine made visible to
    Roy instead of just silently enforced.
  - `paper` — hands off entirely to the existing, mature session-detail
    screen (`history.js`'s `showSessionDetail`, with its own image
    load/save/share and delete) via a new `AppNav.openSession(sessionId,
    rifleId)` rather than rebuilding that UI a second time. Smaller
    change, per the contract's own tiebreaker.
- **New pure helper `feed-core.js`: `findTruingForString(st,
  truingEvents)`** — the same string↔event correlation `buildFeed()`
  uses internally, exposed standalone so the record view can answer
  "what correction came from this string?" without re-deriving the
  whole feed. Exported and covered by the existing 39 `feed-core`
  tests continuing to pass (no behavior change to `buildFeed` itself).
- **`db.js` additive-only, three new methods** (all scoped by
  `user_id`, matching every existing delete): `deleteZeroEvent`,
  `deleteMvMeasurement`, `deleteSteelString` (cascades `steel_shots`
  first, then the string — orphaned shots would be harmless either way
  since they're always queried scoped to `string_id`, but cascading is
  cleaner).
- **Verification:** built a scratchpad harness (`harness-v3-record.html`
  + `inspect-v3-record.js`) with a mock db capturing every write call.
  Screenshotted `steel` (with a correlated "kept" correction row),
  `zero`, `speed` in both themes, plus the `steel-edit` form and a live
  `steel-delete` click-through. The delete run confirmed the full
  undo-cascade path end to end: `deleteSteelString('st1')` →
  `updateLoad({truedMv: 2960})` (reverted from 2923, the event's
  `oldValue`) — proving the "still current → offer undo" branch fires
  correctly, not just that it compiles.
- **821 tests green** across the full `tests/test-*.js` sweep (0
  failures) — unchanged from step 6's count; no new pure module this
  step, only additive `db.js` methods and UI wiring over already-tested
  engines.

### Judgment calls (step 7)
- Chose **not** to add `deleteTruingEvent` to `db.js` at all, even
  though a generic "delete this record" screen might reach for one —
  append-only history is a named architecture rule (STANDARDS §6.2),
  not a style preference, so the record view models "undo" as a
  forward-moving `updateLoad` write instead of a row deletion.
- `cleaning` records reuse the pre-existing `db.deleteCleaningLog` —
  no new method needed there.
- Multi-shot (`full`-tier) steel strings get a read-only shot count
  instead of a per-shot editor in this screen — editing many shots at
  once belongs to the advanced logger, not the one-glance record view;
  flagging in case the owner wants that log's own edit affordance
  extended later rather than duplicated here.

---

---

## Step 8 — View 8 (Paperwork) drill-down

- **The rifle name is now always the tap target for THE RIFLE'S
  PAPERWORK**, reusing `ProfileManager.showRifleDetail()` via
  `AppNav.openRifle(rifle.id)` — no new screen built; per the contract,
  view 8 is explicitly "reuses the existing pipeline," and that screen
  (rifle bio, loads, stats, "Everything else" utility shortcuts) is
  already mature.
- **Judgment call — the switcher moved off the name.** Before this
  step, tapping the name with >1 rifle opened the "Which rifle?" plain
  list (`_openRifleList`); with exactly 1 rifle the name wasn't tappable
  at all. Since the contract is explicit that the name opens Paperwork,
  the switcher trigger moved to the dots row instead (now a real
  `<button id="rf-dots">`, padded to a 44px tap target per CLAUDE.md's
  touch-target rule — the dots themselves stay visually 6px). Swipe
  between rifles still works exactly as before; this only changes the
  *tap* target. Screenshotted both paths (`rname` → opens Paperwork
  with the correct rifle id; `dots` → opens the switcher overlay) —
  both fire correctly, no runtime errors.
- **Found and fixed a real dead-end**: with the bottom tab bar gone
  (step 1), `ProfileManager`'s top-level "Rifles" list
  (`_renderRifleList` — reached via Paperwork's own back button, and
  itself hosting Add rifle / Misc sessions / Account deletion) had NO
  way back to Home at all — it was built assuming the tab bar handled
  that. Added a `‹ Home` backline wired to `AppNav.go('home')`. This
  closes the loop: Home → tap name → Paperwork → back → Rifles list →
  back → Home. Without this fix, Paperwork would have been a one-way
  door the moment it became reachable from the resting screen.
- **821 tests green**, no regressions (nav-wiring + one CSS button-reset
  change only, no new pure logic this step).

### Judgment calls (step 8)
- Left Paperwork's "Everything else" shortcut list (`Categories.KEYS`:
  range/steel/loaddev/ballistics/truing/scopetrack/records) untouched.
  These route into the OLD category screens — the same pattern Part 2
  kills as *primary* navigation — but several of them (cleaning log,
  wind call, DOPE log, scope-adjustment history, records/export) have
  no v3 equivalent yet and need *some* entry point. Pruning/replacing
  this list is exactly what step 11's "retire old surfaces + mapping
  table" is for, so it's flagged there rather than decided here as a
  side effect of just wiring the back-button. **Owner-relevant**: this
  list is now more reachable than before (Paperwork previously had no
  path back to it either), so it's worth a look before step 11 finalizes
  what stays.
- Did not attempt to fix `js/device-export.js`, `js/home.js`,
  `js/rifle-simple.js`'s stale `Categories.show(...)` references found
  during this step's grep sweep — none of them are reachable from any
  currently-rendered screen (they belong to the retired-pending
  HomeManager/Lanes stack), so fixing them now would be dead-code
  churn ahead of step 11's actual retirement pass.

---

---

## Step 9 — Onboarding shrink + suppressor question move

- **`js/onboarding.js`: dropped the 'suppressed' step.**
  `ONBOARDING_WIZARD.steps` goes from 3 to 2 (rifle → bullet & box
  velocity); `_completeFirstRun` no longer branches on
  `answers.suppressed` or calls `Suppressors.setEnabled`/`addSheet` —
  first-run always lands straight on the resting screen. Bumped
  `version: 3 → 4` (documentation only — nothing in `wizard.js` actually
  reads it; no persisted partial-wizard state exists to collide with).
  Most Roys shoot bare; asking a binary question about a use case that
  doesn't apply to most people, during the 90-second first payoff, was
  pure friction for the common case.
- **The setting didn't just move — it got a permanent home.** Before
  this step, `Suppressors.isEnabled` (a global user setting) could
  ONLY be set to `true` from the onboarding wizard — there was no other
  code path that ever called `Suppressors.setEnabled`. Removing the
  onboarding step without adding a replacement would have made "shoot
  suppressed" **permanently unreachable** for anyone who didn't hit
  that exact wizard step (new users afterward, and existing users who
  said "no" once). New `ProfileManager.prototype._fillSuppressorFold`
  adds a standing "Suppressed shooting" fold to the Rifles list (next
  to the existing Account fold, same visual pattern) — Off shows "Turn
  on & add a can" (sets the flag, then opens the existing `addSheet`);
  On shows "Manage cans" / "Turn off". Reuses `Suppressors.addSheet`
  and `setEnabled` verbatim — no new suppressor logic, just a
  reachable, standing entry point instead of a one-shot gate.
- **Verification**: a scratchpad harness
  (`harness-v3-suppressor.html`/`inspect-v3-suppressor.js`) drove all
  three states — Off (default), the full Turn-on → add-a-can →
  Save → Done round trip (confirmed `suppressor_enabled: true` and the
  new can both land in the mock db), and a pre-enabled Manage view.
  All three render correctly with no console/page errors; screenshot
  confirms the fold matches the existing Account fold's visual
  language exactly.
- **821 tests green**, no regressions (`test-onboarding.js` only
  exercises the pure OCR parser, untouched by this step).

### Judgment calls (step 9)
- Did not add a "how do I get here" hint anywhere else in the app
  (e.g. on the Add→Steel screen) pointing at the new fold — the
  existing "advanced" and per-screen link patterns already establish
  that secondary settings live one tap away in quieter spots, so this
  follows precedent rather than needing new discovery UI.
- Left `Suppressors.addSheet`'s copy (`opts.intro` wording: "Sessions
  will ask which can is on…") unchanged even though it was originally
  written for the onboarding context — it reads fine standalone too,
  so didn't touch working copy that isn't wrong.

---

---

## Step 10 — Offline pickers (§3.1) + sync visibility (§3.3)

- **§3.1, root cause found and fixed: `db.js`'s `getLoad(id)` had NO
  offline-cache fallback at all** — unlike `getRifle`, `getAllRifles`,
  `getLoadsByRifle`, and `getBarrelsByRifle`, which all check
  `OfflineCache.isOnline()` and fall back to IndexedDB on failure.
  `SessionFlow.prototype._selectProfile` (the code that turns "tap
  Paper on this rifle" into a rifle+load+barrel bundle and advances
  the wizard) calls `getLoad(loadId)` inside a bare `Promise.all` with
  no catch — offline, that promise rejected and `_selectProfile` simply
  never called `_nextStep()`. Starting a paper session offline would
  silently strand Roy on the picker step with no error and no visible
  cause. Added `OfflineCache.getCachedLoad(id)` (a straight primary-key
  `.get()` on the existing `loads` IDB store — no schema change) and
  wired `getLoad` to the same isOnline-check-then-catch-fallback shape
  every other cache-backed read already uses.
- **A second, shallower §3.1 gap**: `window.SessionLaunch.start` (the
  seam every Add→Paper button calls) bundles `getLoadsByRifle` (cache-
  safe) with `getSessionsByRifle` (never cached — sessions aren't a
  cache store) in one `Promise.all`, no catch. Offline, the sessions
  fetch rejected and sank the auto-select entirely — even after fixing
  `getLoad`, Roy would have landed on the raw profile picker instead of
  going straight to image capture, since the auto-selection itself
  never got to run. Added `.catch(() => [])` to that one call — losing
  "which load was last used" recall offline is an acceptable trade
  (it just falls back to the load's own default), losing the whole
  auto-select is not.
- **§3.3, sync visibility didn't survive the rebuild.**
  `SyncQueue.renderStatus(el)` — the "N saves waiting to sync · Sync
  now" banner (§3.2, pre-existing, pure) — was previously called only
  from `categories.js` (the Universal Home header, and per-category
  headers). Neither is reachable from the new resting screen, so a
  user who saved offline had **no aggregate indication anything was
  queued** — only the per-item "waiting to sync" label already present
  on individual feed rows (via `feed-core.js`'s `pending` flag), which
  doesn't surface parked/errored ops or offer a manual retry. Added a
  `#rf-sync` slot to `rifle-app.js`'s resting screen (between the
  rifle name/dots and the PROVEN TO number — first thing seen, and
  zero-height when the queue is empty) and wired it two ways: painted
  once per `_renderRifle()` for the initial state, and repainted by a
  single `SyncQueue.onChange` listener registered once in `init()`
  (not per-render, so swiping between rifles or opening/closing
  sub-screens never piles up duplicate listeners).
- **Verification**: two scratchpad harnesses. `harness-v3-sync.html`
  drove the real `SyncQueue`/IndexedDB stack — forced the browser
  context offline, queued a real `addSteelString` write, confirmed the
  resting screen showed both the aggregate banner ("1 save waiting to
  sync · Sync now") AND the matching feed item ("Steel at 600 ·
  waiting to sync"), then simulated reconnect + successful flush and
  confirmed the banner cleared. `harness-v3-offline-load.html` seeded
  the real IndexedDB `loads` store the way `cacheAll()` would, forced
  `OfflineCache.isOnline()` false, and called the real
  `BallisticDB.prototype.getLoad` directly — confirmed it resolves the
  cached, correctly-camelCased row instead of hanging/rejecting.
- **821 tests green**, no regressions.

### Judgment calls (step 10)
- Did not attempt the third Part-3 §3.1 scenario literally ("STARTING
  a session offline" from a stone-cold app launch with zero prior
  online visit, i.e. an empty IndexedDB cache) — that's not fixable at
  this layer; there is nothing to fall back to if the device has never
  synced. Existing behavior (rifle/load picker shows empty, same as
  before this step) is correct and unchanged. Step 12's airplane-mode
  walk should confirm this is understood as expected, not a bug.
- Left `SyncQueue`'s per-category `renderStatus` call sites in
  `categories.js` in place rather than removing them — those screens
  still render when reached via Paperwork's "Everything else"
  shortcuts (step 8's flagged item), so their own sync banners are
  still occasionally relevant until step 11 decides their fate.

---

## OWNER REVIEW QUEUE

- (accumulates during the run)
