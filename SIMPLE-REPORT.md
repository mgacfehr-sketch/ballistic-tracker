# SIMPLE-REPORT.md — Build Contract v2.5 ("The Simple Lane")

Branch `redesign` · started 2026-07-25 · baseline 733 tests green · SW v114 at start.

The thesis: design for Roy — 60, deadly with a rifle, one-finger typist. Capture
the few inputs that carry most of the value, at the natural moment, in Roy's
words, with one obvious thing to do. Everything already built stays as the
Detailed lane; the Simple lane becomes the front door.

---

## Step 0 — Survey (this commit)

Flows read end-to-end: truing.js, steel-session.js, sync-queue.js, session-flow
save path, db.js write mappings. Two owner bugs diagnosed before building:

**3.1 truing dead-end — diagnosis.** The result/Apply machinery EXISTS and is
complete (compute → fork → confidence meter → ledger → Apply → event + trued
values). The dead-end is the FRONT of the flow: "Send to Truing" lands on the
mode-picker (bands + prerequisites + two mode cards). Two failure modes:
(a) the "Full true" card is a silent no-op when the strings list is empty
(`if (S.steelStrings.length) renderFull()` — no else, nothing happens);
(b) nothing on the screen is a clear primary — two look-alike cards, no
"Continue". Fix in step 2: handoff from steel lands DIRECTLY on Full true with
the string preselected; the mode picker becomes one status block + one primary.

**3.2 offline sync visibility — diagnosis.** Multiple compounding holes:
- `db.getSession(id)` is NOT decorated by the sync queue — the Home "Recent"
  strip and any single-session read show NOTHING while the row is pending.
- History rows never show a pending state (no `_pending` badge in
  `_sessionRowsHtml`), so even where merged reads work the user can't tell.
- No visible error/retry surface exists anywhere when a flush parks an op
  as `error` after MAX_ATTEMPTS.
- iOS standalone fires `online` unreliably; only `visibilitychange` backs it
  up — no manual "sync now" exists.
- **Bonus live bug found:** `db.addSession` WHITELISTS fields and silently
  drops `suppressorId`, `lotNumber`, and the rifle/load snapshot names that
  session-flow sends — columns that exist in the live schema (confirmed via
  REORG + CROWD migrations referencing `s.suppressor_id`, `s.lot_number`,
  `s.rifle_caliber`, `s.load_name`, `s.load_bullet_weight`, `s.load_bullet_name`).
  Online paper saves currently lose their suppressor/lot tags — which also
  silences the per-can shift monitor for paper sessions. Fixing in step 7.

**3.3 confirmed:** `SteelSession.open()` → `renderSetup()` directly; the casual
tier never presents.

Also confirmed for 2.3: `solveTruing(obs, ctx, opts)` accepts a single
observation (quick mode already builds exactly one), so the one-observation
"where did it hit?" path can ride the existing engine unmodified.

### Judgment calls
- (per step below)

---

## Step 1 — Lane setting + copy map (Part 1)

`js/lanes.js` (pure `LanesCore` + thin `Lanes` wrapper + `Copy.t()`), 20 tests:
- `detailed_mode` user_settings key `{v:1, detailed, source:'user'|'inferred'}`
  — no schema. Default OFF (Simple is the front door).
- **One-time inference:** when no setting exists, an account with any FULL
  steel string gets Detailed defaulted ON (persisted as `source:'inferred'`,
  so it runs exactly once and flips freely afterward).
- **THE COPY MAP** (`LANE_COPY`): one place both vocabularies live — bullet
  speed/muzzle velocity, drop chart/DOPE card, where did it hit?/impact
  offset, your rifle's numbers/ballistic profile, checked/verified. Screens
  call `Copy.t(key)`; the vocabularies cannot drift per-screen. Later steps
  route copy through it as they touch each screen.
- The switch lives in Home's More tools sheet ("Detailed mode — per-shot
  logging, wind, full truing controls"); Home re-renders on change via
  `Lanes.onChange`.

---

## Step 2 — Truing dead-end fixed (§3.1), both lanes

- **"Send to Truing" now lands DIRECTLY on Full true** with the handed-over
  string preselected — the mode-picker stop is gone from that path.
