# V4-REPORT.md — Build Contract v4.0 ("The Card")

Branch `redesign` · started 2026-07-27 · baseline 916 tests green, SW v143
at start (per the redesign branch's continuous-build cadence — see
`[[reorg-v23-build-cadence]]`, no per-step stops, owner items batched here).

Thesis: the app becomes "a rifle, a number, a chart, and three sentences."
The session dies as a user-facing concept; no flow has steps.

---

## What was actually built vs. what already existed

The v3.0 "One Screen" shell (`js/rifle-app.js`, `rifle-add.js`,
`rifle-payoff.js`, `rifle-why.js`, `rifle-chart.js`, `rifle-record.js`) was
already architecturally close to "the Card" — one resting screen, a gold
`+` button, a feed. **v4.0 is a re-scoping of that shell, not a rewrite of
it** — "fresh shell" in the contract's build-discipline section is honored
in spirit (no remodel of the old 8-view Paperwork/history pages happened
again) rather than literally (the existing Card family was extended, not
deleted and rebuilt, since deleting working, already-compliant code just to
re-type it would have been pure churn).

The actual gaps, closed in this build:

1. **"I zeroed" (3a) is now a real fact card**, not the old 7-step photo
   wizard. New screen in `rifle-add.js` (`_zeroScreen`): distance chip
   (25/50/100/200 + custom), group-size stepper, shot-count chips
   (3/5/10), one gold Done. Writes a standalone `zero_event`
   (`sessionId: null`, `source: 'manual'`) — `feed-core.js` and
   `calibration-status.js` already supported session-less zero events
   (built for exactly this case, unused until now). "measure it from a
   photo instead" is the one sanctioned link back into the old capture
   pipeline, per the contract's own text for 3a.
2. **"add more shots" (3b) IS detailed truing now.** The steel card grew
   from one hit field to N (add/remove rows, one delegated click handler
   so repainting never leaks listeners). A new `RiflePayoff.runMulti` +
   `_solveMulti` in `rifle-payoff.js` mirrors `simple-true.js`'s
   `simpleTrueObservation()` math for N observations sharing one
   distance/dial (one truing GROUP, matching how `steel-session.js`'s
   mature logger already builds `obs` arrays) — `simple-true.js` itself
   is untouched, per the contract's protected-engines list. Verified
   end-to-end via harness: 8 shots at 600yd → payoff → Keep → correct
   dial move → truing event written → back on the Card.
3. **WHAT HAPPENED sheet speaks Roy's words** — "I zeroed" / "I shot at
   distance" / "I clocked my speed", no Paper/Steel/Chronograph labels.
4. **The coach line is tappable** (`rifle-app.js` `_launchCoach`), routing
   by `next-action.js`'s `action.type` straight into the fact card that
   closes the gap — it wasn't wired to anything before. Caught and fixed
   a real bug in the process: the coach `<button>` was nested inside the
   numberbox `<button>` (invalid HTML), so taps bubbled to the wrong
   handler (opened Why instead of the fact card) — found by the headless
   harness walk, not by inspection.
5. **`rifle-why.js`'s Zero and "Checked at distance" rows** still routed
   to `SessionLaunch`/`ToolActions.truing` (the old wizard and the old
   separate truing door) — a second instance of the same kill-list
   violation the coach line had. Fixed to route to the fact cards.
6. **Rifle switcher search is always visible**, not gated past 8 rifles
   (`test-screen-nav.js`'s F4 test asserted the *old* gated behavior —
   updated to assert the contract's always-visible requirement instead).
7. **Onboarding is one question** — name the rifle. The bullet/box-velocity
   step was removed from `onboarding.js`'s `ONBOARDING_WIZARD`; ammo now
   resolves inline the first time a fact card needs it, same "+ New ammo"
   pattern every card already used. Dead code (`_mountLoadStep`, the
   now-unused `_num` helper) removed.
8. **Admin is URL-only** (`#admin`) — the header icon (`app.js`) is gone;
   an authenticated admin user navigating to `#admin` still lands on the
   dashboard, nothing in the chrome points at it.
9. **The Rifle details drawer is a flat 8-row list** — Build sheet / Ammo
   list / Barrel & rounds / Certificate & report / Export everything /
   Scope tracking / Print a target / Settings & sign-out. Rewrote
   `profiles.js`'s `_renderRifleDetail` (same function name — every
   existing "back to rifle detail" call site across `profiles.js` and
   `history.js` kept working unchanged) to drop the calibration-status
   card, stat strip, "Confirm zero" button, inline build-sheet dump, and
   Categories "Everything else" shortcuts — all of that either lives on
   the Card now or is one tap into its own row. Added `showLoadsList` (a
   genuinely new small screen — ammo didn't have a standalone list
   before) and `_openTargetPrintChooser`.
10. **Law 4 — nothing typed is ever lost.** New `js/fact-draft.js`:
    every fact card (zero/steel/chrono) autosaves its state to
    localStorage on every change, restores it on next open, and clears
    it only once the real Supabase write has gone through — never on
    Back. The Card shows a "Finish what you started — <what>" banner
    when any draft exists, routing straight back into that card.
    Verified via harness: type a value → reload the page (simulating a
    kill) → value restored → back to the Card → banner appears → tap it
    → still there → finish the save → banner and localStorage entry both
    gone.
11. `sw.js` `CACHE_VERSION` bumped 143 → 144.

