# Phase C/D/E — Build Report

**Scope:** Amendment 1 Part B — Phase C (memory + minimal invalidation,
together), Phase D (validation statuses + coach brain), and Phase E's
shadow stage (per-shot residual engine, spec + synthetic gate +
shadow-only implementation, explicitly NOT wired to truing/solutions/
PROVEN TO). One continuous autonomous run per the owner's instruction,
branch `redesign`, per-step commits, pushed after every commit. All new
SQL lives in `PHASECD-migrations.sql` — additive, never run by the
assistant.

**No canon contradiction was found.** Several design decisions required
judgment inside the phases' own stated latitude ("right-sized," "the
existing four-segment status model is the correct skeleton," etc.) —
every one is documented below and in the code itself, none required
amending the canon.

**Two real bugs were caught by this session's own testing before they
ever reached a commit** (detailed in Phase D and Phase E below) — both
are the kind of thing "shadow stage" and "verify before ship" exist to
catch, and both are now covered by regression tests.

---

## Part (a) — Everything completed

### Phase C — carry-forward memory + minimal compatibility matrix

**`js/config-memory.js` (new, pure, Node-tested — 16 checks).**
Two jobs Amendment 1 ships together:
- `deriveCurrentState` — latest-wins over an append-only suppressor/lot
  epoch ledger (same `_latestBy` idiom `calibration-status.js` already
  uses), per A15 ("an explicit current-state fact outranks inference").
- `checkCompatibility` — Constitution §120's compatibility/invalidation
  service, centralized here rather than re-implemented per screen.
  Barrel change hard-invalidates zero/truing/velocity baseline;
  suppressor change hard-invalidates zero/velocity but leaves truing
  alone and marks the OTHER configuration as preserved separately (A12
  — reattaching restores it, never destroyed); lot change is a soft
  note only, never a hard invalidation, matching the Constitution
  §12.2 table's own wording ("prior lot remains comparable but not
  identical"). Deliberately does **not** touch `calibration-status.js`'s
  frozen contract — a caller-side pre-check, not a rollup-engine change.

**Database (`PHASECD-migrations.sql` PC1–PC3):**
- `config_epochs` — append-only suppressor/lot change ledger. A row
  means "this changed here," never "this was used again."
- `recurring_targets` — remembered places (Constitution §35.5),
  ranked by recency then use count. Deliberately NOT dual-written into
  `fact_events` — it's a preference cache, not an evidentiary fact
  (unlike `config_epochs`, which is).
- `barrel_id` — nullable, additive column added to `zero_events`,
  `mv_measurements`, `truing_events`, `steel_strings`. Closes a gap
  `MIGRATION-INVENTORY.md` §2 already named: none of these tables could
  previously say which barrel was active when the row was written,
  making Constitution §12.2's "new barrel invalidates zero/truing/
  velocity baseline" rule unenforceable in practice. NULL on every
  existing row (never backfilled/fabricated); only new rows carry a
  value, and only where a caller supplies one.

**`js/db.js` additions:** `addConfigEpoch`/`getConfigEpochsByRifle`,
`changeLot` (recognition-confirmed lot change — writes the epoch and
keeps `loads.lotNumber`'s fast-read cache in sync; a no-op write when
the answer was "still this lot"), `addRecurringTargetUse`/
`getRecurringTargets`. New generic `_insertGracefulRow` helper
(same missing-column-retry idiom as the existing
`_insertSessionGraceful`) used for every additive column this phase
touches, so shipped code never hard-fails against a database the owner
hasn't migrated yet.

**`js/suppressors.js`:** `rememberLastUsed` now writes a `config_epochs`
row, but **only when the suppressor actually changes** (compared
against the previously remembered value) — a re-use writes nothing.
Widened its Node export from `{lastUsedKey}` to the whole module so
this new logic is directly testable (`tests/test-suppressors.js`, 9
checks).

**`js/rifle-add.js` (the steel card — the one screen Phase C names
explicitly):**
- Distance chips rank by recency once real history exists
  (`db.getRecurringTargets`), falling back to the fixed starter list
  for a rifle with no history yet (verified: a brand-new rifle in the
  cold-walk QA gate correctly shows the fixed list, never a fabricated
  ranking).
