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

## OWNER REVIEW QUEUE

1. **Missing mockup** — `proven-target-concept.html` was not in `docs/mockups/`
   when the build started (re-checked at step 6). The branded target was built
   from the contract's Part 3 text. If the mockup differs, drop it in and say
   the word; artwork is isolated in `target-pdf.js` and cheap to revise.
2. **Marker-move datum** — the relocation was interpreted from the aim-field
   corners (centers 7.00" × 4.00" apart; see step 6 judgment call). The
   alternative reading physically doesn't fit the paper. Confirm the printed
   sheet looks like what you sketched.
3. **REAL-PRINT PHOTO TEST (required before trusting field calibration):**
   print the new target at 100% on Letter, photograph it with your phone from
   a realistic range-bench angle, and run a session through calibration. The
   headless gate proves the artwork/detector agree; only a real print + phone
   photo proves the whole chain (printer scaling, paper white, camera).
   Verify the reported scale by measuring one grid square = 1.00".