- **The mode picker is one status block + ONE primary**: "Continue ›" (or
  "True anyway ›" when a prerequisite is unmet — surfaced, never a gate).
  Continue → Full true when strings exist, Quick true otherwise. The two
  modes remain as quiet rows for Detailed users; the old silent no-op
  ("Full true" doing nothing with zero strings) now launches the steel
  logger instead.
- **Applied screen enriched**: "Your rifle's numbers" (trued BC · MV) plus
  the "For your rangefinder" line — `deviceCompensation()` when scope
  tracking is verified ("compensated for your scope's clicks"), else the
  true values "enter as-is".
- **Headless proof of the owner's real case**: an 8-shot 925-yd full string
  handed from steel → Full true (preselected, checklist 8/8 velocities) →
  Review correction → result (BC 0.315→0.299 recommended per doctrine, with
  the honest 62%-of-supersonic extrapolation warning; Moderate confidence,
  3/5) → Apply → Applied with numbers + compensated rangefinder line
  (BC 0.300 · 2989 fps at factor 1.03). Screenshots in the run log.

### Judgment calls (step 2)
- Prerequisites "good" = tracking known + zero confirmed + MV measured; any
  gap only changes the button label to "True anyway ›" (doctrine enforced by
  coach, not by gates — unchanged v2.3 stance).

---

## Step 3 — "Where did it hit?" (§2.3, the crown jewel)

`js/simple-true.js` (pure top + DOM bottom, 25 tests):
- **Pure:** `simpleTrueObservation()` — one observed hit → the existing
  engine (`solveTruing`) in one-observation mode; doctrine routes silently
  (`result.recommended`, no fork); one-shot confidence via the existing
  `truingConfidence` (engine word Thin → shown as "rough"); payoff computed
  as the dial at the observed range before vs after (rifle units, 0.1).
  `simpleTruePayoffCopy()` produces the exact contract sentence.
- **THE ROUND-TRIP TEST (contract-specified):** a planted 15 fps error is
  recovered from ONE 600-yd observation to within 5 fps (got 2944 vs true
  2945); routed to MV; confidence ≤2 segments; a rich 8-shot/2-group input
  scores higher (accumulation raises it honestly).
- **Simple-lane honesty guards** (found by the tests): the engine will
  happily "solve" a zero-band hit or pin a huge miss at its bracket edge
  (600-yd 60-inch miss → MV 2516, capped). Roy never sees those: zero-band
  or capped → an honest "Couldn't use that one" screen with the reason
  (too close to zero / miss too big to be speed-or-drag — check your zero).
  Dead-center hits get "your dial barely moves — numbers were already close."
- **DOM flow:** `SimpleTrue.askHit(ctx)` — big 64px glove steppers in
  INCHES (high/low primary; left/right and "add bullet speed" behind quiet
  folds), then THE PAYOFF immediately: "Got it." banner + [Keep it] [Undo].
  Keep writes the append-only truing event (mode 'simple', same shape as
  the detailed Apply — one engine, one ledger) + trued values via SyncQueue;
  Undo writes nothing.

### Judgment calls (step 3)
- Hit offsets are captured in INCHES regardless of rifle units — Roy speaks
  inches on steel; conversion happens at the observed range. The payoff
  speaks the rifle's dial units.
- Typed bullet speed feeds the shot normalization (`shotMV`) only — it is a
  reading on ONE shot, not an MV measurement event (§2.5's manual entry is
  the honest place for that).

---

## Step 4 — Log shooting (§2.2) + steel-end order (§3.4) + casual escape (§3.3)

- **`js/log-shooting.js`** — the simple lane's one flow. "Paper or steel?"
  (two big rows). PAPER → the existing photo capture; STEEL → one screen:
  distance chips (300–1000 + custom) · "I dialed" big steppers in the
  rifle's units (wind-dialed behind a fold) · primary "I shot — where did
  it hit? ›". Quiet escapes: "Just photograph the plate" (casual) and a
  "more" fold opening the detailed logger. No wind/holds/per-shot-MV/DOF/
  tier anywhere in the simple path.