- "Still lot X? / New lot" recognition row — Phase C's own example
  phrasing. "Yes" is a no-op (nothing changed, nothing written). "New
  lot" reveals an inline field; saving calls `db.changeLot`. Only
  rendered when a lot is actually on file (verified: absent on a
  brand-new rifle with no ammo yet — no premature question).
- The active barrel and the current suppressor/lot are threaded through
  into `addSteelString`/`addZeroEvent` so the compatibility service has
  real data to work with going forward.

Verified with a headless Playwright harness (scratchpad, stubbed db):
chips render recency-ranked, the lot-recognition round trip renders/
saves/updates correctly, `addRecurringTargetUse` fires with the actual
selected distance. Screenshot inspected — matches the existing v3 Card
conventions with **zero new CSS**.

---

### Phase D — validation statuses + coach brain

**`js/validation-status.js` (new, pure, Node-tested — 31 checks).**
Closes the gaps Amendment A4 named as still missing from the "correct"
four-segment skeleton:
- `deriveSettlingStatus` — A6's post-cleaning window (default 12 shots,
  A7's own owner-preference number, explicitly not a canon default).
- `computeBaseline` + `deriveSpotCheckOutcome` — A10's three-outcome
  classification. Never reachable as "confirmed" without a real
  baseline (≥2 compatible prior observations); pre-baseline, the only
  rule A10 itself defines is the fixed ~1 MOA alarm fallback, so the
  engine degrades to an alarm/drift binary exactly as written.
- `oneShotCheckCopy` — A5's fixed pass/fail language ("travel check
  passed / no gross shift observed") that never claims to confirm,
  refresh, or degrade zero status.
- `deriveTroubleshootingHold` — Validation Doctrine §7's ladder
  (zero → mount → velocity → builder). **A design bug found and fixed
  during this same phase, before the first commit that used it:** the
  first draft treated an `'ok'` check result ("checked, nothing wrong
  here") as equivalent to `'resolved'` ("the problem is fixed") — both
  cleared the hold immediately. Per the doctrine's own ladder, checking
  the zero and finding it fine should advance to the NEXT rung, not
  clear the hold outright. Fixed so only `'resolved'` exits; `'ok'`/
  `'issue_found'` advance the ladder. One prior test that asserted the
  wrong behavior was corrected; two new tests cover walking the full
  ladder on all-`'ok'` and resolving at the first rung.

**`js/historical-insights.js` (new, pure, Node-tested — 13 checks).**
A13's deterministic whitelist (config-change notice, truing/MV drift,
repeated spot-check confirmations, lot comparison, cleaning history),
priority-ordered, **at most one insight per call** (Evidence & History
Doctrine B3: "one statement, not a dashboard"). Phrasing matches B2's
own canonical examples verbatim where the doctrine gave one verbatim.

**`js/round-budget.js` (new, pure, Node-tested — 10 checks).** A14's
pre-trip round budget, matching Validation Doctrine §2's worked example
exactly (65/75 rounds, an 18-round mission → "clean it first," margin
−8). Deliberately has **no** automatic wiring into `next-action.js`'s
always-on ladder — A14 requires request-only; it is reached only through
`profiles.js`'s new "Planning a trip?" door in the rifle details drawer,
never surfaced as a coach-line nag.

