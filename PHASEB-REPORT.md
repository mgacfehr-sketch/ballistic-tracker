# Phase B — Build Report

**Scope:** (1) close every remaining Gate 0/Phase A owner-review queue
item that doesn't require the owner's hands, per standing rulings;
(2) Amendment 1 Part B, Phase B — the fact spine, right-sized;
(3) all SQL written to one additive migration file, never run.

**Branch:** `redesign`. Built across multiple commits, each verified
green (full test suite, canon manifest, protected-engine hash lock)
before the next began. No SQL was run by the assistant at any point —
`PHASEB-migrations.sql` was written for owner review and owner-run
execution only. **Status as of 2026-07-28: the owner has reviewed,
run, and verified P0–P4** (storage policies, `import-vault` bucket,
`delete_my_account` patch, all three new tables, the backfill) in the
Supabase SQL Editor — deployed, with the P5 parity check itself
confirmed exact-match on all 8 backfilled tables against real query
output (see OWNER-ACTIONS item 5). P6 (rollback, reference-only)
remains unexecuted by design — nothing needed rolling back.

---

## Part (a) — Everything completed

### Owner-review queue — closed this session

**#14 — Housekeeping: `PROVEN-Product-Definition (1).md` filename.**
`git mv` to `PROVEN-Product-Definition.md` (content/hash unchanged);
`docs/canon/MANIFEST.md` updated in the same commit. Canon manifest
test green.

**#4 — `dope_entries` dead call sites.** Confirmed `DopeLogManager` is
never instantiated anywhere (its one UI entry point was already
retired — `js/rifle-cards.js`'s v2.4 comment) and `dopeLog` is hard
beta-gated off. Removed `js/db.js`'s `addDopeEntry`/`getDopeEntries`/
`deleteDopeEntry` (all three referenced a table that doesn't exist
live) plus the now-stale cascade-delete comment and header-doc
mention. `js/dope-log.js` itself stays out of scope — already
unreachable, and `dopeLog` is out of v1 scope per Product Definition
§10. The live trap (re-enabling the beta flag would reproduce a 42P01
crash) is closed; flipping the flag now would instead throw a loud,
immediate "not a function" at the exact call site, which is a strict
improvement, not a new problem.

**#7 — `garmin-import.js` cross-import dedup.** Audited the caller
side as recommended (this wasn't done in Gate 0). **Finding: already
fully handled**, in `js/chrono.js`, two layers: (1) a velocity-sequence
fingerprint checked against every saved string for the user across
*all* rifles (two real chrono strings never share identical shot-for-
shot velocities) — warns and defaults excluded, but stays overridable
for the legitimate "moved to the wrong rifle" case; (2) a same-rifle
(or unassigned-pool) `sheet_name + epoch-date` exact-match backstop —
hard duplicate, unticked and disabled. Constitution §33.4 is satisfied.
No code change needed. Closed.

**#6 — `simple-true.js`'s `payoff.moved` rounding.** Protected-engine
fix. `payoff.moved` previously compared `oldDial`/`newDial` *after*
converting to the caller's display unit and rounding to 1 decimal, so
a real, doctrine-correct correction could read `moved: false` if its
effect rounded away in a coarse unit (verified case: BC 0.315→0.304 at
600yd showed `moved: false` in MIL). Now compares the pre-conversion,
pre-rounding MOA values — the 1-decimal display numbers shown to the
shooter are unchanged, only the boolean deciding which payoff sentence
to show moved onto MOA. Golden fixture case 6 updated to the correct
`moved: true`; interface contract rewritten from "flagged, not fixed"
to "fixed 2026-07-28"; protected-engine hash lock updated in the same
commit.

### Owner-review queue — closed per standing ruling (accept recommendation, no action)

- **#5** (`ballistic-solver.js`/`target-geometry.js` global-scope
  coupling) — no action; revisit specifically when Capacitor/bundler
  work starts, not before. Existing pattern is consistent, deliberate.
- **#8** (`barrels` dual round-count columns) — no action; ordinary
  tech debt, clean up whenever `barrels` is next touched substantively.
- **#9** (`ai_usage_logs` dual cost columns) — no action; same shape as
  #8, already flagged in the migration file's own comment.
- **#11** (`isAuthError()` matching unverified) — no action; revisit
  opportunistically next time anyone is in the Supabase logs for
  another reason.
- **#12** (quarantined ops, no resolution UI) — no action; the current
  silent-wait + status-banner behavior is honest and non-destructive;
  don't build UI for a shared-device scenario that hasn't occurred.
- **#13** (failure-injection suite right-sized, not full chaos) — no
  action; Amendment 1 already schedules this specifically for "before
  public beta."

### Owner-review queue — folded into Phase B design

**#10** (`session-images` bucket had no content-hash/upload-state
tracking) is now solved, not just scoped: `attachment_vault` (schema
in `PHASEB-migrations.sql` P2) plus `js/db.js`'s
`_registerAttachmentHash`, wired into `saveSessionImage` and
`saveSteelPhoto`. See below.

