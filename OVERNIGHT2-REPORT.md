# OVERNIGHT2-REPORT.md — Overnight run #2 build record

**Scope:** the seven-item list from the owner's instruction — E-shadow
adversarial hardening, the Test-K capture-validity/analytic-eligibility
sweep, export parity, the deletable-files cull, docs debt
(`DEVELOPER-MAP.md`/`CHANGELOG-FOR-TROY.md`), failure-injection round 2,
and `PHASEF-CLAIM-SPEC.md`. One continuous autonomous run, branch
`redesign`, one commit per item, pushed after every commit. Code/docs/
tests only — no owner input taken, no SQL executed, no UI feature work
(honored explicitly in item 6, where the correct fix for one finding
would have required new UI and was documented instead of built). All
seven items completed; none required stopping for the owner mid-run.

**Full test suite green throughout** — 42 suites, ~1,400+ checks (up
from Phase C/D/E's 1,302/34), protected-engine hashes byte-identical to
Gate 0 (none of the 8 protected files were touched this run), canon
manifest green (no canon document was edited). `sw.js` `CACHE_VERSION`
bumped 153 → 155 across two app-shell-touching commits (items 3 and 6).

---

## Part (a) — Everything completed, by item

### Item 1 — E-shadow adversarial hardening (`E-SHADOW-SPEC.md` v1.0.0 → v1.1.0)

Two of the five requested adversarial cases (clock skew between chrono
and impact logs, multi-shot/single-impact) turned out to be **real
gaps in the eligibility model**, not just missing test coverage — the
v1.0.0 shots schema had no fields to even express them. Per A11's own
discipline ("requires its own versioned specification BEFORE
implementation"), the spec was revised first: two new optional per-shot
fields (`impactGroupId`, `chronoTimestampMs`/`impactTimestampMs`) and
two new eligibility rules (shared-impact refusal, clock-skew refusal
beyond a 5-minute tolerance), documented in §5 alongside an explicit
non-rule for the case that turned out NOT to need one — a shot with a
missing chrono reading mid-string stays structurally eligible; §4's
existing honest fallback and §6's `sufficientSample` gate already
prevent it from being silently over-trusted, confirmed by test rather
than assumed. `js/residual-engine.js` implements both new checks; no
change to the estimator math in §3/§4.

`tests/test-residual-engine-adversarial.js` (54 checks) covers all five
requested cases: missing chrono mid-string, duplicate imports
(competing `mvSourceId`), re-dials within a string, clock skew, and
shared impact. Every refusal case asserts BOTH `eligible: false` AND
that `computeResidualEngine` leaks no aggregate
(`explainedMOA`/`unresolvedResidualMOA`/`unresolvedResidualUncertaintyMOA`
all `null`) — proving the engine refuses rather than merely warns, per
the instruction's own bar.

Still shadow-only, still not wired to any capture screen or the
protected router — this item touched association eligibility only.

### Item 2 — Test-K sweep (capture-validity vs. analytic-eligibility)

Pure test coverage, no source changes. `tests/test-K-capture-vs-eligibility.js`
(21 checks) proves Amendment 1 A2 / Constitution Anti-Pattern #94
already hold across all three fact cards (`rifle-add.js`'s zero/steel/
chrono screens) and detailed truing (`rifle-payoff.js` — confirmed by
its own comment, "this IS detailed truing now, no separate door"):
every capture screen's save fires unconditionally before any analytic-
eligibility branch; a save failure re-enables the button and keeps the
data on screen rather than discarding it; the payoff validation gate
runs strictly after the string/shot are already saved, fails open on
its own read errors, and both its block paths explicitly tell the
shooter the observation is still logged; the two block reasons (hold
vs. alarm) are distinct named strings, and an alarm classification is
itself persisted (`addTroubleshootingCheck`), not just rendered and
forgotten. Everything checked here was ALREADY correct — this item
confirmed it with tests rather than finding new bugs.

### Item 3 — Export parity

`js/db.js` gained four account-wide getters (`getAllFactEvents`,
`getAllAttachmentVault`, `getAllTroubleshootingChecks`,
`getAllConfigEpochs`), same convention as the existing `getAllRifles`/
`getAllSessions`. `js/data-export.js`'s "Export everything" gained
three new types: `fact-events`, `attachment-vault` (metadata only — the
table never stores file bytes, so nothing needed stripping), and
`validation-statuses` (one derived row per rifle, using the SAME
`deriveTroubleshootingHold` the live app already calls in
`rifle-payoff.js`/`rifle-app.js` — never a second, divergent
classification invented for export). `data-export.js` was widened to a
Node-testable export (`module.exports = DataExport`, mirroring
`suppressors.js`'s own precedent) so the round-trip test the item asked
for could actually run: `tests/test-export-parity.js` (19 checks)
proves the three new types are registered, degrade to `[]` on an
unmigrated database, and — the specific proof requested — that
export → CSV text → parse → reconciled row/column counts survive
exactly against the live db projection for all three new types.

### Item 4 — Deletable-files cull

Re-verified every file previously flagged dead across `V3-REPORT.md`,
`V4-REPORT.md`, and `REDESIGN-REPORT.md`, rather than trusting the old
claims — and one of them turned out to be stale.

**Confirmed dead, deleted:** `js/rifle-cards.js` (zero references
anywhere, not loaded by `index.html`, superseded by the v3/v4 Card
system — matches `V4-REPORT.md`'s finding, still true today) and
`css/main.css` (not linked in `index.html`, not in `sw.js`'s precache
list — matches `REDESIGN-REPORT.md`'s finding, still true today).
`tests/test-foundation.js`'s `RifleCards.orderCards` suite (the file's
only dependent) was removed in the same commit; its other suites
(ToolsCore/WizardCore/HomeCore/DopeCards) are untouched and still
green.

**Claim found stale, NOT deleted:** `V3-REPORT.md`/`GATE0-PHASEA-REPORT.md`
both claimed `home.js`, `log-shooting.js`, `mv-entry.js`, and
`rifle-simple.js` were "fully unreferenced... confirmed safe to
remove." A fresh grep shows this is no longer true — `home.js` defines
`Recents`, used live by seven other files; `home.js` calls
`MvEntry.open` and `SimpleRiflePage.show` directly; `log-shooting.js`
populates the live `ToolActions` registry other job UIs depend on. All
four are loaded by `index.html` and genuinely wired into the live UI
today. Left in place. Whatever made them dormant at V3-time no longer
holds — this is worth knowing precisely because the old report's claim
was specific and confident, and would have been actionable in a future
session without this recheck.

### Item 5 — Docs debt

`DEVELOPER-MAP.md`: every remaining `js/` file (69, after item 4's
cull), grouped by function, with its one-line role (sourced from each
file's own header comment), its protected status (the 8 hash-locked
engines vs. `residual-engine.js`'s shadow-stage status vs. plain
application code — cross-checked against the live
`tests/fixtures/protected-engine-hashes.json`), and which canon/
contract section it implements. Writing it surfaced one real
correction: `onboarding.js` is gated by `hasFeature()`
(`STAGE_A_FEATURES`, ships enabled unconditionally today), a completely
separate and always-on gate from `isBetaEnabled()`'s `BETA_FEATURES`
(hard off for everyone) — worth knowing before assuming "has a flag"
means "off."

`CHANGELOG-FOR-TROY.md`: plain-English summary of what the product
does today and what changed in the recent build stretch, written for a
gunsmith, no code terms beyond what's unavoidable — covers the memory/
compatibility layer, the troubleshooting hold, all-or-nothing
validation being gone, trip round-budgeting, the fuller data export,
the still-off experimental per-shot engine, and the dead-file cleanup.
Explicitly states the bottom line: nothing customer-visible changed
tonight except export contents and two removed dead files; everything
else is groundwork awaiting review before anything new turns on.

### Item 6 — Failure-injection round 2

Three named scenarios, each actually investigated (not just
documented) before deciding fix-vs-document:

1. **Storage quota exhaustion mid-photo — real bug found and fixed.**
   `session-flow.js`'s annotated-image write was already correctly
   isolated from the session-save promise chain. `steel-session.js`'s
   casual-lane photo write was NOT: `SyncQueue.writeImage()` was
   chained directly into the SAME promise chain as the primary
   `addSteelString` save, so ANY photo-write failure — quota exhaustion
   included — surfaced as `alert('Save failed...')` to the shooter even
   though the string had already saved successfully. Fixed to isolate
   the photo write with its own catch, mirroring `session-flow.js`'s
   already-correct pattern (CLAUDE.md rule 8 / A16).
2. **Service-worker update mid-capture — documented, not fixed.** A
   real, disclosed gap: `index.html` reloads unconditionally the
   instant `SW_UPDATED` arrives, with no in-progress-capture check. The
   three fact cards are recoverable via `fact-draft.js`'s autosave
   (confirmed by test — it registers exactly the `zero`/`steel`/
   `chrono` kinds); the legacy canvas capture flow
   (`session-flow.js`'s tap-to-place markers) is NOT — a forced reload
   mid-tap there would lose unsaved marker placements with no recovery
   path. **The correct fix (a deferred "update ready" banner instead of
   a forced reload) needs new UI, explicitly out of scope tonight** —
   see OWNER-ACTIONS below.
3. **IndexedDB upgrade interruption — real gap found and fixed.**
   Neither `sync-queue.js`'s `_open()` nor `offline-cache.js`'s
   `_openDB()` handled IndexedDB's `onblocked` event — if another open
   tab holds an older-version connection, an upgrade can block forever
   with no `onupgradeneeded`/`onsuccess`/`onerror` ever firing, silently
   hanging every write/flush/offline-read awaiting that promise with no
   observable error. Both now arm a bounded 4-second timeout on
   `onblocked` that rejects observably (`indexeddb_blocked`) if the
   block doesn't clear, guarded against double-settling if
   `onsuccess`/`onerror` fires late (the normal, common case — the
   blocking tab closes within the window).

`tests/test-failure-injection.js` grew from 31 to 44 checks (13 new),
mostly source-presence proofs matching the suite's own established
technique.

### Item 7 — `PHASEF-CLAIM-SPEC.md`

Design document only, per the instruction (no code, no SQL beyond
P3's already-deployed `workhorse_packages` schema). Grounded in two
things that already exist rather than invented from scratch: the P3
schema itself, and the already-shipped certificate transfer flow
(`js/transfer.js`/`api/transfer.js`'s mint/redeem — service-role-only
writes, atomic single-use enforcement via a conditional PATCH, JWT
caller auth) as the proven pattern to extend. Covers: terminology
(claim vs. the existing §2.11 transfer — clarified up front since they
share vocabulary but are different events), the state machine, mint,
claim (atomic single-winner enforcement, information-minimal failure
messages), what claiming does to the rest of the app (deliberately
nothing special), revoke (the one genuinely new capability, explicitly
flagged to NOT reuse the `admin_*` RPCs' known no-server-side-check
gap), secret-handling rules, 8 threat cases, and 5 open questions
flagged for the owner's decision rather than assumed answers.

---

## Part (b) — OWNER-ACTIONS

Everything below needs the owner's hands or judgment — nothing here
blocks the app; every item degrades safely without it.

**1. Judgment call — service-worker update mid-capture (item 6,
finding 2).** The real fix is a deferred "update ready, tap to
refresh" banner instead of the current unconditional
`window.location.reload()` on `SW_UPDATED` — standard PWA practice for
exactly this failure mode, and would close the gap for BOTH the
fact-card screens (already recoverable via autosave, but a forced
reload mid-typing is still a jarring interruption) and the legacy
canvas capture flow (not recoverable at all today). Not built tonight
because it requires new UI, which this run was explicitly scoped to
avoid. Flagging as a concrete next step whenever UI work is back in
scope.

**2. Judgment call — `PHASEF-CLAIM-SPEC.md`'s five open questions
(§8 of that document).** Needed before any Phase F implementation
begins: whether `claimed_by` should mean "first claimant" or "current
owner" (the document recommends "first claimant," with ownership
tracked normally via `rifles.user_id`); whether revoking a certificate
affects the shooter's own subsequently-logged data; whether claim
should require an explicit account-confirmation step given how
support-heavy an accidental claim is to unwind; where the claim
endpoint should live relative to `api/transfer.js`; and claim-endpoint
rate-limit parameters. None of these block anything today — Phase F
has no code yet, per the instruction.

**3. No SQL to run.** Item 3 added four new `db.js` read methods
against tables Phase B's migration already created and the owner
already deployed (`fact_events`, `attachment_vault`,
`troubleshooting_checks`, `config_epochs`) — no new migration this
session. Item 7 added zero SQL beyond what P3 already has. Items 1, 2,
5, and 6 (aside from item 6's two code fixes, both application-level,
no schema change) touched no database surface at all.

**4. `DEVELOPER-MAP.md` will decay if not kept current.** It's a
snapshot as of this commit — the header says as much, but worth
restating here: any future file add/remove/re-purpose should update it
in the same commit, the same discipline `docs/canon/MANIFEST.md`
already has for the canon documents themselves.

---

## STOP

All seven items from the overnight instruction are complete: E-shadow
adversarial hardening (spec v1.0.0 → v1.1.0, two real eligibility gaps
closed, 54 new tests), the Test-K capture-validity/analytic-eligibility
sweep (21 tests, confirming existing behavior already meets doctrine),
export parity (fact_events/attachment_vault/validation-statuses, 19
new tests including the requested round-trip proof), the
deletable-files cull (2 files confirmed dead and removed; one stale
claim from an old report found and corrected rather than acted on),
docs debt (`DEVELOPER-MAP.md` + `CHANGELOG-FOR-TROY.md`),
failure-injection round 2 (1 real bug fixed — quota mid-photo
false-failure in the steel casual lane; 1 real gap fixed — IndexedDB
upgrade blocking forever; 1 real gap documented, not fixed, because
the correct fix needs UI work out of scope tonight), and
`PHASEF-CLAIM-SPEC.md` (design-only, grounded in existing proven
patterns, 5 open questions flagged for review). Full suite green
throughout (42 suites, ~1,400+ checks), protected-engine hashes
untouched, canon manifest untouched, `sw.js` `CACHE_VERSION` bumped
twice for app-shell-touching commits. Two OWNER-ACTIONS items above are
judgment calls, not blockers. Nothing in this run required stopping
before completion.