**`js/next-action.js`:** two backward-compatible additions (omitting
either input reproduces the exact pre-Phase-D ladder — verified by
test, not just asserted). `troubleshootingHold` becomes the ONLY
non-floor rung while active and strips every correction-suggesting rung
(`true-rifle`/`re-true`/`confirm-true`/`shoot-distance`) per Commandment
32. `configCompatNote` (Phase C's `checkCompatibility`) surfaces its own
rung, suppressed while a hold is active so only one warning shows at a
time.

**`js/rifle-payoff.js` — the validation gate.** Runs before every
truing attempt. **A second real bug found and fixed by this session's
own harness verification, before it ever shipped:** the gate's first
draft classified the raw `observedComeUpMOA` (the "true come-up this
shot needed," routinely several MOA at any real distance) against the
~1 MOA alarm threshold, instead of the RESIDUAL between that value and
the CURRENT profile's own prediction. That would have misclassified
nearly every ordinary shot as an alarm. Fixed by factoring out
`_profileFor`/`_residualMOA(Multi)` so the gate and the actual solve
agree on what "predicted" means. Verified with a 3-scenario headless
harness: small residual + no history → normal payoff, unchanged from
pre-Phase-D behavior; large residual → hold screen, `alarm` row written
to `troubleshooting_checks`; small residual + a prior unresolved alarm →
still held, no duplicate alarm row. **Scoped decision:** A10's full
baseline-relative "confirmed" classification needs a per-rifle,
per-distance, compatibility-filtered residual query across prior
observations; building and testing that data-gathering path is out of
scope this pass (see Deferred Follow-ups below) — the gate always runs
`baseline: null`, which is the exact case A10 itself defines a rule for.

**`js/rifle-app.js`:** the resting screen gathers troubleshooting
checks and suppressor/lot config epochs alongside its existing status
fetch and feeds both into the SAME coach line (no new widget — Card UI
convention preserved). Added `_openTroubleshootingCheck`: the missing
other half of the hold — without a UI that WRITES a check, the hold
this phase introduces could never clear through the app at all. A plain
per-step overlay (checked-clean / found-something / not-yet); the final
`builder` rung's checked-clean maps to `'resolved'` (not `'ok'`) so the
ladder always terminates.

**`js/rifle-add.js`:** the simple steel-save path now calls
`Suppressors.rememberLastUsed` — a real finding: only the older detailed
`session-flow.js`/`steel-session.js` paths called this before; the
primary v3/v4 screen never recorded a suppressor change as a fact at
all, so Phase C's epoch tracking would have been silently dead on the
main path without this.

**`js/profiles.js`:** "Planning a trip?" door in the rifle details
drawer — A14's explicit, request-only entry point. Rounds-since-
cleaning is computed automatically; the interval and mission cost are
the owner's own numbers (A7: owner preference, never a product default).

**`js/db.js`:** `troubleshooting_checks` CRUD, dual-writes into
`fact_events`, append-only.

Verified end-to-end with a headless harness driving the real
`RifleApp`/`next-action.js`/`validation-status.js`/`config-memory.js`
chain against a stubbed db: a normal rifle stays silent (no fabricated
warning), a config-compat note surfaces correctly, a troubleshooting
hold surfaces and blocks every truing suggestion, and the full
entry → tap → mark-ok → re-render → ladder-advanced-to-"mount" round
trip is confirmed by the overlay's title changing on a second tap. Zero
console errors in every scenario tested.

---

### Phase E — per-shot residual engine, shadow stage

**`E-SHADOW-SPEC.md` v1.0.0** — the versioned specification, written
before implementation per A11. States the authority boundary up front
(this is evidence *preparation*; `truing-core.js`'s Mach-bracket
doctrine, A1, remains the sole routing authority), then: inputs;
uncertainty propagation for chronograph class error, distance,
atmosphere (narrower when measured, wider when estimated — Constitution
§37.2), impact-observation, dial resolution, and aerodynamic jump
(explicitly an uncertainty term, never a fitted parameter, per A11's
own words); the estimator (per-shot velocity-compensated residual vs. a
string-mean baseline, inverse-variance-weighted aggregate); minimum
sample (4 velocity-matched shots); outlier policy; association
eligibility (clean one-to-one sequences only); confidence language
(CALCULATED evidence level, never higher — Evidence & History Doctrine
Part A); the shadow-stage constraints; and the four-stage promotion
gate for future work (synthetic recovery, perturbation, known-answer,
predeclared real-range — only the first two are satisfiable without
real range data, and both are covered this phase).

**`js/residual-engine.js` (new, pure, Node-tested — 40 checks across
two files).** Implements the spec exactly, deliberately independent of
`simple-true.js`/`truing-core.js` (its own copy of the come-up
prediction) so it is a fully separate, self-contained tested engine per
Validation Doctrine §8's own requirement.

**Two real bugs caught by the golden test suite before this ever
shipped**, both documented in the spec itself as the reasoning trail:

1. **Eligibility's original "no competing source" check compared raw
   fps values.** Two different real shots legitimately reading the
   identical rounded velocity is ordinary chronograph data, not a
   duplicate — the first draft would have flagged perfectly good
   sequences as ineligible. Fixed to key on an optional caller-supplied
   `mvSourceId` instead of the numeric value.
2. **The outlier detector's original mean/SD threshold let a single
   gross outlier mask itself** in a small sample — the outlier drags
   the mean toward it and inflates the SD it's being measured against
   at the same time, so its own z-score reads deceptively small.
   Replaced with median/MAD (the standard robust alternative). That in
   turn exposed MAD's own degenerate zero case (a majority of shots
   sharing an identical compensated residual, a real possibility for a
   clean string, not just synthetic data) — fixed with an absolute
   scatter floor (`MAD_FLOOR_MOA = 0.05`).

**`tests/test-golden-residual-engine.js` (27 checks)** — every case
built from a KNOWN synthetic relationship, so the test proves recovery
of a known answer, not mere self-consistency: synthetic recovery
(recovers an injected 0.3 MOA residual riding on real velocity variance,
to within 0.01 MOA), perturbation (small realistic noise moves the
result smoothly, no discontinuity), zero-signal, outlier exclusion (now
verified actually excluding, post-fix), minimum-sample gate, and three
ineligibility cases (sequence gap, mid-sequence dial change, competing
`mvSourceId`). **`tests/test-residual-engine.js` (13 checks)** —
eligibility boundaries and the uncertainty model (estimated atmosphere
widens uncertainty vs. measured; a supplied aero-jump term only ever
widens, never narrows).

**Shadow-only, exactly as instructed.** `js/db.js`'s
`logResidualShadow` only writes to the new `residual_shadow_log` table
(`PHASECD-migrations.sql` PE1) — nothing in this codebase reads that
table back. **Not wired to any live capture screen this session.** The
simple steel lane (the primary v3/v4 UI) only supports one shared typed
velocity per string — there is no per-shot velocity diversity for the
engine to compensate for, so wiring it there would only ever log a
vacuous zero-signal case. The detailed lane (`steel-session.js`) does
carry real per-shot velocity (`mv_source`/`mv_fps` per shot already
exist in the schema) and would be the meaningful wiring point, but
integrating it is deferred — see below — rather than forced in under
time pressure to check a box. Per Amendment 1's explicit instruction:
not wired to truing, solutions, or PROVEN TO regardless.

---

### Test suite / hash locks / cache

All test files green after every commit this session — **1,302 checks
total** across 34 suites (up from the stated 916+ baseline; every new
suite this phase added is itself included in that count).
Protected-engine hash lock: 10/10 green, all 8 engines byte-identical to
Gate 0 — **none were touched this phase**, including
`calibration-status.js` (Phase C/D build entirely around it, never
inside it) and `simple-true.js`/`truing-core.js` (Phase E copies the
prediction math independently rather than reaching into either).
Canon-manifest test: 16/16 green — no canon document was edited.
`sw.js` `CACHE_VERSION` bumped 148 → 153 across this session's five
app-shell-touching commits.

---

## QA gates

**Scripted Roy cold walk** (fresh rifle → typed speed → confirmed zero
→ 600-yard hit → payoff → Keep), run headless against a stubbed db with
**zero** history of any kind (no zero, no MV, no steel string, no
config epoch, no recurring target, no troubleshooting check) — the new
memory layer active throughout:
- THE RIFLE's coach line stayed silent on every Phase C/D-specific
  surface (no config-compat note, no troubleshooting noise) — correct
  for a rifle with nothing to compare against yet.
- The zero and steel screens' distance chips both correctly fell back
  to their fixed starter lists (no recurring-target history to rank
  by) — never a fabricated ranking.
- The lot-recognition row was correctly **absent** on the steel screen
  before any ammo/lot existed — no question the app couldn't yet
  answer, and none asked prematurely.
- The full walk — speed → zero → steel (600) → payoff/hold → back to
  THE RIFLE — completed with the entire Phase C/D write path firing
  (`addMvMeasurement`, `addZeroEvent`, `addRecurringTargetUse`,
  `addSteelString`, `addSteelShot`, `addTroubleshootingCheck`) and
  **zero console/page errors** at any step. (The walk landed on the
  troubleshooting-hold screen because the synthetic defaults — dial=0
  at 600 yd — imply a huge apparent miss against this profile; that is
  the gate correctly refusing to fabricate a correction from an
  untuned test input, not a defect.)

**Airplane-mode:** this session added no changes to `sync-queue.js` or
`offline-cache.js`. Every pre-existing core fact write
(`addZeroEvent`/`addMvMeasurement`/`addSteelString`/`addSteelShot`/
`addTruingEvent`) remains registered in `SyncQueueCore.FN_TABLE` and
fully offline-queueable, unaffected by this phase. Every NEW async read
this phase adds (`getRecurringTargets`, `getConfigEpochsByRifle`,
`getTroubleshootingChecksByRifle`) is wrapped in `.catch(() => [])` at
every call site, confirmed by the cold-walk harness itself running
end-to-end with no `SyncQueue` defined at all (the harness never loaded
`sync-queue.js`) and producing zero errors — a reasonable proxy for
"network absent," not a substitute for a dedicated airplane-mode
harness. **The one real, disclosed gap:** the four NEW write methods
(`changeLot`, `addConfigEpoch`, `addRecurringTargetUse`,
`addTroubleshootingCheck`) are not yet registered in `FN_TABLE` — see
Deferred Follow-ups.

---

## Deferred follow-ups (disclosed scope boundaries, not defects)

1. **Offline queueing for the four new write methods.** Today they are
   online-only. The core fact they ride alongside (the steel string/
   zero/chrono save itself) is unaffected and fully offline-safe either
   way. Of the four, `changeLot` is the one that matters most for the
   "nothing entered is ever lost" promise (Commandment 15) — a shooter
   offline when tapping "New lot" would see a save error rather than a
   silent queue. `addConfigEpoch`/`addRecurringTargetUse`/
   `addTroubleshootingCheck` are lower-stakes (preference cache /
   fire-and-forget enrichment), but the troubleshooting-check write is
   still a real user action worth queuing properly. Registering all
   four in `SyncQueueCore.FN_TABLE` plus a `FLUSH_FACT_EVENT_MAP` entry
   for `addConfigEpoch`/`addTroubleshootingCheck` (mirroring the
   existing eight) is the concrete next step.
2. **Zero/chrono screens don't yet thread suppressor context.** The
   steel screen gathers `Suppressors.isEnabled`/`getLastUsed`; the zero
   screen (`_zeroScreen`) and chrono screen (`_chronoScreen`) don't, so
   a suppressor change first noticed at a zero or chrono capture isn't
   recorded as a `config_epochs` fact from those screens today — only
   from steel. Same UI pattern as steel's own gathering, just not
   copied over yet.
3. **Barrel epoch stamping covers zero and steel, not chrono/truing
   call sites in every UI path.** `db.js` accepts `barrelId` on all
   four relevant methods; `rifle-add.js` wires it for the zero and
   steel screens (the two most consequential for Constitution §12.2's
   barrel-invalidation rule) but not yet the chrono screen's
   `addMvMeasurement` call or `rifle-payoff.js`'s `addTruingEvent` call.
4. **Residual engine has no live wiring point yet** (explicitly correct
   per Amendment 1's own instruction not to wire it to truing/
   solutions/PROVEN TO) — but it also has no wiring into *any* capture
   screen to actually accumulate shadow log rows, because the only
   screen that saves multi-shot strings (the simple lane) doesn't carry
   per-shot velocity diversity. Wiring it into the detailed lane
   (`steel-session.js`), which does carry real per-shot MV, is real
   follow-up work, not done this session.
5. **A10's baseline-relative "confirmed" spot-check classification** is
   fully implemented and tested in `validation-status.js`, but
   `rifle-payoff.js`'s live gate always passes `baseline: null` (the
   alarm/drift binary A10 itself defines for that case). Building the
   compatibility-filtered historical-residual query needed for a real
   baseline is deferred.
