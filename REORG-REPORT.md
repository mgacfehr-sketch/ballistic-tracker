# REORG-REPORT.md — Range-Day Reorganization (Contract v2.3)

Running build report for the v2.3 Range-Day Reorganization on branch `redesign`.
Per-step notes, judgment calls, and deviations land here as each step commits.
Everything requiring the owner is batched in the **OWNER REVIEW QUEUE** at the bottom
(nothing blocks the build on it; nothing touches Supabase until the owner runs the
migration).

Test baseline at contract start: **385 tests green** (6 suites:
calculations 71, crowd-data 37, foundation 103, garmin-import 49, onboarding 8,
velocity-stats 117). Service worker at CACHE_VERSION 97.

---

## Step 0 — STANDARDS.md

- Generated `STANDARDS.md` at repo root: stack ground rules, file organization,
  pure-engine vs UI module boundaries (CommonJS-guard pattern), the feature
  registration seam (TOOLS → Categories.DEFS → ToolActions; never a nav tab),
  data-access rules (db.js only, client UUIDs, snapshots), the Part 0.6 data laws
  condensed (offline-first, append-only events, provenance, units-per-rifle),
  security patterns (RLS four-policy idempotent template, SECURITY DEFINER gating,
  never-trust-the-client), naming, the Node test harness pattern, UI standards
  (tokens, tap targets, verdict-first, coach voice, outdoor budgets), and the
  per-step deploy checklist.
- All standards were derived from the codebase's existing best patterns (WAVES
  migration policy style, garmin-import parser discipline, wizard-core purity,
  tokens.css contract) — no invented conventions.
- **Judgment call (standing):** the contract's "ENGINE FILES UNTOUCHED: js/db.js"
  is interpreted as *additive-only*: new CRUD methods for new tables are required
  by the all-Supabase-through-db.js architecture rule, plus one generic
  `flushQueuedRow(table, record)` for the offline sync queue. Zero changes to any
  existing method's behavior. → Owner review queue item 1.

---

## Step 1 — Mockups committed + docs read

- Committed the three v2.3 mockups the owner placed: `docs/mockups/proven-rangeday-reorg.html`,
  `proven-steel-session.html`, `proven-truing.html` — plus the supporting docs
  (`docs/yorT-Interaction-Master-Plan.md`, `docs/yorT-44-Features-How-They-Are-Used.md`,
  `docs/yorT-UX-Architecture.md`) and `sample-data/TEST SHOTVIEW SHEET.xlsx`
  (useful as a chrono-reconciliation test source later).
