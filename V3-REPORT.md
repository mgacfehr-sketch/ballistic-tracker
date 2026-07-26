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

## OWNER REVIEW QUEUE

- (accumulates during the run)
