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

## Step 3 — Rifle-first onboarding (§1.5)

`onboarding.js`: the feature checklist is gone. The first-run wizard (def
version 2 → 3; stale persisted state resets cleanly per WizardCore.hydrate) is
now: (1) **Add your rifle** — name + cartridge only, "add details later";
(2) **Your bullet & box velocity** — ammo name, bullet weight, BC + G1/G7,
box velocity, with ammo-box OCR as an inline capture method and a "Skip for
now" escape; (3) the unchanged suppressor question (add-a-can sheet on yes).
On complete: rifle + load created, all doors activated by default
(rangeSession/steelSession/ballistics; records/truing/scopeTracking are core),
`Recents.touchRifle` points the card at the new rifle, and the user LANDS ON
THE CARD — "Proven to 0 yards · Estimated", next-action lit. Certificate/
transfer deep links still override first-run entirely.

`FirstRifleFlow.start(db)` (global) runs the same wizard from the Home card's
empty state — not just first run. Headless proof: both custom steps render
(progress ticks, one question per screen).

### Judgment calls (step 3)
- Load step requires only the ammo NAME; weight/BC/velocity are validated
  when present but optional — the next-action ladder catches gaps honestly
  ("Add your load & box velocity" only fires when no load has a BC; rung 3
  covers missing MV). Skip-for-now submits a sentinel and creates no load.
- Drag model defaults to G7 (modern match bullets); OCR prefill can flip it.
- Rifle create failure (offline first-run, no cached write path for rifles)
  logs a console warning and still completes onboarding rather than stranding
  the wizard — the Home card's empty state offers the same flow again.

---

## Step 4 — Merges & retirements (§2.1–§2.8, §2.10)

- **2.1 Quick mode → Range Session.** The separate "Quick Mode" tool row is
  gone; the entry-screen escape is now labeled **"Just measure this group"**
  (same `_selectQuickMode` path: skips to capture, saves minimally). The v2.3
  suppressor/lot one-sheet with backdrop-accept was already in place —
  verified, unchanged. Quick sessions history stays readable ("Misc sessions"
  on the Rifles tab).
- **2.2 Report & Certificate.** One Data & Records entry; first choice
  "For your records" (performance report) | "Proof to share or transfer"
  (→ Certificate, or Transfer package — mechanics unchanged).
- **2.3 Quick hit tally retired.** Steel category row removed; the rifle-page
  effective-range card's empty-state button now launches the Steel session
  (casual tier is the one casual logger). `field.js` module + `field_shots`
  data untouched — effective range and history keep consuming them.
- **2.4 dope-log BC-sweep UI retired.** The beta rifle-page card registration
  removed (was already dark via the all-off beta gate); `dope-log.js` and its
  data stay on disk.
- **2.5 One History screen.** Data & Records → History with filter chips
  (Sessions · Steel · Truing · Maintenance). Sessions tap through to the
  existing session detail; steel strings keep their sheet (incl. chrono
  pairing); truing rows unchanged; Maintenance interleaves cleanings + scope
  adjustments by date with an inline "Log a scope adjustment". The five
  separate list rows are retired.
- **2.6 Barrel card.** Data & Records strip: monitors (incl. the lot-drift
  velocity note) speak above a titled Barrel card — total / since-cleaning /
  best MOA + inline **Log a cleaning** (round count prefilled, one tap) +
  Edit round count.
- **2.7 "Take it with you."** DOPE card + Device export grouped under their
  own section head inside Ballistics (renderScreen now supports per-tool
  `section`). Ballistics also gains the **"True this rifle"** entry (truing's
  §1.3 door), marked for step 5's utility restyle.
- **2.8 verified.** Ammo-box OCR appears exactly twice, both as capture
  methods inside Add Load surfaces (profiles load form, onboarding load step).
- **2.10 vocabulary.** Session verdict (ZERO CONFIRMED / ADJUST) ↔ card
  segments (confirmed/stale/thin/drifted · measured/estimated ·
  trued/untrued) already speak the same words; fixed the stray "Records &
  proof" back label and "Log field shots" strip copy.
- Headless proof: Data & Records (Barrel card + new rows), unified History
  (Maintenance chip interleaving), Ballistics ("Take it with you" group).
  All suites green (698).