- Read all mockups + the Interaction Master Plan. Composition notes:
  - **Governing Home frame = "Home — 7 jobs, no alerts"** in `proven-steel-session.html`.
    The `proven-rangeday-reorg.html` Home frame still shows an Alerts section and a
    "steel as a mode" Option A — both superseded by the v2.3 contract text (no Home
    alerts; Steel/Field is its own job, i.e. that file's own Option B). Visual
    language (job rows, icon boxes, chevrons) applies as drawn.
  - Steel Session mockup fixes: wind clock dial (~150px, gold arrow with marker head,
    "8 mph / from 2 o'clock" text readout beside it), unit seg control
    (Inches/MOA/MIL), steppers with direction words (HIGH/RIGHT), mono string list
    with green center hits, "Send string to Truing ›" ghost button, photo-mode
    escape with the no-auto-scale note.
  - Truing mockup fixes: mode picker cards (Quick pre-picked visual, Full),
    "Your data" checklist rows, coach-warn block (caution bg, triangle icon),
    MV↔BC fork radios with doctrine note, result card (gold border, big mono value),
    5-segment confidence meter tinted by level word, "▾ Why 0.319?" ledger rows
    (raw miss − velocity effect − wind effect = real ballistic error),
    "True anyway (rough)" escape button.
- Mockup dial/stepper values are illustrative; the contract's locked increments
  (MOA 0.25 / in 0.5 / MIL 0.1) govern.

---

## Step 2 — REORG-migrations.sql

One additive, fully re-runnable migrations file at repo root, in the WAVES style
(guarded policies, `IF NOT EXISTS` everywhere, per-user RLS + `(user_id, rifle_id)`
indexes). Owner reviews externally and runs it once; everything after this step is
built assuming it ran. Blocks:

- **R0** — `updated_at` columns + a shared `set_updated_at()` trigger on every
  table the offline queue can write (sessions, velocity_strings, field_shots,
  dope_entries, cold_bore_shots, zero_records, scope_adjustments, cleaning_logs,
  loads, barrels). Server-side stamp; sync conflict rule does NOT compare it
  (client wins unconditionally) — it's audit/analytics plumbing.
- **R1** — `suppressors` library table + nullable `suppressor_id` FK on sessions,
  velocity_strings, zero_records, cold_bore_shots, field_shots
  (`ON DELETE SET NULL` — deleting a can never deletes shooting records). Legacy
  two-state config columns remain for back-compat, superseded in UI.
- **R2** — `sessions.lot_number`. Environment provenance rides inside the existing
  `sessions.weather` jsonb as a `source` field — documented, no new column.
- **R3** — `steel_strings` + `steel_shots` (per-shot rows: impact offsets, sticky
  holds, optional MV + source, gust override; string-level wind jsonb,
  direction-of-fire + source, environment jsonb, tier, lot, suppressor).
  **Judgment call:** new tables rather than extending `field_shots` — field_shots
  stays as the legacy string-level hit/miss aggregate so casual logging and
  effective-range math keep working unchanged.
- **R4** — append-only calibration events: `zero_events`, `mv_measurements`,
  `tracking_verifications`. Rifle/load columns become cached "current" values;
  the status card derives from events.
- **R5** — append-only `truing_events` (mode, stage, close/far jsonb, inputs,
  normalization `ledger` jsonb, supersonic_pct, correction old→new, confidence).
  **Judgment call:** derived current trued values live on **loads**
  (`trued_bc`, `trued_mv`, `trued_event_id`, `trued_at`) because bc/mv already
  live there and a load row IS the rifle+load pair.
- **R6** — `certificate_transfers` (single-use token, rifle_snapshot jsonb,
  minted/redeemed). **Clients have SELECT-only visibility of their own transfers;
  no INSERT/UPDATE policies exist** — mint/redeem happens exclusively through the
  server endpoint using the service role (never-trust-the-client rule). Rifles
  gain provenance columns (`origin`, `certified_by`, `certified_at`, `transfer_id`).
- **R7** — `ai_conversations` + `ai_usage_logs` brought into schema-as-code
  (no-op CREATE IF NOT EXISTS on the live DB) with RLS + a `(user_id, created_at)`
  index ready for the deferred daily-cap check. The known `estimated_cost` vs
  `cost` column mismatch is neutralized by guarded ADD COLUMNs for both.
- **Documented no-schema decisions:** per-rifle units reuses `rifles.angle_unit`
  with new permitted value `'IN'`; recipe jsonb shape extended in-place with
  CBTO/neck/trim/crimp (Tier-3 seam); new user_settings keys; crowd-capture
  compatibility of all new tables; steel photo Storage path.

---

## Step 3 — Registry rewire + checklist onboarding

- **js/tools.js rewritten around JOBS** (rangeSession, steelSession, loadDev,
  ballistics, truing, scopeTracking, records). Data & Records is core (always on);
  Load Development is tier-hidden in v1 (`feature: 'loadDevelopment'`, not in
  STAGE_A_FEATURES — flipping that single entry ships it later, the Part 0.5 seam).
  Activation persists as `tool_activations {v:2, tools}` in user_settings.
- **LEGACY_ALIASES** keeps every pre-v2.3 call site working unchanged
  (`isVisible('bench')` → loadDev, `'checkTarget'` → rangeSession, etc.), so
  profiles.js/session-flow.js/categories.js needed no edits this step. Note:
  `bench`-gated recipe/ladder UI now correctly hides in v1 (Tier-3 deferral) via
  the loadDev tier gate.
- **v1→v2 activation migration** in `ToolsCore.hydrate`: active legacy tools wake
  their job; rangeSession + ballistics always wake (their v1 equivalents were
  core). Migration persists once on init. Original activation timestamps kept.
- `ToolPresets` (hunt/compete/handload/all) **retired** — the three-tier/preset
  onboarding is dead per contract. `applyPreset(keys)` remains as the generic
  checklist-activation primitive.
- **Checklist onboarding (js/onboarding.js), wizard v2:** Screen 1 = "Which of
  these will you use?" multi-select of the five v1 jobs (Range Session
  pre-checked), with the "Data & Records is always on / hiding keeps data" note.
  Screen 2 = "Do you ever shoot suppressed?" Yes/No. Yes → suppressor-add sheet
  (skippable); `suppressor_enabled` stored in user_settings. Deep links still
  override onboarding. Wizard version bump auto-resets any half-finished v1 state.
