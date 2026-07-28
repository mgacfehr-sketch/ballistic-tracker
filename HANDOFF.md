# Handoff — Gate 0 + Phase A, owner-review queue in progress

**Branch:** `redesign`. **HEAD at time of writing:** `6aad4ed`.
**Purpose of this file:** a single current-state snapshot so this work
can be picked up — by anyone, in any session — without re-deriving
anything from `GATE0-PHASEA-REPORT.md`'s commit history. That report is
still the full record of what was built and why; this file is the
live status of what's left to decide.

---

## Where things stand

Gate 0 and Phase A (Amendment 1 Part B) are complete: canon manifest
with drift detection, byte-identity hash lock on all 8 protected
engines, golden fixture suites + interface contracts for every engine,
a migration inventory, and the Phase A durability floor (persistent
storage, quota/auth-error classification, account-binding quarantine,
logout warning, failure-injection suite). Full detail in
`GATE0-PHASEA-REPORT.md`.

That report shipped with a 14-item owner-review queue. Since then,
working through it live with the owner (running read-only queries
against production and reporting results back) has closed 2 items,
substantially progressed a 3rd, and surfaced one new finding along the
way. **Phase B has not started** and should not start until the owner
says so — nothing below changes that.

### Queue status at a glance

| # | Item | Status |
|---|---|---|
| 1 | Admin-RPC hardening live? | **CLOSED** — confirmed live on production |
| 2 | Seven base tables predate schema-as-code | **IN PROGRESS** — one concrete finding closed (SIMPLE-migrations.sql gap), full 7-table dump still needed |
| 3 | `zero_records` vs `zero_events` | **CLOSED** — dead code, empty table, no backfill work needed |
| 4 | `dope_entries` referenced but not live | open — not yet discussed this session |
| 5 | `ballistic-solver.js` global coupling | open |
| 6 | `simple-true.js` `payoff.moved` rounding | open |
| 7 | `garmin-import.js` no cross-import dedup | open |
| 8 | `barrels` dual round-count columns | open |
| 9 | `ai_usage_logs` dual cost columns | open |
| 10 | `session-images` bucket, no content-hash | open |
| 11 | `isAuthError()` matching unverified | open |
| 12 | Quarantined ops, no resolution UI | open |
| 13 | Failure-injection suite is right-sized, not full chaos | open |
| 14 | Housekeeping: Product Definition filename | open |

*(New, lightweight, not a queue item: `js/ai-assistant.js`'s
`getZeroRecordsByRifle` call feeds dormant "Ask yorT" context from the
now-confirmed-empty `zero_records` table — flagged for whoever builds
Ask yorT, not tracked as a decision here.)*

---

## Closed this session

**#1 — Admin-RPC hardening.** Owner ran a read-only
`pg_get_functiondef()` catalog check against production:
`is_crowd_admin` exists, all four `admin_*` RPCs call it.
CROWD-DATA-migrations.sql Migration 5 is applied. CLAUDE.md's Known
Issue is historical, not current.

**#3 — `zero_records` vs `zero_events`.** Source audit: `addZeroRecord`
has zero callers anywhere in the codebase — every live zero-confirmation
flow calls `addZeroEvent`. Live query: `zero_records` has 0 rows,
always has; `zero_events` has 2 rows, no possible overlap. Dead code
*and* an empty table — not a live duplicate-truth risk, and Phase B's
backfill needs no handling for it at all.

## In progress

**#2 — Seven base tables predate schema-as-code.** One concrete
instance is fully resolved and folded into the inventory: a targeted
check found SIMPLE-migrations.sql's five `sessions` snapshot columns
(`rifle_name`, `rifle_caliber`, `load_name`, `load_bullet_name`,
`load_bullet_weight`) had never actually landed on production —
despite existing in the repo and being believed applied — most likely
originally run against the wrong Supabase project. Applied to
production this session; verified present with correct types.
**Phase B backfill rule this establishes:** `sessions` rows written
during that gap have `NULL` in those five fields for a known, benign
reason (`js/db.js`'s documented fallback stripped them pre-insert
until the columns existed). Per Amendment 1 Part B's "never invented
facts" principle, the backfill must tag these `legacy/unknown`
provenance and leave them `NULL` — never reconstruct them from
current `rifle_id`/`load_id` lookups, which would fabricate a
historical fact the session never captured.

**Still needed to fully close #2:** a complete `information_schema.columns`
dump across all seven tables (`rifles`, `barrels`, `loads`, `sessions`,
`zero_records`, `scope_adjustments`, `cleaning_logs`). The query was
provided twice; results didn't come through either time (see
`docs/canon/MIGRATION-INVENTORY.md`'s Method note for the exact
history). **Recommendation: re-run and paste when convenient — same
query, already proven to fit in 7 rows via `string_agg`, no dropdown
truncation risk.** Not urgent; only actually blocks Phase B's backfill
script design, which hasn't started.

