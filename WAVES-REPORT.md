# Waves 1–3 Report — ten features into the foundation

Branch `develop`, overnight run started 2026-07-16 from `8a74eb1` (foundation complete). Updated after every feature.

Per-feature declarations (Master Plan Part 5.2) are listed with each feature: **question · budget · verdict sentence · empty-state sentence · tap count**.

## Status

| # | Feature | Status |
|---|---|---|
| 1 | Scope tracking (tall-target) | ✅ code done |
| 2 | Suppressor configs | — |
| 3 | DOPE cards | — |
| 4 | Field/steel logging | — |
| 5 | Wind grader | — |
| 6 | Effective range | — |
| 7 | Ammo lot manager | — |
| 8 | Recipes + component lots | — |
| 9 | Ladder test | — |
| 10 | Load logbook | — |

## F1 — Scope tracking (tall-target test)

**Question:** Is my equipment telling the truth? · **Budget:** C (wizard) · **Verdict:** "Your clicks are X% small — fixed. Every solution is now corrected automatically." · **Empty state:** "This scope's tracking has never been verified — most scopes are 2–5% off, silently." + [Verify scope tracking] · **Taps:** 5 wizard taps + 1 number + 1 photo + 4 measurement taps (Budget C — wizard law, resumable).

- Pure `scopeTrackingAnalysis` + `applyScopeCorrection` in calculations.js (+13 tests): factor = actual/expected travel; cant warning when lateral drift > 2% of expected.
- WizardShell gained a reusable **custom step type** (`mount(el, state, api)` — advances via `api.submit`); the measure step is photo + 4 taps: two grid marks 6" apart set scale (no typing), then bottom/top POI.
- Correction stored ON THE RIFLE (`scope_*` columns, WAVES-migrations M1) — **judgment call:** no separate scope entity until scope-swapping demand exists.
- Applied silently: solver come-up column (+footnote when >1%), Zero Guardian click counts (effective click = nominal × factor), DOPE cards (F3).
- Truth-slot card: silent one-liner when healthy+fresh; speaks when off >1%, cant-warned, or stale (>1 yr); empty state teaches. Tool `scopeTruth` in the drawer ("Verify my scope dials true") + Home action; presets: compete/all.
- **Judgment calls:** distance fixed at "a measured 100 yards" (the wizard instructs; not asked as a step); measurement canvas has no pinch-zoom in v1 (tall-target holes are far apart — acceptable; noted for polish).

## Notes so far

- `docs/` (the three design docs) is untracked in git — intentional? Commit it if you want the specs versioned.