- **The steel entry saves REAL data first (§3.4):** a steel string (tier
  full, honest provenance: `wind: null`, holds 0/0, note 'simple') + one
  shot converted from the inch stepper into the rifle's units — same tables
  as the detailed logger, so full-true can tie these strings in later.
  Keep/Undo governs only the correction; the string stays either way.
- **§3.4 detailed lane:** "Send string to Truing" is no longer a peer of
  Save — Save is the single primary; the saved screen offers a gold
  "True this rifle now ›" follow-on (hands the string to Full true).
- **§3.3:** `SteelSession.open(db, rifleId, 'casual')` +
  `ToolActions.steelCasual` — the photograph-the-plate escape is one tap
  from the simple steel screen (it existed but was buried inside full setup).
- **§2.2 paper defaults:** in the simple lane the suppressor/lot sheet no
  longer interrupts — last-time defaults apply silently and a quiet
  "Details: <can> · Lot <n> — change" link on the data step reopens the
  sheet. Detailed lane keeps the sheet (and clears the link).
- **Card follow-through (§2.3):** `deriveCalibrationStatus` now surfaces
  the latest truing event's confidence; next-action gains rung 5.5 — a
  Thin (rough) truing suggests "One more shot at 600 firms it up" (4 new
  ladder tests, 50 total).
- **Headless proof:** steel screen → "Where did it hit?" (big ON/± inch
  steppers, folds for left-right + bullet speed) → THE PAYOFF: "Got it.
  Your 600-yard dial changes from 10.9 to 11.6. Everything past ~400 just
  got more accurate." [Keep it][Undo]. Bonus: the first harness run dialed
  an absurd 4 MOA at 600 and the honesty guard correctly refused it —
  the guard works in the real flow, not just unit tests.

### Judgment calls (step 4)
- Simple steel strings save as tier 'full' (they carry the complete truing
  equation) with `wind: null` — provenance stays honest and the full-true
  checklist correctly shows "wind ✗" if they're tied in later.
- If no load with a BC exists, the steel path stops at an honest "One thing
  first — add bullet & speed" screen instead of a payoff that can't compute.

---

## Step 5 — Manual bullet speed + import-gate audit (§2.5)

- **`js/mv-entry.js`** — the "Add bullet speed" sheet, everywhere velocity is
  asked: PRIMARY "Type it in" (average + roughly-how-many-shots chips 3/5/10/20
  + optional SD behind a fold); secondary "Import a chronograph file" (gold
  utility). Wired from the card's MV segment sheet and the next-action
  deep link (`_launch('chrono')` now opens the sheet first).
- **Honest provenance:** a counted average writes `mv_measurements` with
  `source: 'manual'` (via SyncQueue — works offline); "just a guess" updates
  the load's box velocity instead — the state honestly stays *estimated*.
  Verified (not rebuilt): `addMvMeasurement` already defaults source
  'manual', `deriveCalibrationStatus` treats any counted measurement as
  measured, and `truingConfidence` keys off measured-MV independently.