---

## Remaining items — recommendations, ready for one-at-a-time ruling

Presented in the order they'd normally come up; happy to take them in
any order or in bulk if preferred instead of one-at-a-time.

**#4 — `dope_entries` referenced in `js/db.js` but doesn't exist live.**
Dormant (feature is beta-gated off) but a live trap: re-enabling
`dopeLog` without a migration reproduces a crash already worked around
once. *Recommendation:* remove the three dead call sites now (cheap,
eliminates the trap permanently) rather than restoring the migration
for a feature that's out of v1 scope anyway (Product Definition §10
excludes it). Restoring the table only makes sense if `dopeLog` is
coming back soon — worth a one-line confirmation either way.

**#5 — `ballistic-solver.js` / `target-geometry.js` global-scope
coupling.** Both depend on plain `<script>` load order rather than
explicit imports; works today, would break under a bundler or reorder.
*Recommendation:* no action now — this is a Build Principle 2
(Capacitor) concern, and the codebase already does this consistently
enough that it reads as a deliberate convention, not an accident.
Revisit specifically when Capacitor/bundler work actually starts, not
before.

**#6 — `simple-true.js`'s `payoff.moved` can read `false` despite a
kept correction**, in coarse display units. *Recommendation:* fix the
comparison to happen in MOA (before unit conversion) rather than in
the caller's display unit — preserves the existing 1-decimal display
rounding for what's *shown*, just stops that rounding from deciding
what counts as "moved." Small, contained change; would need a protected-engine
hash-lock + golden-fixture update in the same commit.

**#7 — `garmin-import.js` has no cross-import deduplication.**
*Recommendation:* audit the caller/db-layer (likely `js/chrono.js` and
`db.js`'s `addVelocityString`) before Phase B, specifically for
Constitution §33.4 duplicate-import protection — confirm it's owned
somewhere, or write it. Don't guess; this needs the same kind of
source audit #3 just got.

**#8 — `barrels.round_count`/`total_rounds` dual columns.**
*Recommendation:* leave alone for Gate 0/Phase A purposes; this is
existing, working, synced-by-app-code behavior, not a durability or
provenance risk. Worth cleaning up (drop one column, migrate) as
ordinary tech debt whenever `barrels` is next touched substantively —
not urgent enough to justify a standalone migration.

**#9 — `ai_usage_logs.estimated_cost`/`.cost` dual columns.** Same
shape as #8. *Recommendation:* same — low urgency, already flagged in
the migration file's own comment as a known admin-dashboard cleanup
task. Bundle with #8 if either gets scheduled.

**#10 — `session-images` bucket has no content-hash/upload-state
tracking.** This is a real Constitution §56 gap (raw evidence
protection), distinct from the sync queue's already-sound image
handling (Phase A). *Recommendation:* scope this explicitly into
Phase B or C rather than deciding it ad hoc — it's exactly the kind of
"attachment vault" work Amendment 1's Phase B description already
gestures at ("vault-first import: original file + hash preserved
before association").

**#11 — `isAuthError()` matching unverified against real Supabase
error shapes.** *Recommendation:* low-cost, high-value — next time
anyone is in the Supabase logs for another reason, grep for actual
401/expired-session error bodies and compare against the current
regex. Doesn't need a dedicated session.

**#12 — Quarantined ops have no dedicated resolution UI.**
*Recommendation:* defer until it's a real problem — this requires a
shared device with two accounts actually being used, which may never
happen for this user base. The current behavior (wait silently,
surface via the status banner) is honest and non-destructive even if
unpolished. Don't build UI for a scenario that hasn't occurred.

**#13 — Failure-injection suite is right-sized, not full browser
chaos.** *Recommendation:* revisit specifically "before public beta,"
as Amendment 1 already schedules disaster-recovery drills for that
checkpoint — not a Gate 0/Phase A gap, just a marker for later.

**#14 — Housekeeping: `PROVEN-Product-Definition (1).md` filename.**
*Recommendation:* rename it whenever convenient; trivial, no urgency.
I can do it in a two-line commit (rename + manifest hash update)
whenever you say go.

---

## How to resume

- Full build record: `GATE0-PHASEA-REPORT.md`
- Schema/provenance findings: `docs/canon/MIGRATION-INVENTORY.md`
- Canon governance + hash locks: `docs/canon/MANIFEST.md`
- Per-engine contracts: `docs/canon/interface-contracts/`
- If resuming in a fresh session: check `git log` on `redesign` past
  `6aad4ed` first — this file may already be stale if work continued
  after it was written.
