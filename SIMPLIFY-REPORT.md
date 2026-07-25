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

## OWNER REVIEW QUEUE

1. **Missing mockup** — `proven-target-concept.html` was not in `docs/mockups/`
   when the build started. The branded target was built from the contract's
   Part 3 text. If the mockup differs, drop it in and say the word; artwork is
   isolated in `target-pdf.js` and cheap to revise.