### Owner-review queue — closed after this report was first written

**#2 (seven base tables predate schema-as-code) — CLOSED 2026-07-28,
same day, after the owner ran OWNER-ACTION 1's query.** The full
`information_schema.columns` dump across all seven tables came back;
`docs/canon/MIGRATION-INVENTORY.md` §1 is updated to record confirmed
live schema instead of inference, with its canon-manifest hash updated
in the same commit. Two concrete findings from it:
1. The `trued_bc`/`trued_mv`/`trued_event_id`/`trued_at` placement
   question (open since Gate 0) is resolved: those four columns live
   on `loads` only, never existed on `rifles`. REORG R5's comment was
   right; the inventory's caveat was wrong and is now removed.
2. `sessions` carries three previously-undocumented, entirely unused
   columns — `annotated_image`, `overlay_position`, `notes` (confirmed
   via grep: zero read/write sites anywhere in `js/*.js`). No action
   needed; recorded for Phase C's eventual `sessions` decomposition so
   they aren't mistaken for a hidden feature.

The dump also confirmed `cleaning_logs` and `scope_adjustments` both
have a `created_at` column that `PHASEB-migrations.sql`'s P4 backfill
hadn't used (it predated confirmation they existed) — updated in a
follow-up commit so both tables' `event_time` fallback and payload
shape now match the other six backfilled tables exactly, closing the
minor inconsistency with the "backfilled and freshly-written rows are
byte-for-byte the same shape" claim made below.

---

### Phase B — the fact spine (Amendment 1 Part B)

All SQL lives in **`PHASEB-migrations.sql`**, additive-only,
re-runnable, **never executed this session**. Naming note: this is
Amendment 1 **Phase B**, unrelated to the already-shipped
`STAGE-B-migrations.sql` (a different, earlier lettering scheme —
Zero Guardian / auto-conditions / onboarding, "nothing to run").

**P1 — `fact_events`: the minimal event envelope.** All Amendment 1
mandatory fields (id, type, schema version, account, rifle, event
time, provenance, source ref, eligibility, supersedes, sync state,
typed payload). `event_type` and `provenance` are free text, not
CHECK-enum-constrained, so the taxonomy can grow without a schema
migration each time (Amendment 1 A2). `(source_table, source_row_id)`
is a unique constraint — the idempotency key shared by dual-write and
the backfill script, so retries/re-flushes/re-runs never double-write.
RLS enabled, four owner-only policies matching this codebase's
existing convention exactly.