**Untouched engines** (verified via `git diff --stat` against the pre-build
commit): `calculations.js`, `velocity-stats.js`, `garmin-import.js`,
`ballistic-solver.js`, `truing-core.js`, `calibration-status.js`,
`simple-true.js`, `db.js`, `net.js`, `sync-queue.js`, `target-geometry.js`
— none appear in the diff. No schema changes, no migrations.

---

## Verification

No live Supabase session was available in this environment, so verification
used the established pattern from `[[playwright-harness-verification]]`:
scratchpad harnesses loading the real `css/`+`js/*` files via `file://` URLs
against a stubbed `db` (a `Proxy` defaulting every unlisted method to
`Promise.resolve([])`), screenshotted and DOM-asserted headlessly
(Playwright, chromium_headless_shell-1228, 390×844).

Confirmed working, no console/page errors:
- Card renders correctly across no-rifle / no-ammo / ammo-but-unzeroed
  states; coach line text matches the contract's exact wording for the
  "no zero" state.
- WHAT HAPPENED sheet shows the three Roy sentences.
- "I zeroed" card: full save round-trip (writes a correct `zero_event`
  with `inchesToMOA`-derived `groupSizeMOA`) and returns to the Card.
- "I shot at distance" card: single-shot path unchanged; 8-shot
  "add more shots" path save → payoff → Keep → truing event → Card.
- Coach-line tap routes to the correct fact card (was broken by the
  nested-button bug above; confirmed fixed).
- `rifle-why.js`'s Zero and "Checked at distance" rows route to the fact
  cards (confirmed fixed).
- Rifle details drawer: all 8 rows present, each routes correctly
  (`DataExport.open`, the target-print chooser, etc.).
- Law 4: draft survives a simulated crash (page reload), restores into
  the same card, the Card's "Finish what you started" banner appears and
  routes back correctly, and both the banner and the localStorage entry
  clear on a real save.

**Not independently re-verified in this session** (unchanged code paths,
carried over from working v3.0/v2.x behavior, not because they're assumed
safe by default):
- The airplane-mode cold-start walk (QA gate #3) — `SyncQueue`/
  `OfflineCache` are untouched and the new fact cards write through the
  same `_write()` → `SyncQueue.write()` seam the existing steel/chrono
  cards already used, but the actual offline harness (seeded IndexedDB,
  a rejecting fake Supabase client) wasn't re-run this session.
- A live-account "Roy cold walk" against real Supabase — the pieces were
  verified individually (onboarding form logic unchanged except the
  step-2 removal; the fact cards themselves fully verified per above);
  the literal single continuous walk wasn't run against a live backend.

All 21 Node test suites green, **916 tests passed, 0 failed** (unchanged
count from the branch's stated baseline — one existing test,
`test-screen-nav.js`'s F4 search-gating check, was updated to assert the
*new* contract-mandated behavior instead of the old gated one; no tests
were added or deleted).

---

## OWNER REVIEW QUEUE

1. **CLAUDE.md tension on Law 4.** CLAUDE.md's "Do NOT" list says
   "Use localStorage for domain data (sessions, profiles) — settings/flags
   only." The contract's Law 4 explicitly requires localStorage-based
   draft autosave. Treated the draft as pre-persistence scratch state
   (same category as `rifle-add.js`'s pre-existing `yort_steel_last`
   sticky default), not a domain record, and implemented Law 4 literally
   since it's a named, explicit instruction in the newer, more specific
   contract. Flagging in case the owner wants this recorded differently
   in CLAUDE.md itself.
2. **"advanced" (steel card) and "measure it from a photo instead" (zero
   card) both still exist as links into the old, richer screens**
   (`steel-session.js`'s full logger; the photo capture pipeline). Read
   the kill-list's "no separate truing door" as being about the *forced,
   primary* doors (Categories → Truing tool; the old detailed lane) —
   these two are one-tap escape hatches the contract's own 3a/3b text
   explicitly allows, for windage/multi-string work and photographed
   groups the lightweight cards don't handle. Worth an explicit
   yes/no from the owner if that reading is wrong.
3. **Multi-shot truing events have slightly different provenance metadata
   than single-shot ones.** `simple-true.js`'s shared `SimpleTrue.keep()`
   write path hardcodes `shotCount: 1` for its own one-observation
   caller (by design — it's untouched). The new multi-shot path
   (`_keepMulti` in `rifle-payoff.js`) is a small, separate write with
   the *correct* `shotCount`/`groupCount`, duplicating ~25 lines of
   `_keep`'s shape rather than editing the protected file. No functional
   gap (the applied correction and confidence are both accurate either
   way) — flagging the duplication as a known, deliberate seam.
4. **`rifle-cards.js`** is dead code (zero references anywhere, not
   loaded by `index.html`) predating this build — noticed while sweeping
   for kill-list violations, not touched (deletions aren't this
   contract's job either, per the same non-goal v3.0's own report
   recorded for its dormant files).
5. **Offline/live-account walks** (QA gate items #1 and #3) — see
   "Not independently re-verified" above. Recommend a manual pass before
   shipping, or a follow-up session with the offline-cache harness.

---

## File-level summary

12 files touched, 0 files deleted, 1 new file (`js/fact-draft.js`).
Full diff: `git diff be73e9f..HEAD` (`be73e9f` = the commit that added
this contract to the repo).