### Judgment calls (step 4)
- Maintenance chip is read-only rows + "Log a scope adjustment" (the existing
  form); cleaning logging lives on the Barrel card per §2.6. Old per-list
  delete affordances remain in the rifle-page HistoryManager screens, which
  still exist for detail views — nothing lost.
- `showCertificate`/transfer kept as separate second-level choices under
  "Proof to share or transfer" rather than auto-picking — minting a transfer
  is consequential and deserves its own tap.

---

## Step 5 — Two-class visual grammar (§1.4)

New `.btn-utility` (gold outline, verb-first, no chevron, ≥52px) +
`.utility-row`; `UI.utilityBtn()` helper. Category tools marked
`utility: true` now render as gold buttons below the flow rows:
- Range Session → **Print target** (print/share sheet)
- Scope Tracking → **Print tall target**
- Ballistics → **True this rifle** (truing's §1.3 utility door)
- Data & Records → **Export data**
Also restyled: the session-entry Print/Share target buttons, and the DOPE
card's final action → **Print or share PDF**. Headless proof: Ballistics
shows rows-with-chevrons above a gold outlined utility — different species
at a glance.

### Judgment calls (step 5)
- **"Report & Certificate" stays a ROW, not a utility.** §1.4's example list
  includes "Generate report", but §2.2 explicitly makes it "one entry" with a
  first choice — a door that goes somewhere. The chooser-then-flow shape is a
  flow, not an instant action. Flagged for owner (easy to flip).
- Certificate/report screens' internal terminal buttons (Generate
  certificate, etc.) keep their primary styling — the grammar governs entry
  surfaces, not in-flow confirm controls (which carry the wrong-rifle
  protection wording).

---

## Step 6 — The branded target (Part 3) + verification gate

Built from the contract's written spec (`proven-target-concept.html` never
appeared in docs/mockups — see OWNER REVIEW QUEUE #1).

- **New `js/target-geometry.js`** — THE geometry law. `aruco-calibration.js`
  (homography) and `target-pdf.js` (artwork) both derive from this one object;
  they can never drift. New 35-test suite locks the constants, paper fit, and
  staple-tear safety on Letter + A4.
- **Marker relocation:** centers at (-0.5, 1.0) / (6.5, 1.0) / (-0.5, 5.0) /
  (6.5, 5.0) in aim-field coords → **7.00" × 4.00" spacing**, fully outside
  the field in the side margins, every marker ≥1" from the paper corners.
  Marker patterns + printed 0.6" size unchanged. `warpFlat` pad and the
  position-based corner assignment work unchanged with the rectangle.