**P2 — `attachment_vault`: vault-first import.** Original import
evidence (`kind IN ('garmin_csv','garmin_xlsx')`) uploads to a
**dedicated `import-vault` bucket** (P0b, owner ruling on item 6 —
"original evidence has a different lifecycle and policy surface than
display images"), separate from the display-image hash-tracking rows
(`kind IN ('session_image','steel_image')`), which stay pointed at the
*existing* `session-images` bucket at each image's own conventional
path — no file movement, hash-tracking only. One table, two storage
locations, `storage_bucket` set explicitly by each caller, no column
default. `(user_id, content_hash)` unique — re-uploading identical
bytes is a safe no-op. **Wired into working code, not just schema:**
- `js/utils.js`: `sha256Hex(blob)` via Web Crypto (`crypto.subtle`) —
  works in both the browser and a Capacitor WebView, no new dependency.
- `js/db.js`: `_registerAttachmentHash` (hashes an already-uploaded
  file at its existing conventional path — no duplicate storage write)
  wired into `saveSessionImage` and `saveSteelPhoto`, best-effort,
  never blocks the save (CLAUDE.md rule 8). `vaultImportFile` (hashes +
  uploads an original import file to `{userId}/{hash}` in `import-vault`
  *before* parsing) and `resolveVaultedImport` (marks it resolved once
  parsed rows are saved).
- `js/chrono.js`: `vaultImportFile` fires in `_handleFile`, in
  parallel with parsing (never gates it); `resolveVaultedImport` fires
  in `_importSelected`'s success path. One imported file can become
  several `velocity_strings` rows, so it resolves as a group
  (`associatedRowId: null`) rather than pointing at a single row —
  documented in the code as a deliberate simplification.

**P3 — `workhorse_packages`: schema only.** Per Amendment 1's own
instruction ("SCHEMA defined now (build later)"). `claim_secret_hash`
column present but the hashing/claim RPC is Phase F work — nothing
writes to this table yet. RLS enabled, **no policies**, matching this
codebase's existing convention for privileged tables
(`admin_users`/`crowd_export_config`) — invisible to every client role
until Phase F builds the claim flow.

**Dual-write, wired into `js/db.js` (not just designed).** Eight
already-provenance-aware tables — the exact seam
`docs/canon/MIGRATION-INVENTORY.md` §0 identified as "provenance-aware
by design" (`zero_events`, `mv_measurements`, `tracking_verifications`,
`truing_events`, `steel_strings`, `steel_shots`) plus the two Amendment
1 A2 lifecycle-fact tables (`cleaning_logs`, `scope_adjustments`) — now
also write a `fact_events` row alongside their legacy insert.
Best-effort and fire-and-forget: a `fact_events` failure is logged and
swallowed, never blocks or fails the primary save. Also wired into
`flushQueuedRow` (the offline-queue flush path), which upserts
directly and bypasses the `addX` methods entirely — without this, an
offline-queued-then-flushed fact would silently never reach
`fact_events`. `addSteelShot` (online and flush paths) does a
best-effort rifle lookup through the parent `steel_strings` row, since
`steel_shots` itself carries no `rifle_id` column.

**Explicit Phase B scope boundary: `sessions` is NOT dual-written.**
`sessions` is the aggregate root — session-shaped, not fact-shaped
(the exact gap `PROVEN-Constitutional-Review.md` and the migration
inventory both name). Phase B generalizes the seam that *already
exists* in the eight tables above; it does not yet decompose the
aggregate root. This means the "distance impact" leg of Amendment 1
A2's three core fact kinds is covered for steel/field observations
(`steel_strings`/`steel_shots`, already dual-written) but **not** for
ordinary paper-target group sessions — those stay exactly as they are
today. This is a deliberate, documented boundary, not an oversight;
decomposing `sessions` into the fact spine is Phase C+ work. The
session-snapshot-fields gap-period NULL rule (owner-review #2's
finding, "never invented facts") is preserved verbatim in
`PHASEB-migrations.sql`'s P4 comments for whichever future phase picks
this up.

