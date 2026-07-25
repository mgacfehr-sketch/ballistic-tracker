# SIMPLIFY-REPORT.md — Build Contract v2.4 ("Proven to ___ yards")

Branch `redesign` · started 2026-07-25 · baseline 652 tests green · SW cache v106 at start.

The contract: the honest state of the rifle's data — "Proven to ___ yards" — becomes
the front page and the central mechanic. Card-first Home, next-action engine,
merges/retirements, two-class visual grammar, branded target v2, iOS safe-area fix,
xlsx export, dope_entries reality alignment.

---

## Step 0 — Survey & setup (this commit)

- STANDARDS.md read; v2.3 modules surveyed (home.js, categories.js, tools.js,
  calibration-status.js, truing-core.js, onboarding.js, ui.js).
- Baseline verified: **652 tests green** across 12 suites.
- **Mockup missing:** `docs/mockups/proven-target-concept.html` is NOT in the repo
  (contract said owner was placing it). Part 3 will be built from the contract's
  written spec (top branding, orange diamonds, full-sheet 0.25" grid, marker
  relocation, shared geometry constant). Will re-check for the file at Step 6.
  → OWNER REVIEW QUEUE.
- Committed the owner's uncommitted `REORG-migrations.sql` edit (dope_entries
  lines removed at owner review — the table does not exist in the live DB).
  Code alignment happens in Step 7 (fix 4.3).

### Judgment calls
- (running list per step below)

---

## Step 1 — next-action.js (pure engine + 46 tests)

`js/next-action.js`: `deriveNextAction(input)` — the priority ladder, first unmet
rung wins; dismissed rungs ("Not now", 7 days) fall through to the next; the floor
("You're proven to X — go shoot") is never dismissible. Pure: consumes the already-
derived `deriveCalibrationStatus()` output plus precomputed candidates
(`mvTrueYd` from `prescribeTruingDistances`, usable `distanceStrings`,
`roundsSinceCleaning`) rather than re-deriving — one source of truth for state
words. Dismissal helpers (`nextActionDismissed`, `withNextActionDismissal`) are
pure and immutable; the card will persist the map under a `user_settings` key
(no schema).

### Judgment calls (step 1)
- **`thin` zero does not interrupt** the ladder (rung 2 fires on
  never/adjust/stale/drifted only). Thin is a quality note, not absence — the
  segment sheet and calibration hint already coach it. A thin-zero user is
  proven at 100 and should be pulled toward distance, not held at the bench.
- **Rung-7 rotation implemented as ladder order** (re-true when flagged →
  cleaning note at ≥400 rounds, overridable) — deterministic, no random
  rotation, per "never invent a nag".
- **`re-true` rung added** for flagged truings (numbers underneath changed).
  The contract's rung list implies it via the calibration hint; without it a
  flagged rifle would read "go shoot" while its DOPE is quietly wrong.
- Suite: **46 tests** → running total 698.

---

## Step 2 — Card-first Home (§1.1–§1.4 partial)

`home.js` rebuilt: brand bar → THE RIFLE CARD → four compact doors → Recent.
- **The card:** name + cartridge/load line; "PROVEN TO ___ YARDS" (68px mono,
  gold accents) from the Calibration Status rollup (`calibratedToYd`, 0 when
  none); confidence word under it (rollup word; "Estimated" when proven-to-0);
  4-segment strip (Zero · MV · Trued · Tracking — filled gold when proven,
  caution-tinted when stale/thin/flagged); THE NEXT ACTION button (title,
  detail, gold payoff line) + quiet "Not now"; arrows + horizontal swipe +
  dots between rifles (starts at last-used; swiping updates last-used).
- **Segments deep-link:** tap → the existing what/why sheet, now with a gold
  action button (Confirm zero / Import chrono data / True this rifle / Verify
  tracking). This is Scope Tracking's and Truing's card-side front door.
- `calibration-status.js` (additive): `gather()`/`getStatus()` extracted from
  `render()` (derive without rendering — the card consumes it); `openSheet()`
  exposed with optional action button. Derivation logic untouched (60 tests
  still green).
- **Next-action gathering:** dismissals live in `user_settings`
  `next_action_dismissals` as `{rifleId: {suggestionId: iso}}` (no schema);
  distance strings only queried when untrued (bounded to 5 most recent full
  strings, ≥3 shots); prescription distance via `prescribeTruingDistances`
  guarded try/catch.
- **tools.js:** truing + scopeTracking → `core: true` (always available, no
  door, never toggleable); CHECKLIST_JOBS → rangeSession/steelSession/
  ballistics, all `defaultOn` (§1.5). test-foundation expectation for v1
  migration updated to match the new doctrine (count unchanged).
- **Doors:** HOME_DOOR_KEYS = range/steel/ballistics/records as compact
  `.door` rows; "+ More tools" kept ("Your doors"). Ballistics gains a
  "True this rifle" row (flagged `utility: true` for step 5's restyle).
- New CSS in ui.css (`.rifle-card`, `.rc-*`, `.door`), one new token
  `--gold-on-brand` (payoff-on-ink) in tokens.css — no hardcoded hex outside
  tokens.
- Headless proof: light mid-state (zero-only → "Measure your muzzle velocity
  · Extends your proven range to ~1,075 yd"), dark all-green ("You're proven
  to 700 — go shoot"), fresh (add-load) — all render correctly at 390×844.

### Judgment calls (step 2)
- **Recent strip now renders only when a recent session exists** — the card
  already IS the recent rifle; repeating it without a session was noise.
- **Swipe threshold 48px, must be 2× the vertical delta** — protects page
  scroll on a touch device.
- **Card's "go shoot" floor** renders as a static (non-tappable) statement,
  not a button pretending to do something.
- Paper sessions at distance are NOT counted as truing-ready strings (rung 4)
  — the v2.3 truing flow consumes steel full-tier strings; offering paper data
  it can't ingest would be a lie. Steel-at-distance is the honest trigger.

---

## OWNER REVIEW QUEUE

1. **Missing mockup** — `proven-target-concept.html` was not in `docs/mockups/`
   when the build started. The branded target was built from the contract's
   Part 3 text. If the mockup differs, drop it in and say the word; artwork is
   isolated in `target-pdf.js` and cheap to revise.