6. **`js/historical-insights.js` is built and tested but not wired to
   any live surface.** No screen currently gathers the inputs
   (`cleaningSettlingCounts`, `priorLotStats`/`currentLotStats`,
   `roundsSinceTruing`/`mvDeltaSinceTruing`, `spotCheckHistory`) and
   calls `deriveHistoricalInsight`. A natural home is the coach line
   (alongside `next-action.js`'s rung) or the rifle-record detail view.
7. **`residual-engine.js` is not yet added to the protected-engine hash
   lock** (`tests/test-protected-engine-hashes.js`) or given its own
   `docs/canon/interface-contracts/` entry, unlike the 8 Gate-0 engines.
   Validation Doctrine §8 says a tested engine like this one should
   eventually get "the same protected status" — appropriate once it's
   promoted out of shadow, not necessarily before, but worth an
   explicit decision rather than leaving it ambiguous.

None of these are silent gaps — each is a reasoned, disclosed stopping
point chosen to keep every *shipped* piece correct and tested rather
than rushing breadth.

---

## Part (b) — OWNER-ACTIONS

Everything below needs your hands — SQL to run, or a judgment call.
Suggested order:

**1. Review and run `PHASECD-migrations.sql`.** Additive-only,
re-runnable, never executed this session. Adds: `config_epochs`,
`recurring_targets`, `troubleshooting_checks`, `residual_shadow_log`
(4 new tables, RLS + 4 owner-only policies each, matching this
codebase's existing convention exactly); nullable `barrel_id` columns
on `zero_events`/`mv_measurements`/`truing_events`/`steel_strings`.
Nothing in this file drops, renames, or rewrites any existing data.
Until you run it, every new write path degrades gracefully (logged
warning, save proceeds without the new field) — the app does not break
either way, so there's no urgency beyond wanting the new features to
actually persist.

**2. Judgment call — offline queueing for the four new write methods
(Deferred Follow-up #1).** Worth doing, not urgent (today's behavior is
an honest error message, not silent data loss, for the one write that
matters most — `changeLot`). Say the word and it's a same-shaped change
to `sync-queue.js`'s `FN_TABLE`/`FLUSH_FACT_EVENT_MAP` as the existing
eight entries.

**3. Judgment call — which lane should feed the residual engine
(Deferred Follow-up #4)?** The simple lane's single shared velocity
can't exercise it meaningfully; the detailed lane (`steel-session.js`)
can. Wiring shadow logging into a screen that's otherwise being
actively rebuilt around it (or not) is a product-shape decision, not a
technical blocker — flagging for your call rather than guessing which
lane deserves the engineering time next.

**4. Judgment call — historical insights' first live surface (Deferred
Follow-up #6).** The engine is done and tested; it just doesn't have a
home yet. The coach line (next to `next-action.js`'s rung, using the
same "one thing at a time" real estate) is the natural first guess, but
it's your call whether that's the right moment for it to speak.

**5. Judgment call — protected-engine status for `residual-engine.js`
(Deferred Follow-up #7).** Whether to formalize it into the same
hash-lock/interface-contract discipline as the 8 Gate-0 engines now, or
wait until it's promoted out of shadow per the four-stage gate in
`E-SHADOW-SPEC.md` §10. Either is defensible; recorded so it's a
decision, not an oversight.

**6. No SQL needs re-running for anything from Phase B** — this
session made no changes to any previously-deployed Phase B table or
policy.

---

## STOP

Phase C (memory + minimal invalidation), Phase D (validation statuses +
coach brain), and Phase E's shadow stage (spec + synthetic gate +
shadow-only build, explicitly not wired to truing/solutions/PROVEN TO)
are built, tested, and verified against the QA gates named in this
session's instructions. Two real bugs were found and fixed by this
session's own test-writing before either ever shipped — the hold-exit
semantics (Phase D) and the outlier-masking/eligibility-value bugs
(Phase E) — both are now regression-tested. 1,302 checks green across
34 suites, protected-engine hashes byte-identical to Gate 0, canon
manifest green, `PHASECD-migrations.sql` written and additive-only,
never run. Seven disclosed follow-ups and a five-item OWNER-ACTIONS
list are recorded above rather than guessed past. Waiting on you before
Phase F.