**Backfill (P4).** Idempotent `INSERT ... SELECT ... ON CONFLICT DO
NOTHING` per source table, using only columns `js/db.js` itself
writes today (proof they exist live) — the seven-table schema gap
(#2) means this can't yet claim to capture every column those tables
might carry. `zero_records` and `dope_entries` explicitly skipped with
reasons (confirmed dead/empty; confirmed not live, respectively).
Provenance per table: real `source` column value where one exists
(`zero_events`, `mv_measurements`); fixed honest values elsewhere
(`measured` for tracking verifications — always a physical test;
`derived` for truing events — always a computed correction; `manual`
for the four remaining tables — always shooter/UI-logged, never any
other path). `payload` uses the same camelCase shape as the online
dual-write, so a backfilled row and a freshly-written row are
byte-for-byte the same shape.

**Parity check (P5) + rollback (P6).** Count-parity query per table,
an orphan check, and a content spot-check — all read-only, meant for a
database clone. Rollback: P1–P3 are purely additive new tables nothing
else depends on; full rollback is three `DROP TABLE IF EXISTS`
statements plus reverting the `js/db.js` dual-write code. Partial
rollback (undo one bad backfill run) is a scoped `DELETE ... WHERE
source_table = '<table>'` followed by re-running that block.

### RLS audit on everything touched

**New tables (`fact_events`, `attachment_vault`):** RLS enabled, four
owner-only policies each, written in `PHASEB-migrations.sql` — not yet
live (nothing in this repo executes SQL). **`workhorse_packages`:**
RLS enabled, deliberately zero policies.

**Existing tables Phase B's dual-write touches** (`zero_events`,
`mv_measurements`, `tracking_verifications`, `truing_events`,
`steel_strings`, `steel_shots`, `cleaning_logs`, `scope_adjustments`):
**CONFIRMED LIVE 2026-07-28** (OWNER-ACTIONS item 3) — `pg_policies`
shows exactly 4 policies (SELECT/INSERT/UPDATE/DELETE) on all 8
tables, 32 rows total, no gaps. **Correction to this report's first
draft:** only 6 of the 8 tables' policies (`zero_events`,
`mv_measurements`, `tracking_verifications`, `truing_events`,
`steel_strings`, `steel_shots`) are actually defined anywhere in this
repo's SQL, in `REORG-migrations.sql`'s R4 section — confirmed by
re-reading it. `cleaning_logs` and `scope_adjustments` have **no**
`CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` in any of the twelve `*.sql`
files (checked by grep); they're live and correct, but entirely
undocumented in-repo, the same "predates schema-as-code" pattern as
their columns (owner-review #2). Consistent with that: their live
policy names use "Users can **view** own X" wording, while the other
six use "Users can **read** own X" — a cosmetic difference in naming
convention, not a coverage or behavior gap, but further evidence these
two tables' RLS was set up separately, outside this repo's migration
history. No action needed — this closes clean, just corrects an
inference this report made before the query came back.

**`session-images` Storage bucket — CONFIRMED 2026-07-28, one real gap
found.** No `CREATE POLICY`/bucket-setup SQL exists anywhere in the
twelve pre-existing `*.sql` files (checked by grep) — this bucket's
policies were configured entirely through the Supabase dashboard,
untracked in code, same pattern as `cleaning_logs`/`scope_adjustments`
above. The owner ran the `pg_policies` query (OWNER-ACTIONS item 4):
3 policies exist — INSERT ("Users can upload own images"), SELECT
("...view own images"), DELETE ("...delete own images") — all
correctly scoped by folder prefix
(`bucket_id = 'session-images' AND auth.uid()::text =
(storage.foldername(name))[1]`). **No cross-user access risk** — the
scoping itself is sound.

**But there is no UPDATE policy.** Supabase Storage's
`upload(..., {upsert: true})` needs UPDATE permission when the target
path already exists (INSERT alone only covers a genuinely new path);
without it, re-uploading to an existing path fails under RLS. Two
consequences, found by tracing every caller:

1. **This bit Phase B's own `vaultImportFile`** (this session's new
   code): re-importing an identical file always targets the same
   hash-keyed path, so the second upload would fail — silently, since
   `js/chrono.js`'s `_pendingVault` catches vaulting errors and
   resolves `null`, quietly contradicting the documented "safe no-op"
   behavior. **Fixed in the same commit as the SQL below:**
   `vaultImportFile` now checks `attachment_vault` for the content hash
   BEFORE ever calling Storage, so the common case no longer depends on
   this policy at all.
2. **Pre-existing, NOT fixed by the code change above:**
   `js/sync-queue.js`'s offline image-retry path. `writeImage()` tries
   `saveSessionImage`/`saveSteelPhoto` immediately; if the upload
   actually succeeds server-side but the client reads the response as
   a network failure (a real race on a flaky range connection, not
   hypothetical), it queues the image and retries later via `flush()`'s
   `_pendingImage` handler — which re-calls the same upload against the
   now-already-existing path. That retry would fail the same way, and
   per `js/sync-queue.js`'s own comment ("image failure never blocks
   the flush"), the failure is silently swallowed — a photo could be
   stranded forever with no user-visible error. **Left open, not fixed
   this session** — it's a real reliability gap but a materially
   separate, non-trivial change to the sync-queue retry logic, outside
   what this owner-action turn asked for. **RULED 2026-07-28: fix it
   too — done in the same session, see OWNER-ACTIONS item 4.**