- **New js/suppressors.js**: the §1.3b library — add-a-can overlay (name required,
  brand/model optional), `suppressor_enabled` setting, last-used-per-rifle memory
  (`last_suppressor_<rifleId>` user_settings keys). Session flows will call this
  in Steps 5/6 so range and steel phrase the question identically.
- **js/db.js additive section** (bottom of file, nothing above changed):
  suppressor CRUD (`addSuppressor/getSuppressors/updateSuppressor/deleteSuppressor`).
- index.html + sw.js APP_SHELL gained suppressors.js; **CACHE_VERSION 97 → 98**.
- Tests: ToolsCore suite rewritten for the job registry + migration
  (**385 → 397 total, all green**).
- Deferred within this step (lands with Step 4's Home rebuild, same seam): the
  visible "+ More tools" row UI. The registry API for it (`getChecklist`,
  `getDormant`, `deactivate`) is done.

---

## Step 4 — Home job list, Categories re-slice, Calibration Status card

- **categories.js re-sliced** from five categories to the seven v2.3 jobs:
  `range, steel, loaddev, ballistics, truing, scopetrack, records` (contract §1.2
  order). Rifle chip, switcher, wrong-rifle protection unchanged. Tool rows
  re-homed: chrono import → Range Session (also stays neutrally launchable);
  quick hit tally (legacy field logger) lives inside Steel/Field until the full
  logger lands in Step 6; the full Steel logger, Truing, tall-target PDF and
  Device Export rows gate on their modules existing (`typeof SteelSession`…), so
  those jobs appear on Home automatically as Steps 6–9 land. Load Development is
  fully tier-hidden in v1. The old Bare/Suppressed config toggle was REMOVED from
  category screens (superseded by the per-session suppressor question, Step 5);
  legacy `rifle.activeConfig` data untouched.
- **home.js rebuilt:** NO alerts section (removed per owner — the built-in
  lot-drift Home alert provider was deleted; lot drift speaks inline at the lot
  question and in Data & Records). Brand bar → "What are you doing?" → job rows →
  quiet "+ More tools" row (the §1.3 toggle surface: checked jobs show on Home;
  turning one off hides it, all data stays) → Recent strip.
- **New pure js/calibration-status.js + tests/test-calibration-status.js (60
  checks):** derives Scope tracking / Zero / MV / Trued + one-word rollup +
  "Calibrated to X yards" from the append-only event tables. **Aging defaults
  (constants in CALIBRATION_AGING):** zero stale 90 days or immediately on a
  logged scope adjustment; zero thin < 5 shots; zero drifted when the centroid
  moved > 0.5 MOA between confirmed zeros; MV stale 180 days or on lot change;
  tracking stale 365 days; truing flagged when MV re-measured > 15 fps from the
  trued value or zero shifted. Calibrated-to = truing far distance when trued,
  else zero distance — and honestly null when zero was never confirmed, even if
  a truing event exists.
- Same file carries the browser-only `CalibrationStatusCard` renderer (solver-
  style pure/DOM split): rollup header, four tappable rows (what/why sheet with
  the one-line unlock, coach voice), one hint line max. Pre-migration databases
  degrade to empty states, never errors (every event fetch catches to []).
- **Slim rifle page (profiles.js):** the Calibration Status card replaces the
  one-word verdict banner as the status centerpiece (Confirm zero button kept);
  a **Loads section** (rows + "＋ Add load") now lives on the rifle page per
  §1.5. **readiness.js** softens a confirmed-but-old zero to STALE (caution chip)
  using the shared aging constant — fleet chips and rifle chips age with the card.
- db.js additive CRUD for zero_events, mv_measurements, tracking_verifications,
  truing_events. icons.js gained the seven job icons traced from the mockups.
- CACHE_VERSION 98 → 99. Tests: **457 total, all green** (+60 calibration-status).
- Headless Playwright verification (scratchpad harness): Home light/dark + the
  status card render to the mockup composition.

---

## Step 5 — Range Session job: offline queue, session questions, compression, target PDF

- **New js/sync-queue.js — the offline write queue (Part 0.6 #1)** + 32-check
  pure-core test suite. Write-through with fallback: `SyncQueue.write(fn, data)`
  calls db.js unchanged when online; when offline (or on a NETWORK failure —
  never a server rejection) the row queues in IndexedDB `yort_sync` with its
  client UUID and returns `{_pending: true}`. Flush is FIFO/sequential on
  online / visibility / app start / after any online write; landed sessions then
  upload their queued photo. Upsert-by-client-UUID = the device is the source of
  truth; server data never overwrites unsynced local work. Server-rejected rows
  retry 5× then park as status 'error' — surfaced, never dropped. Read methods
  are decorated on the db INSTANCE (db.js file untouched beyond one additive
  `flushQueuedRow`) so queued rows appear in history immediately. Out of scope
  by design: offline deletes, multi-device merge, Background Sync API, offline
  rifle/load creation. **The old "session saving requires internet" block in
  session-flow.js is gone.**
- **§2.1 session questions:** after picking rifle+load, one sheet asks
  Suppressor (suppressor-enabled users only: Bare | can list, last-used
  preselected, "＋ Add a can" inline) and "Which lot?" (last lot preselected
  with "same as last time", prior lots from session tags, "New lot…" entry —
  new lots join the list forever via the session tags; no lot-manager feature).
  Backdrop tap accepts defaults — never a gate. Sticky: last can per rifle
  (user_settings), latest lot written back to the load. The lot sheet shows the
  inline lot-drift note when true ("Lot X ran 45 fps faster — worth a zero
  check") — monitors speak in context, not on Home.
- Sessions now store `suppressorId` + `lotNumber` (legacy `config` tag kept in
  sync for old analytics). **A confirmed zero writes an append-only
  `zero_events` row** (shot count, distance, group snapshot, can, lot) feeding
  the Calibration Status card; Readiness invalidates so chips update.
- **§2.9b image compression (documented settings):** stored session images are
  capped to a **2048 px longest edge at JPEG q0.80** (thumbnail 400 px q0.75)
  via a new `capCanvasSize` in export.js — shot marking still happens on the
  full-res in-memory photo, so detection accuracy is unaffected (compression
  applies only to the stored copy; originals are not retained — no feature
  needs them). Typical raw 12 MP phone photo ≈ 3–6 MB → stored ≈ 400–800 KB.
- **§2.1 paper target PDF (js/target-pdf.js):** vector jsPDF generator, Letter
  + A4. Geometry is IDENTICAL to js/aruco-calibration.js law (6.0" grid, 0.6"
  markers, centers 7.00" apart) — markers sit ~1.3–1.7" inside the paper
  corners (staple-tear zone clear) and ~3" off center (shot zone clear), with a
  printed staple hint. Adds a **1.00" scale bar with tap dots** (exactly the
  manual 2-tap calibration distance) + human-readable reference text. Markers
  drawn from the live js-aruco2 dictionary bit-for-bit.
  **Verified:** headless Playwright ran the REAL detector against the generated
  artwork — 4/4 markers found (ids 0–3) and detected marker spacing matched the
  printed geometry with **0.00% error**. Classic target remains reachable
  (print/share) beside the new PDFs.
- app.js: `SyncQueue.init(db)` after OfflineCache. index.html/sw.js gained
  target-pdf.js + sync-queue.js; **CACHE_VERSION 99 → 100**.
- Tests: **489 total, all green** (+32 sync-queue; ledger: 71 calculations +
  60 calibration-status + 37 crowd-data + 115 foundation + 49 garmin-import +
  8 onboarding + 32 sync-queue + 117 velocity-stats).

---

## Step 6 — Steel/Field Session

- **New js/steel-core.js (pure, 55 checks):** the locked stepper increments
  (MOA 0.25 · Inches 0.5 · MIL 0.1 per tap), center-hit detection (within half
  an increment of 0/0), shot descriptions ("0.5 high · 0.25 R"), wind text
  ("8 mph from 2 o'clock"), direction-of-fire chips ↔ compass headings, string
  summaries (mean-of-group-centers — what truing consumes), and **chrono
  reconciliation**: shot-1↔shot-1 in-order pairing that fills skipped MVs,
  standardizes matches on the instrument, flags conflicts and count mismatches
  — never applied without the confirm screen.
- **New js/labradar-import.js (pure, 31 checks + 2 fixtures):** LabRadar series
  report parser in the garmin-import discipline — structure found by content
  ("Shot ID" + "V0" header), semicolon/comma + decimal-comma tolerant, m/s
  converted to fps WITH a warning, LabRadar's own stats captured for the
  reported-vs-recomputed cross-check, loud rejection of anything else. Emits the
  exact ShotView session shape, so velocity-stats/clustering/dedup work unchanged.
- **New js/steel-session.js — the two-tier job (§2.2):** setup (distance chips
  500–1000 + custom, dialed steppers, **tap-first wind clock dial** with 12
  generous tap zones + thick gold arrow + direction always in text + 1-mph
  stepper + tap-to-type + Gusty/unstable flag, direction-of-fire chips at ≥800
  with device-compass option and a "＋ more" fold below 800, suppressor chips
  for enabled users, sticky lot) → **per-shot logger** (Inches/MOA/MIL seg
  persisted to the rifle, glove-friendly ± steppers with tap-to-type, sticky
  holds line defaulting 0/0 and applying forward, optional per-shot MV on a
  digits-only pad, per-shot gust override, running mono string list with green
  center hits, wrong-rifle-protected "Save to <rifle>"). Every shot stores
  dial + hold + impact + wind + optional MV — the complete truing equation.
  **Casual tier** = photo (compressed to the §2.9b settings) + note, with the
  "no auto-scale on steel" honesty line. Two taps from setup to logging.
  **Judgment call:** the wind dial is tap-only (no drag fine-tune) because wind
  direction is STORED as a 1–12 clock integer — drag would imply precision the
  data model doesn't keep. Contract's usability intent (big targets, obvious
  arrow, text direction) fully honored.
- Environment auto-attaches via weather lookup when online (source-stamped
  'lookup'), null offline — truing's manual entry covers the gap (§2.5a).
- Fully offline: string id is client-generated up front; string + shots write
  FIFO through SyncQueue (string row lands before its shots — FK-safe);
  casual photos queue with a new 'steel' image kind and upload after their
  string lands.
- **chrono.js integration:** CSV picker now tries ShotView then LabRadar
  (error message matches what the file looks like); import copy updated;
  **every string confirmed to a load writes an append-only mv_measurements
  event** (§2.8) feeding the Calibration Status card. Steel↔chrono pairing
  lives on `SteelSession.pairChrono` (confirm screen), surfaced from steel
  history in Step 10; pairing is online-by-nature (you just imported a file).
- db.js additive: steel_strings/steel_shots CRUD + `saveSteelPhoto`
  (session-images bucket, `steel_` prefix).
- CACHE_VERSION 100 → 101. Tests: **575 total, all green** (+55 steel-core,
  +31 labradar). Headless screenshots: setup + logger match the
  proven-steel-session mockup composition.

---

## Step 7 — Truing: the two-stage transonic-aware engine + UI

- **New pure js/truing-core.js (59 checks)** — the §2.5c doctrine core:
  - `machDistances`: where THIS rifle/load crosses Mach 1.2 / 1.0 / 0.9 in
    today's air, by interpolating the solver's own machNumber column. Verified
    against known cartridges: 6.5 PRC class supersonic to ~1,580 yd; .308 175
    to ~1,000 yd; hotter MV pushes every crossing farther; cold dense air
    shortens reach (1,510 vs 1,579 vs 1,624 yd at 0/59/100 °F).
  - `prescribeTruingDistances`: MV trues at ~85% of the Mach-1.2 distance
    (≥300 yd / 3× zero floor); drag brackets Mach 1.2→0.9.
  - `classifyDistance`: zero / mv / drag / beyond routing + supersonicPct.
  - `normalizeGroups`: per-shot MV deviation removed via central-difference
    come-up sensitivity; vertical Coriolis (Eötvös) removed at ≥800 yd with
    latitude + direction of fire (sign flips east↔west, magnitude ~0.1–0.3 MOA
    at 900 — verified); wind-flagged strings down-weighted ×0.3; aerodynamic
    jump explicitly "not modeled" in the ledger (honest gap); truing operates
    on GROUP-CENTER means only, never single shots.
  - `solveMvCorrection` / `solveBcCorrection`: secant root-finds with bisection
    fallback inside brackets (MV ±15%, BC ±30%), tolerance 0.02 MOA, ~6
    trajectory evals. **Round-trip proven:** MV ±40 fps recovered within 6 fps
    from 300/450/600 observations; BC −0.020 recovered within 0.004 in the
    transonic bracket — beats the legacy dope-log 0.005 grid.
  - `solveTruing`: computes BOTH corrections (the §2.5 fork — user picks),
    routes the recommendation by doctrine: transonic data → BC; measured-MV
    rifles → "the honest fix is BC" with the distance-honesty label
    ("your 900-yd data is at 62% of supersonic — that's MV/zero territory");
    unmeasured MV in the supersonic band → "MV is the likely culprit — or
    better, chronograph it."
  - `truingConfidence`: 5 segments + word, capped by quick-mode (≤3), drag
    corrections short of transonic (≤3), assumed environment (≤3), lookup
    environment (≤4), group disagreement, unconfirmed zero (≤2), unverified
    tracking (≤3), MV-from-drop-alone (≤3). Every cap emits its plain-English
    note.
  - `deviceCompensation` (§2.12 math): golden-section on BC over a secant MV
    fit against comeUp/scopeFactor. Factor-1.0 identity proven; dialing the
    compensated numbers through a 4%-small scope lands within **0.024 MOA**
    across 300–900 in test.
- **New js/truing.js — the job UI** per the proven-truing mockup: bands
  summary ("supersonic to ~1,579 yd; MV trues near 1,125; drag 1,325–1,850"),
  prerequisites status lines (never a gate, §2.5b), environment capture
  (manual always/offline + one-tap lookup, source-stamped; latitude grabbed
  for Coriolis), Quick flow (assumptions stated verbatim), Full flow (string
  tie-in with the "Your data" checklist, coach-voice thin-data/no-MV/no-wind
  interventions with the "true anyway" escape), MV↔BC fork radios with both
  values auto-calculated, gold result card, 5-segment meter tinted by level,
  "▾ Why?" ledger (raw − velocity − earth = trued-on, per shot), Apply →
  **append-only truing_event** (full inputs + ledger + confidence persisted)
  + derived `trued_bc`/`trued_mv`/`trued_event_id` cached on the load.
  "Send string to Truing ›" handoff from Steel Session works via the
  session-stash + preselect.
- **Solver quirk found & flagged (owner queue):** `computeTrajectory` defaults
  falsy inputs (`params.tempF || 59`), so an honest 0 °F silently becomes
  standard air. ballistic-solver.js is contract-protected, so truing-core
  works around it (0 °F → 0.001 °F); the one-line solver fix
  (`typeof params.tempF === 'number' ? params.tempF : STD_TEMP_F`) is
  recommended post-contract.
- CACHE_VERSION 101 → 102. Tests: **634 total, all green** (+59 truing-core).
  Headless screenshots: mode picker + fork/result/meter/ledger match the
  proven-truing mockup.

---

## Step 8 — Scope Tracking job

- The tall-target wizard (scope-check.js) was already re-homed as its own job in
  Step 4's re-slice; this step completes it: **every completed test now writes an
  append-only `tracking_verifications` event** (factor, click value, cant flag,
  method) through the sync queue, with the rifle columns kept as the cached
  "current" — feeding the Calibration Status card and Device Export. Readiness
  invalidates on completion so chips refresh.
- **Tall-target PDF** added to js/target-pdf.js (`TargetPDF.tallTarget`, Letter +
  A4 chooser on the job screen): plumb line with 1.00" ruler ticks, bottom aim
  dot, and two bold SCALE marks **exactly 6.00" apart** — matching the wizard's
  two photo-tap scale points verbatim (`dist(tapA, tapB) / 6.0` in
  scope-check.js). Printed instructions: hang plumb at exactly 100, shoot the
  dot, dial UP 20–30 clicks, shoot again, photograph.
- (Cache bump for steps 8+9 lands together as v103 in the next commit.)

---

## OWNER REVIEW QUEUE

Everything that needs Mitch, batched. Nothing in the build proceeds in Supabase
until item 2 is done; the app is built assuming the migration ran.

### 1. Review STANDARDS.md
Read `STANDARDS.md` (repo root). It governs all v2.3 work and future contracts.
Flag anything you disagree with — the standing judgment call to note: db.js gets
additive-only new methods (new tables' CRUD + `flushQueuedRow`), existing methods
untouched.

### 2. Review + run REORG-migrations.sql  *(READY — written at Step 2)*
Review `REORG-migrations.sql` externally first; nothing proceeds in Supabase
without that. Then run it once in the Supabase SQL Editor (Dashboard → SQL
Editor → New query → paste the whole file → Run). It is additive-only and safely
re-runnable — running it twice is harmless. The app is built assuming it ran;
new features will show empty states (not errors) until it has.

### 3. Truing-engine review notes  *(READY — Step 7)*
Read the **Step 7 section above** for the full function-by-function summary.
The short version for review:
- The engine recovers known perturbations by round-trip test (MV ±40 fps
  within 6 fps; BC −0.020 within 0.004) and computes your rifle's Mach
  1.2/1.0/0.9 distances from the real solver — 59 Node checks green
  (`node tests/test-truing-core.js`).
- Judgment calls: wind deflection is removed from the HORIZONTAL only (we
  true vertical; a note in the ledger says so); aerodynamic jump is NOT
  modeled and the ledger admits it; wind-flagged (gusty) strings are
  down-weighted ×0.3 rather than excluded; both fork values always compute,
  doctrine only picks the RECOMMENDED radio.
- **Flagged decision:** js/ballistic-solver.js has a falsy-input quirk
  (`params.tempF || 59` — an entered 0 °F becomes 59 °F). The solver is
  contract-protected so I worked around it in truing-core; recommend the
  one-line fix after this contract ships.

### 4. Final QA browser checklist  *(pending — written at Step 12)*
Ordered post-migration checklist: browser walks per job, airplane-mode offline
walk, certificate transfer test, Supabase Point-in-Time-Recovery/backup
click-path, and anything else requiring the live database.

### Flagged decisions (running list)
- *(none yet)*
