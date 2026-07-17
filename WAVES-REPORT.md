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
| 7 | Ammo lot manager | ✅ code done |
| 8 | Recipes + component lots | ✅ code done |
| 9 | Ladder test | ✅ code done |
| 10 | Load logbook | ✅ code done |

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

## F7 — Factory ammo lot manager

**Question:** Is my equipment telling the truth? · **Budget:** A/B — lot captured once on the load (typed or OCR'd from the box photo), everything after is automatic · **Verdict:** "Federal GMM — lot B runs 45 fps faster than lot A — confirm your zero before it matters." · **Empty state:** none — the card is silent until a drift exists (silence is a feature). · **Taps:** 0 after setup.

- Pure `lotDrift(strings)` in velocity-stats (+8 tests): per-load, newest lot (by string date) vs previous, weighted averages, speaks at ≥30 fps.
- Lot number field on the load form; ammo-box OCR now extracts `lotNumber` too; strings inherit the load's lot at confirmation time (the lot they were shot from).
- Truth-slot card gated to the `chrono` tool; fully silent when lots agree or only one lot exists.
- **Judgment calls:** lot attaches at STRING-CONFIRMATION time from the load's current lot (import-time lot entry deferred — one field per import would break the flow); 30 fps threshold (≈1.5–2" at 400 for typical loads); no Home-alert provider yet (the card covers it; the alerts slot is wired for a future pass).

## F8 — Reloading recipes + component lot tracking

**Question:** Where's my stuff? · **Budget:** C at the bench (typing allowed — the bench exception, stated in the docs) · **Verdict:** the recipe block on the load, kept for them. · **Empty state:** the collapsed "Recipe (handload)" section itself. · **Taps:** n/a (bench form).

- Recipe lives as structured jsonb ON the load (M5): brass make/lot/times-fired, primer make/lot, powder make/LOT/charge, bullet make/lot, seating depth. All-empty saves as null (clean loads stay clean).
- Component pickers remember prior entries via `datalist` + `componentMemory` in user_settings (cross-device, capped 20/kind).
- **Brass firing counts auto-increment**: every saved session on a recipe load adds one firing (best-effort, non-blocking).
- Section renders only when the `bench` tool is active ("Track my handloads" in the drawer; handload/all presets).
- **Judgment calls:** one brass-firing increment per SESSION (not per shot/case — cases fire once per outing in practice; per-case tracking deferred); recipe editing reuses the load form rather than a separate recipe screen; `bench`'s Home action slot points at the ladder test (F9).

## F9 — Multi-group ladder test

**Question:** Which ammo? · **Budget:** C over the existing session engine (the wizard IS the session flow + one split overlay) · **Verdict:** "41.6–42.0 is your window." (honest negative: "No stable window in this series.") · **Empty state:** the Home action shows a one-card explainer that routes into a session. · **Taps:** normal session + shots-per-group chip + one comma-separated labels field + Analyze + Attach.

- Pure `LadderCore.ladderAnalysis` (+10 tests): per-charge centroid + group size via the existing calculations engine; stable window = longest run of consecutive charges with adjacent vertical POI shift ≤ 0.35 MOA (≥2 charges; first run wins ties).
- `splitByTapOrder`: impacts grouped k-at-a-time in FIRE ORDER (the flow instructs tapping in fire order); uneven remainders kept as a short, flagged last group.
- Results-step "Split into ladder groups" button (bench tool, ≥4 impacts) → chips + labels → chart (POI line, green stable-window band, per-charge labels) + starred table rows → "Attach to session" → normal Save stores `session_type='ladder'` + the ladder jsonb (M6).
- **Judgment calls:** groups are assigned by TAP ORDER, not round-robin (v1 limitation, stated in the explainer — shoot charge-by-charge); velocity flat-spot overlay DEFERRED — auto-matching chrono strings to charges is guesswork, and guessing near load-development conclusions violates the no-silent-assignment principle; charge labels are a typed comma list (bench exception).

## F10 — Load-development logbook

**Question:** Where's my stuff? · **Budget:** A — a view; reading is the only interaction. · **Verdict:** the timeline itself, best group starred. · **Empty state:** "Nothing logged with this load yet — sessions and chrono strings will assemble here by themselves." · **Taps:** 0.

- Load detail (bench tool) gains the Recipe block (make/lot/fired counts/charge/seating) + the **Development Log**: every session (🎯 group w/ MOA, 🧪 ladder w/ its window sentence) and every confirmed string (📥 avg/SD, lot, 🔇 config) in date order; best eligible group starred; lot number shown on the load card.
- Pure view over F7–F9 data — no new storage, no migration.

## CONSOLIDATED FINAL REPORT

### Done vs. needs-your-verification

All ten features are **code-complete with pure cores unit-tested** (368 tests across six suites; 10/10 consistency review; every script loads in order; SW shell matches; CACHE_VERSION 78). Everything UI-facing **needs your browser pass** — nothing here has touched a real phone, camera, or the live database.

### Migrations — run `WAVES-migrations.sql` top-to-bottom FIRST

| Block | For | What it adds |
|---|---|---|
| M1 | F1 | 4 `scope_*` columns on rifles |
| M2 | F2 | config columns on rifles/sessions/velocity_strings/cold_bore_shots/zero_records |
| M3 | F4/F5 | `field_shots` table + RLS + index |
| M4 | F7 | `lot_number` on loads + velocity_strings |
| M5 | F8 | `recipe` jsonb on loads |
| M6 | F9 | `session_type` + `ladder` on sessions |

Every block is `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` — additive, re-runnable, existing rows untouched. **Until M1–M2 run, saving a rifle will fail** (the form now sends those columns); until M3, field logging fails; the rest degrade quietly.

### Single-morning browser checklist (in this order)

**Setup:** run WAVES-migrations.sql → hard-reload (SW v78) → drawer: activate everything (or re-run onboarding with "All of it").

1. **F1 scope check:** Home → "Verify scope tracking" → wizard through to the photo step → 4 taps (two 6"-grid marks, bottom POI, top POI) → verdict overlay → rifle's truth card shows the correction → Solver come-ups change and show the footnote → Zero Guardian clicks change with the factor.
2. **F2 configs:** rifle edit → check "sometimes runs a suppressor" → 🔊/🔇 card appears; toggle it; shoot/save a session in each state (+import strings) → shift sentence appears; suppressed solver MV shifts by the measured delta; zero-status card ignores the other config's sessions.
3. **F3 DOPE:** Home → "Print a DOPE card" → 5 taps → PDF: header shows load/DA/date/zero; strip format prints at cut size; travel pack = 3 cards, one page; come-ups match the solver (both corrected).
4. **F4/F5 field:** Home → "Log field shots" → hits chip → Save (2 taps with sticky defaults); wind call + actual once; row in Supabase with auto-attached weather.
5. **F6:** after ~5 strings at 2-3 distances, the rifle's effective-range card speaks; wind insight appears after 5+ graded calls (fake a few).
6. **F7 lots:** two lots on one load (edit lot between imports) with ≥30 fps difference → amber lot card; matching lots → silent.
7. **F8 recipes:** bench active → load form recipe section; save → recipe block on load detail; component names suggest on the next load; save a session on that load → brass fired count +1.
8. **F9 ladder:** session with 9+ impacts tapped in fire order → results → "Split into ladder groups" → 3/charge, labels "41.4,41.6,41.8" → chart + window sentence → attach → save → `session_type='ladder'` in Supabase.
9. **F10:** that load's detail → Development Log shows the ladder, groups (best starred), and strings in order.

### Judgment calls (all also noted per-feature above)

Scope correction lives on the RIFLE (no scope entity yet) · scope-check measures via 4 manual taps on the photo (no pinch-zoom v1; aruco-warp integration deferred) · config shift speaks at ≥1 session per state · POI shift reported but never auto-dialed · DOPE format picker is text-described, not thumbnails · lot attaches at string-confirmation time · one brass firing per session · ladder groups assigned by TAP ORDER (shoot charge-by-charge; round-robin unsupported v1) · **velocity flat-spot overlay deferred** — auto-matching strings to charges is guesswork next to a load-development conclusion · Wave 2 shipped as one commit (three features, one interlocked file).

### Surprises

- `computeTrajectory()` was already a clean pure function — DOPE cards reuse it with zero solver refactoring. The foundation's seams (ToolActions `run:` handlers, custom wizard steps, card registry) absorbed all ten features without a single new nav element — the architecture docs' bet paid off.
- Quarter-MOA click snapping legitimately swallows small scope corrections at short range (caught by a test, kept as correct print behavior).
- The one process slip of the night: F3's first commit went out with a red test because a check chain used `;` instead of `&&` — caught immediately, fixed forward, and every later commit used an explicit green-gate.

### Still needs a live phone pass

Camera flows (scope-check taps, ladder in glare), chip tap-targets with gloves, DOPE PDF print scale (measure a printed strip with a ruler), sunlight-mode contrast on the new amber cards, and the `docs/` folder remains untracked in git — commit it if you want the specs versioned.