`PHASEB-migrations.sql` P0 adds the missing UPDATE policy — closes the
gap at the policy level for BOTH cases above (the vault fix no longer
needs it, but adding it is still correct and closes the sync-queue.js
risk too, at the policy level; the code-level hardening below closes
it a second, independent way, per the owner's ruling that canon's
never-lose promise shouldn't rest on a single layer of defense).

### Test suite / hash locks / cache

All 31 test files green after every commit this session. Canon
manifest test green (16 checks). Protected-engine hash lock green (10
checks) — `simple-true.js`'s hash updated once, deliberately, in the
same commit as its documented fix; the other 7 engines are
byte-identical to Gate 0. `sw.js` `CACHE_VERSION` bumped 145 → 146
(`js/db.js`, `js/utils.js`, `js/chrono.js`, `js/simple-true.js` all
changed and are app-shell files per CLAUDE.md rule 9).

---

## Part (b) — OWNER-ACTIONS

Everything below needs your hands — SQL to run, a judgment call, or
both. Suggested order:

**1. ~~Re-run the seven-table `information_schema` dump~~ — DONE,
2026-07-28.** You ran this the same day; results incorporated into
`docs/canon/MIGRATION-INVENTORY.md` §1 and `PHASEB-migrations.sql`'s
P4 backfill (owner-review #2 closed — see above). Kept here, struck
through, so this list's numbering stays stable against anything
already referencing it.

**2. ~~The zero_records timing recheck~~ — DONE, 2026-07-28. Clean.**
`zero_records` was still 0 immediately before P4 ran — no drift since
owner-review #3's original check, P4's decision to write no backfill
code for it stands confirmed, not just assumed.

**3. ~~Confirm the existing event tables' RLS is actually live~~ —
DONE, 2026-07-28.** All 8 tables, 4 policies each (SELECT/INSERT/
UPDATE/DELETE), no gaps. Also surfaced that `cleaning_logs`/
`scope_adjustments`'s policies aren't defined anywhere in this repo's
SQL (unlike the other six) — live and correct, just undocumented
in-repo, same as their columns. See RLS audit section above. Query
kept here for reference:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('zero_events','mv_measurements','tracking_verifications',
                     'truing_events','steel_strings','steel_shots',
                     'cleaning_logs','scope_adjustments')
order by tablename, cmd;
```

Expect 4 rows per table (SELECT/INSERT/UPDATE/DELETE). Any table with
fewer is a live RLS gap, independent of anything Phase B added.

**4. ~~Check the `session-images` Storage bucket's actual policies~~ —
DONE, 2026-07-28. Found one real gap, one thing to decide.** The 3
existing policies (INSERT/SELECT/DELETE) are correctly scoped by
folder prefix — no cross-user access risk. But there's **no UPDATE
policy**, which breaks re-uploading to an existing storage path.
`PHASEB-migrations.sql`'s new P0 block adds it. Two things came out of
tracing who's affected:
   - Phase B's own `vaultImportFile` hit this (re-importing an
     identical file) — already fixed in code this session (checks
     `attachment_vault` before touching Storage, no longer depends on
     this policy).
   - `js/sync-queue.js`'s offline image-retry path has the same
     exposure — **RULED 2026-07-28: harden it, don't just rely on the
     policy fix.** A permission error on a retry-of-an-existing-path
     must resolve as "verify: does the object exist? if yes, mark
     succeeded" — canon (A16, never voluntarily discard acknowledged
     data) beats the old code comment ("image failure never blocks the
     flush") that let this go silent. **DONE, same session:**
     `js/db.js` gained `_storageObjectExists`/`sessionImageExists`/
     `steelPhotoExists` (read-only, `list()`+search — needs only the
     SELECT policy, so this works even before P0 is run). `flush()`'s
     image-retry catch now verifies before counting a failure: exists
     → delete the queued copy (resolved as success, false failure
     caught); genuinely missing → increment `attempts`, park as
     `status: 'error'` after `MAX_ATTEMPTS` (mirroring `ops`' own
     rule) — never silently retried forever with no visible error.
     `summary()` now also reads the `images` store so a stuck image is
     no longer invisible to the status banner/logout warning either.
     8 new checks in `tests/test-failure-injection.js` Scenario 6b
     cover the verify-exists/verify-missing/verify-itself-never-throws
     branches and the `summary()` merge, as pure source-presence proofs
     (same technique the rest of that suite already uses) — matches
     Amendment 1 Part B's "right-sized failure-injection suite," now
     covering this race specifically as asked. All 34 checks green.

**5. ~~Review and run `PHASEB-migrations.sql`~~ — P0–P4 DONE, deployed,
parity CONFIRMED, 2026-07-28.** P0/P0b/P0c (storage policies + bucket +
delete_my_account patch) and P1–P3 (fact_events, attachment_vault,
workhorse_packages) are live. P4 backfill ran. The P5 count-parity
query's actual output was received and checked line by line — exact
match on all 8 tables:

| table | legacy_count | fact_events_count |
|---|---|---|
| zero_events | 2 | 2 |
| mv_measurements | 3 | 3 |
| tracking_verifications | 0 | 0 |
| truing_events | 2 | 2 |
| steel_strings | 6 | 6 |
| steel_shots | 23 | 23 |
| cleaning_logs | 3 | 3 |
| scope_adjustments | 0 | 0 |

Every backfilled table's `fact_events` mirror count equals its legacy
table's count exactly — no gaps, no double-writes, no orphans on
either side of the 45-row total. P5's remaining sub-checks (5b orphan
check, 5c content spot-check) and P6 (rollback) remain reference-only,
not run — not needed given 5a's clean result. **The fact spine's
backfill is complete and verified**, not just deployed.

**6. ~~Judgment call — dedicated bucket for `attachment_vault` imports?~~
RULED 2026-07-28: yes, dedicated bucket.** "Original evidence has a
different lifecycle and policy surface than display images." **DONE:**
`PHASEB-migrations.sql` P0b creates a new `import-vault` bucket with
all 4 policies (including UPDATE from the start, learning from finding
#4) — `js/db.js`'s `vaultImportFile` now uploads there instead of
`session-images`. `_registerAttachmentHash` (session/steel image hash
tracking) is unchanged; those files stay exactly where they are. See
the P0b comment block for full reasoning.

**7. ~~Judgment call — `dope_entries`: restore or leave removed?~~
RULED 2026-07-28: leave it removed.** "Dope derives from the fact
spine now." No further action — owner-review #4 stays closed exactly
as this session left it (three dead call sites removed from
`js/db.js`, `js/dope-log.js` untouched and still unreachable).

**8. ~~Required follow-up for account deletion, surfaced by ruling 6~~
— DONE, 2026-07-28.** Owner ran `pg_get_functiondef('public.delete_my_account'::regproc)`:
the live function is confirmed to be exactly `SIMPLIFY-migrations.sql`'s
version (the `dope_entries`-free one) — `FOUNDATION-`/`MORNING-migrations.sql`'s
earlier versions are **not** live, resolving the "which one actually
landed" question rather than guessing. `PHASEB-migrations.sql`'s new
**P0c** reproduces that confirmed-live body verbatim with exactly one
addition: a second `DELETE FROM storage.objects` line cleaning up
`bucket_id = 'import-vault'`, same shape as the existing
`session-images` line. Account deletion now reaches both buckets.

**8a. FK-cascade confirmation (owner-run, read-only, 2026-07-28) —
CONFIRMED.** `SIMPLIFY-migrations.sql`'s own comment claims the six
v2.3 event tables "cascade via their `auth.users` FKs when the user
row deletes, so no new lines are needed" in `delete_my_account` — a
claim this session had no way to check without database access, and
`delete_my_account` depends on it being true (it never `DELETE`s from
these six explicitly). A live `information_schema`/`pg_constraint`
check confirms `delete_rule = 'CASCADE'` on `user_id` for all six:
`zero_events`, `mv_measurements`, `tracking_verifications`,
`truing_events`, `steel_strings`, `steel_shots`. The comment's claim
was correct — account deletion fully reaches these tables even though
`delete_my_account`'s body never mentions them by name. Not something
this session altered; recorded here because it was asserted, never
previously verified, and now is.

---

## STOP

Every item from the Gate 0/Phase A owner-review queue that could be
closed without your hands has been closed. Phase B's fact spine
(envelope, dual-write, backfill script, vault-first import, Workhorse
schema, RLS audit) is built and wired into working code where the
Amendment calls for working code, schema-only where it explicitly
calls for schema-only. **Update, 2026-07-28: `PHASEB-migrations.sql`
P0–P4 have been reviewed, run, and verified by the owner** (storage
policies, `import-vault` bucket, `delete_my_account` patch, all three
new tables, the backfill, and — as of this update — the P5 parity
check itself, confirmed exact-match on all 8 backfilled tables with
the real query output in hand, not just reported). P6 (rollback,
reference-only) remains unexecuted by design, as intended — nothing to
roll back. Full test suite, canon manifest, and protected-engine hash
lock all green throughout. Phase B is complete and verified. Waiting
on you before Phase C.
