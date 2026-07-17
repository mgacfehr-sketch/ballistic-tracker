# Waves 1–3 Report — ten features into the foundation

Branch `develop`, overnight run started 2026-07-16 from `8a74eb1` (foundation complete). Updated after every feature.

Per-feature declarations (Master Plan Part 5.2) are listed with each feature: **question · budget · verdict sentence · empty-state sentence · tap count**.

## Status

| # | Feature | Status |
|---|---|---|
| 1 | Scope tracking (tall-target) | ✅ code done |
| 2 | Suppressor configs | ✅ code done |
| 3 | DOPE cards | ✅ code done |
| 4 | Field/steel logging | ✅ code done |
| 5 | Wind grader | ✅ code done |
| 6 | Effective range | ✅ code done |
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

## F2 — Suppressor / bare configurations

**Question:** Is my equipment telling the truth? · **Budget:** A after one-time setup (a checkbox on the rifle form; the toggle is one tap) · **Verdict:** "Can ON shifts POI 0.6 MOA low, 28 fps faster — accounted for." · **Empty state:** "Shoot tagged sessions in both states and yorT measures the shift for you." · **Taps:** 1 (the 🔊/🔇 toggle).

- Pure `configShift(sessions, strings)` in velocity-stats.js (+7 tests): suppressed-minus-bare POI (mean POA offsets) and weighted velocity delta; null until both states have data.
- Card appears in the truth slot ONLY when the rifle has configurations (UX doc rule). Toggle persists `active_config`; the measured shift persists onto the rifle (`config_velocity_delta`, `config_poi_shift`) so the solver can respect it.
- Tagging is automatic everywhere: sessions (save), chrono strings (import), cold-bore manual entries, zero records (field pass-through) — all null for single-config rifles.
- Respected by: the solver (suppressed MV = load MV + measured delta) and the zero-status card (a bare zero no longer masquerades as a suppressed zero).
- **Judgment calls:** shift requires ≥1 session per config (not 2) to speak early but is labeled measured, not promised; "accounted for" claims only what's wired (MV delta in solver, config-aware zero status) — POI shift is reported but not auto-dialed anywhere.

## F3 — Printable DOPE cards

**Question:** What do I dial? · **Budget:** C (5-tap wizard) · **Verdict:** the card itself — header auto-prints load · DA · date · zero so future-you knows what card this is. · **Empty state (in-wizard):** "This rifle has no load with BC and muzzle velocity — add them in Profiles." · **Taps:** 5 (rifle → load → format → use → pack).

- Pure `dopeRows(table, {mode, scopeFactor})` (+9 tests): hunt = every 25 yd from 100; comp = one row per whole come-up MOA; come-ups snapped to ¼-MOA clicks; wind 5/10/15 mph columns by linear scaling of the 10 mph solution (drift is linear in crosswind for a fixed trajectory — noted approximation).
- Same trued inputs as the solver: `computeTrajectory()` directly, scope-tracking correction applied to every printed come-up, suppressed MV delta applied when the can is on.
- Three formats sized to real holders (buttstock strip 1.6×4.6", wrist-coach 3×5", full page) rendered on canvas → jsPDF letter with cut-mark rects; **travel pack** = 3 cards at 0/4,000/8,000 ft via `estimatePressureAtAltitude` on one page; single card uses live conditions (NetService, standard-atmosphere fallback).
- Tool `dopeCards` in the drawer ("Put my dope on paper"); presets: hunt/compete/all.
- **Judgment calls:** format picker uses label+description rather than thumbnail pictures (canvas thumbnails deferred to polish — noted against the "shown as pictures" spec); solver's `computeTrajectory` takes pressure not altitude, so travel-pack altitudes convert via the existing pressure model; hunt cards cap at 600 yd, comp at 1,200 yd.

## F4 — Field/steel logging · F5 — Wind grader · F6 — Effective range

(One file, one commit — the three interlock in `js/field.js` + one card; noted deviation from one-commit-per-feature.)

**F4** — Question: Am I getting better? · Budget B, 3-tap law: with sticky defaults the typical string is **hits chip → Save** (2 taps); worst case distance+shots+hits+Save = 4. All chips, zero typing, conditions auto-attach best-effort and never block the save. Rifle defaults from Recents; distance/shots/position sticky per device. Verdict: the log itself. Empty state (on the F6 card): one sentence + [Log field shots].
**F5** — optional collapsible wind call: speed chips + value chips (full/half L-R), post-shot "what actually worked" chips (±0.2/±0.5 mil / my call ✓). Never mandatory. Pure `analyzeWindCalls` (min 5 graded calls per class) + `windInsight` → "You under-call full left winds by ~0.2 mil (6 graded calls)."
**F6** — pure `computeEffectiveRange`: 100-yd bins, ≥5 shots per bin to judge, walk from near until the first failing bin — a good bin BEYOND a failing one never resurrects the range (tested). Card (progress slot, `field` tool): "**90% hit rate: prone 500 yd · seated 200 yd**", wind insight appended when real. 15 new FieldCore tests.
- `field_shots` table = WAVES-migrations M3 (with suppressor-config tag). Tool `field` ("Know my ethical range") adds the Home action + card; presets hunt/compete/all.
- **Judgment calls:** wind "slider" is speed+value chips (gloves-friendly, no typing — a literal slider is worse outdoors); wind actual captured as the signed correction that worked (±mil chips), positive = called under; effective-range needs ≥5 shots per bin before judging (silence over noise); hits chips step by 2 above 10 shots.

## Notes so far

- `docs/` (the three design docs) is untracked in git — intentional? Commit it if you want the specs versioned.