- **The artwork (owner's v2 design):** all writing at the top (W-dial +
  "PROVEN. DATA TARGET", "Get all shooting to math · by Workhorse", two
  instruction lines, 1.00" tap-dot scale bar); 0.25"-minor/1.00"-major grid
  edge to edge; bold 6" aim-field outline; five ORANGE diamonds with orange
  center dots (center large, satellites at ±2"); markers on solid-white
  quiet-zone panels with thin gold machined-plate brackets + CAL·A–D labels
  outside the quiet zone; ONE small footer line; no bottom ruler.
- **Detector hardening (found by the gate):** at some rasterizations a
  marker's inner pattern decodes as a second, smaller offset quad, which the
  outermost-by-diagonal pick preferred — 4.7% scale error. `detect()` now
  merges near-duplicate quads (largest wins within 75% of its side length).
  This protects real range photos, not just the generated artwork.
- **VERIFICATION GATE — PASSED:** real js-aruco2 detector against the
  generated artwork at the new geometry: Letter 150ppi 0.067% · Letter 96ppi
  0.000% · A4 150ppi 0.033% · A4 200ppi 0.047% — 4/4 markers everywhere,
  all ≤0.1%.
- **§2.9 classic target retired** (gate passed): the print/share sheet and
  session-entry buttons now serve only the Proven Data Target; the classic
  canvas target remains on disk strictly as the no-jsPDF fallback.
- **Tall target:** same top-branding dress (W-dial, tagline, instructions up
  top); plumb-line geometry and the 6.00" A–B spacing untouched; one small
  footer line. `drawTallToCanvas` added for visual QA.
- CLAUDE.md's ArUco section updated to the new law.

### Judgment calls (step 6)
- **Marker-move interpretation:** "down/up 1.0, out 0.5" was measured from
  the aim-field CORNERS (giving x ±0.5" outside the field). Reading it from
  the old marker centers instead would put plates off the paper edge on
  Letter/A4 — physically impossible, so corners must be the datum.
  → OWNER REVIEW QUEUE.
- Orange = RGB(232, 90, 26) — prints as honest mid-gray (~50%) in grayscale.
- Bracket arms are thin (0.014") and pushed 0.1" beyond the quiet zone so any
  quad they suggest is concentric with the marker (an offset quad is what
  fools the detector; a concentric one merges harmlessly).

---

## Step 7 — Fixes (§4.1–§4.3)

- **4.1 iOS safe area.** `viewport-fit=cover` was already in the meta tag;
  the missing half was the header: `.shell-header` now pads by
  `env(safe-area-inset-top/left/right)` (falls back to 0 in browsers), so the
  theme toggle and controls sit below the iOS status bar in standalone mode.
  The bottom nav already had `env(safe-area-inset-bottom)`. → Owner device
  check queued.
- **4.2 Export everything (.xlsx).** SheetJS was ALREADY pinned in
  index.html for chrono import — zero added bundle cost, no new dependency.
  "Export my data" gains a gold utility button that builds one workbook with
  one worksheet per data type (same 14 types, same columns as the CSVs;
  object cells JSON-stringified to match `csvEncode`), delivered via the
  share sheet / download like the CSVs. Hidden if SheetJS failed to load —
  per-type CSVs remain.
- **4.3 dope_entries reality alignment.** The live DB has no such table.
  Found and fixed:
  - `db.js deleteRifle` cascaded into `dope_entries` and THREW on its 42P01
    error — **every rifle deletion in the live app was failing**. Line
    removed (explicitly authorized by §4.3; db.js otherwise untouched).
  - `sync-queue.js` whitelists: `addDopeEntry` / `getDopeEntries` removed — a
    queued write to a missing table would jam the FIFO flush forever.
  - `db.js` addDopeEntry/getDopeEntries/deleteDopeEntry methods remain (only
    the retired dope-log UI ever called them; module stays on disk per §2.4).
  - **Live SQL is also broken:** `delete_my_account` (MORNING/FOUNDATION era)
    deletes from `dope_entries` → account deletion currently throws.
    `SIMPLIFY-migrations.sql` (owner-run, additive, re-runnable) replaces the
    function without that line; an optional commented block fixes
    `admin_export_all` the same way for those who ran CROWD step 5.
    DOPE persistence lives where it actually lives today: solver settings +
    trued values on loads; nothing writes dope_entries.

---

## Step 8 — Polish

- Fixed a stray call to the retired `showSteelHistory` in the steel-string
  sheet's chrono-pairing callback (now returns to unified History, Steel chip).
- Hex gate: zero hardcoded colors in ui.css outside `var()` (the one new
  color this build, `--gold-on-brand`, lives in tokens.css).
- Emoji gate: clean — the ★ "Match" chip glyph is the established v2.3
  dingbat convention, not an emoji.
- Dark theme verified on the reworked screens (Home card, Data & Records,
  onboarding); light verified throughout the build.
- Confirmed non-goals intact: nav tabs unchanged, no Ask yorT/crowd/Tier-3
  changes, nothing deleted from disk or DB, dope-log module + field_shots
  data readable.

---

## Step 9 — QA gates

- **Suites: 733 tests green** (652 baseline + 46 next-action + 35
  target-geometry; one foundation expectation updated to the v2.4 truing-core
  doctrine, count unchanged).
- **Headless screenshots** (390×844, dpr 2): card Home light (mid state,
  payoff "~1,075 yd" from the real solver) + dark (all green, "You're proven
  to 700 — go shoot") + fresh + no-rifle invite; onboarding steps 1–2 both
  themes; Data & Records light+dark; unified History (Maintenance chip);
  Ballistics with "Take it with you" + gold utility; new Data Target
  (Letter + A4) and dressed tall target.
- **Detector gate:** 4/4 markers, ≤0.1% scale error at Letter 96/150ppi and
  A4 150/200ppi (worst 0.067%).
- **Tap-target audit:** every new interactive element ≥52px (`.rc-arrow`,
  `.rc-strip button`, `.rc-action` 58px, `.rc-notnow`, `.door`,
  `.btn-utility`, history `.segment button`).
- **Airplane-mode smoke:** with every event/read query failing, the card
  renders honestly from what it has (meter from cached verdict/zero range,
  next-action falls to the correct rung, doors render, zero console
  crashes).
- **iOS safe-area:** CSS verified with env() fallback (no layout change in
  normal browsers); real-device confirmation queued for owner.

### Feature walk — old door → new home
| Was (v2.3) | Is (v2.4) |
|---|---|
| Seven job rows on Home | THE RIFLE CARD + four compact doors (Range · Steel/Field · Ballistics · Data & Records) + More tools |
| Quick Mode row (Range Session) | "Just measure this group" at session entry (same skip-to-capture path) |
| Quick hit tally (Steel) | Retired — Steel casual is the one casual logger; effective-range card's button launches it |
| Truing door | Next-action button · card's Trued segment sheet · steel-session save "Send to Truing" · gold "True this rifle" on Ballistics · rifle-page shortcut |
| Scope Tracking door | Card's Tracking segment sheet · truing prerequisites · rifle-page shortcut (tall target = gold utility there) |
| Session/Steel/Truing history + Cleaning log + Scope adjustment log (5 rows) | ONE History screen with chips (Sessions · Steel · Truing · Maintenance) in Data & Records |
| Cleaning logging (own list screen) | Barrel card → "Log a cleaning" (inline, prefilled) |
| Scope-adjustment logging | History → Maintenance → "Log a scope adjustment" |
| Performance report · Certificate · Transfer package (3 rows) | "Report & Certificate" → For your records \| Proof to share or transfer |
| Print/share classic blank target | "Print target" gold utility → Proven Data Target PDF (classic code = no-jsPDF fallback only) |
| Export my data (CSV rows) | "Export data" utility + "Export everything (.xlsx)" workbook |
| First-run feature checklist | Rifle-first wizard: rifle → bullet & box velocity → suppressor → LAND ON THE CARD |
| dope-log BC-sweep card (beta, dark) | Retired — one way to true (v2.3 engine) |

---

## OWNER REVIEW QUEUE

1. **Missing mockup** — `proven-target-concept.html` was not in `docs/mockups/`
   when the build started (re-checked at step 6). The branded target was built
   from the contract's Part 3 text. If the mockup differs, drop it in and say
   the word; artwork is isolated in `target-pdf.js` and cheap to revise.
2. **Marker-move datum** — the relocation was interpreted from the aim-field
   corners (centers 7.00" × 4.00" apart; see step 6 judgment call). The
   alternative reading physically doesn't fit the paper. Confirm the printed
   sheet looks like what you sketched.
3. **RUN `SIMPLIFY-migrations.sql`** in the Supabase SQL Editor — it only
   replaces `delete_my_account` so account deletion stops referencing the
   nonexistent `dope_entries` table (statement 2 is optional/commented; read
   its note). Without this, account deletion throws in the live app.
4. **iOS safe-area device check** — install/update the PWA on your iPhone and
   confirm the header (theme toggle) now clears the status bar in standalone
   mode. The fix is CSS `env(safe-area-inset-*)`; only a real device proves it.
5. **REAL-PRINT PHOTO TEST (required before trusting field calibration):**
   print the new target at 100% on Letter, photograph it with your phone from
   a realistic range-bench angle, and run a session through calibration. The
   headless gate proves the artwork/detector agree; only a real print + phone
   photo proves the whole chain (printer scaling, paper white, camera).
   Verify the reported scale by measuring one grid square = 1.00".
6. **Walk the feature-walk table** (step 9) on your phone — every moved or
   merged item, old muscle memory → new home.
7. **"Report & Certificate" stays a row** (step 5 judgment call) — say the
   word if you want it as a gold "Generate report" utility instead.
8. **Old printed targets are obsolete** — the marker geometry moved, so
   photos of v2.3 sheets will fail auto-calibration (manual 2-tap still
   works). Recycle old printouts and hand out the new PDF.