- **Import-gate audit — one real gate found and opened:** the certificate
  preflight hard-blocked on confirmed chrono strings. Now a typed,
  shot-counted measurement satisfies it: blocker message updated, the load
  picker accepts typed-velocity loads ("avg 2950 (10 shots, typed)"), and
  the printed certificate stamps provenance — SHOTS "10 (typed)", SD/ES
  print "—" when unknown. Chrono strings still take precedence when present.
  Everything else checked (steel per-shot MV numeric pad, truing "true
  rough" path, onboarding manual entry, load form) already had manual paths.

---

## Step 6 — Simple rifle page (§2.4) + Home per lane (§2.1)

- **Home, simple lane:** exactly TWO rows below the card — **Log shooting**
  and **My rifle** — plus the quiet "+ More tools" (where the lane switch
  lives). The card gains a gold **"Drop chart ›"** utility directly under
  the number (label follows the copy map: "DOPE card" in Detailed). The
  Detailed lane keeps the four doors unchanged.
- **`js/rifle-simple.js`** — ONE scrolling page, frequency-ordered: the
  calibration status card → Drop chart + Add bullet speed (gold utilities)
  → **Your rifle's numbers** (bullet w/ BC + trued marker · bullet speed
  with honest source: "trued from your hits" / "measured, typed in, over
  10 shots" / "the box number" · **"For your rangefinder: BC · speed"**
  from `deviceCompensation` when tracking is verified — "checked against
  your scope's clicks" — else "enter as-is") → History (the unified list)
  → Barrel (rounds / since-cleaning) → Report & Certificate → Rifle
  details & loads (the full page) → Export data.
- categories.js exports `showHistory(rifleId, chip)` and
  `openReportCertificateFor(rifleId)` so the simple page reuses the exact
  §2.5/§2.2 sub-screens (no duplicates).
- Headless proof: simple Home (card + Drop chart + two rows) and the
  rifle page (status green, sourced speed, compensated rangefinder line
  BC 0.316 / 2995 fps at factor 1.03).

### Judgment calls (step 6)
- "+ More tools" stays visible in the simple lane — it is the settings
  surface holding the Detailed-mode switch (§1.1), not a door.
- "My rifle" needs the card's rifle; before rifles resolve the tap is a
  no-op rather than a wrong-rifle guess.

---

## Step 7 — Offline sync visibility (§3.2) + regression tests

Fixes for every hole from the step-0 diagnosis:
- **`db.getSession` decorated** (new READ_SINGLE map): a queued session is
  now visible to single-row reads — Home's Recent strip showed NOTHING for
  a pending save. Queued copy wins by id, flagged `_pending`.
- **Visible pending state:** history rows (rifle history + unified History)
  now mark pending saves — "waiting to sync" in caution color.
- **Visible retry state:** `SyncQueue.summary()` / `retryErrors()` /
  `renderStatus(el)` — a caution banner ("2 saves waiting to sync · 1
  failed — Sync now") renders at the top of unified History and Data &
  Records whenever ops are pending or parked; Sync now resets errored ops
  (fresh attempt budget) and flushes. Data is never invisible.
- **Reconnect triggers hardened:** iOS standalone fires `online`
  unreliably — added `pageshow` and `focus` listeners alongside
  `online`/`visibilitychange`; plus the always-there manual Sync now.
- **`db.addSession` whitelist fixed** (the step-0 bonus find): it silently
  dropped `suppressorId`, `lotNumber`, and the rifle/load snapshot names
  that session-flow sends — columns that exist in the live schema. Online
  paper saves were losing their suppressor/lot tags (which also silenced
  the per-can shift monitor for paper sessions). All seven fields now map.
- **17 new regression tests** (sync-queue suite, 49 total) reproducing the
  contract path: offline save visible+pending → reconnect flush → visible
  normally → flush failure still visible + retryable (immutable resetErrors,
  fresh attempt budget).

### Judgment calls (step 7)
- The likeliest owner scenario: the save was fine but `online` never fired
  on iOS AND the Recent strip (getSession) couldn't see the pending row —
  it looked vanished while sitting safely in the queue. Every leg of that
  chain now has a fix + a visible state.

---

## Step 8 — Scroll drift (§3.5) + safe-area sweep (§3.6)

- **Vertical-only lock:** `.app-view { overflow-x: hidden }` — no page can
  drift sideways, app-wide (data tables keep their own internal
  `overflow-x: auto` wrappers, so nothing is clipped).
- **The offender found:** `.instrument-value` (`white-space: nowrap`, 34px
  mono) inside the flexed `.stat-strip` on the rifle page — three wide
  round-count values pushed the strip wider than the viewport (~0.5"
  drift). Now wraps at the unit (`overflow-wrap: anywhere`).
- **Headless overflow audit:** six screens measured at 390px (Home simple,
  simple rifle page, Data & Records, unified History, simple steel, truing
  result) — zero elements past the right edge, scrollWidth = clientWidth
  everywhere.
- **Safe-area sweep (§3.6):** all tab views sit under the padded shell
  header (v2.4 fix) ✓; the one full-screen surface OUTSIDE the shell —
  the wizard (`.wiz`, first-run onboarding) — now pads by
  `env(safe-area-inset-top)` so its progress bar and close button clear
  the status bar. Overlays are centered cards (unaffected); the auth
  screen is a centered form (unaffected).

---

## Step 9 — Language pass (§1.4) + theme polish

- **`LanesCore.royify()`** (8 new tests, lanes suite 28): ordered,
  case-preserving display translation — muzzle velocity→bullet speed,
  MV→speed, DOPE (card)→drop chart, chrono(graph)/file→speed meter (file),
  ballistic profile→your rifle's numbers. `Copy.roy(text)` applies it only
  in the simple lane; the detailed lane's precise vocabulary is untouched.
  One map — the vocabularies cannot drift per-screen.
- **Applied at the display seams:** the card's next-action (title/detail/
  payoff), the go-shoot floor, the segment strip ("Speed" for Roy, "MV"
  detailed), and the segment what/why sheets (calibration-status
  `openSheet` gained an optional `transform`; the engine's stored words
  never change — display only).
- Copy strays fixed: rifle-report's velocity empty state no longer says
  "use Import chrono data on Home" (that door moved two contracts ago) —
  now offers type-it-in first.
- Dark theme verified on the new v2.5 surfaces (simple Home with Roy copy,
  the hit screen); light verified throughout the run.

### Judgment calls (step 9)
- royify is DISPLAY-ONLY at render seams — events, tables, and engine
  wording stay precise, so the detailed lane and the data model never see
  Roy's vocabulary.

---

## Step 10 — QA

- **Suites: 807 tests green** (733 baseline + 20 lanes + 8 royify + 25
  simple-true + 4 next-action + 17 sync-queue regression — and every
  earlier suite untouched).
- **Headless, 390×844, both themes:** simple Home (Roy copy, Drop chart,
  two rows) light + dark · Log shooting → steel screen → "Where did it
  hit?" (light + dark) → THE PAYOFF (Keep/Undo) · simple rifle page
  (status, sourced speed, compensated rangefinder line) · truing landing/
  result/Applied for the 925-yd string · Data & Records with sync banner
  seam.
- **Tap audit:** all new interactive elements ≥52px (64px hit/dial
  steppers, 52px chips/folds/utilities; fixed the one stray — the Sync
  now banner button had an inline 44px override).
- **Overflow audit:** six screens, zero horizontal drift (step 8).
- **Honesty audit baked into tests:** zero-band and bracket-capped
  observations refuse politely; one shot = rough; accumulation raises
  confidence; dead-center = "barely moves".

---

## OWNER REVIEW QUEUE (do these on your phone)

1. **THE ROY WALK (the contract's acceptance test):** fresh account →
   onboarding (rifle → bullet & box speed typed → suppressor) → land on
   the card → Log shooting → Steel → 600 → dial what your chart says →
   one hit, "4 inches low" on the stepper → payoff shows the dial change →
   Keep it → card should read **"Proven to 600 — rough"**-class state with
   next action "One more shot at 600 firms it up" → Drop chart from the
   card. Every screen ≤1 primary action, no jargon.
2. **YOUR 925 STRING, DETAILED LANE:** More tools → Detailed mode ON →
   Steel/Field Session → log the 8 shots → Save (single primary) →
   "True this rifle now ›" → lands ON your string preselected → Review
   correction → result (both corrections + recommendation + confidence
   meter + Why? ledger) → **Apply** → "Your rifle's numbers" + the
   "For your rangefinder" line. This is the dead-end fix — walk it
   end-to-end.
3. **AIRPLANE MODE:** airplane on → photograph and save a paper session
   ("Saved — will sync…") → it must appear in History immediately marked
   "waiting to sync" → airplane off, reopen the app → it must appear
   normally (no marker). If anything parks, History/Data & Records now
   show a "Sync now" banner — data is never invisible.
4. **MANUAL BULLET SPEED:** card → Speed segment → "Add bullet speed" →
   type an average + shot count → segment flips to measured. Try "just a
   guess" too — it must stay *estimated* (honest).
5. **Detailed-mode inference:** your existing account has full steel
   strings, so Detailed should be ON automatically the first time you
   open this build (switch it freely afterward).
6. **iOS safe-area + scroll:** confirm the header clears the status bar on
   every screen (incl. the first-run wizard) and the rifle page no longer
   drifts sideways.
7. Reminder from v2.4 still open: run `SIMPLIFY-migrations.sql` if you
   haven't (account deletion), and the real-print target photo test.
