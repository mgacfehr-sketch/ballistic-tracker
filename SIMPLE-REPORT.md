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

## OWNER REVIEW QUEUE

- (accumulates during the run)
