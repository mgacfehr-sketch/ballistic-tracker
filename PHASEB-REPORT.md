# Phase B — Build Report

**Scope:** (1) close every remaining Gate 0/Phase A owner-review queue
item that doesn't require the owner's hands, per standing rulings;
(2) Amendment 1 Part B, Phase B — the fact spine, right-sized;
(3) all SQL written to one additive migration file, never run.

**Branch:** `redesign`. 8 commits this session, each verified green
(full 31-file test suite, canon manifest, protected-engine hash lock)
before the next began. **No SQL was run** — `PHASEB-migrations.sql` is
written for the owner to review and run in the Supabase SQL Editor.

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

### Owner-review queue — still needs the owner's hands

**#2** (seven base tables predate schema-as-code — full
`information_schema` dump still not received) is unchanged from
`HANDOFF.md`'s state and could not be advanced further without live
database access. See OWNER-ACTIONS below — it's the same query
already provided twice, still needed, now joined by one more query
Phase B's backfill needs (a fresh `zero_records` timing recheck).

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

**P2 — `attachment_vault`: vault-first import.** Reuses the *existing*
`session-images` Storage bucket under a `vault/` prefix — matching
this codebase's own established convention (steel photos already
share that bucket under a `steel_` prefix) rather than standing up a
new bucket with its own policy surface to audit. `(user_id,
content_hash)` unique — re-uploading identical bytes is a safe no-op.
**Wired into working code, not just schema:**
- `js/utils.js`: `sha256Hex(blob)` via Web Crypto (`crypto.subtle`) —
  works in both the browser and a Capacitor WebView, no new dependency.
- `js/db.js`: `_registerAttachmentHash` (hashes an already-uploaded
  file at its existing conventional path — no duplicate storage write)
  wired into `saveSessionImage` and `saveSteelPhoto`, best-effort,
  never blocks the save (CLAUDE.md rule 8). `vaultImportFile` (hashes +
  uploads an original import file to `{userId}/vault/{hash}` *before*
  parsing) and `resolveVaultedImport` (marks it resolved once parsed
  rows are saved).
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
RLS + four owner-only policies exist **in `REORG-migrations.sql`**,
confirmed by reading the file. Whether that migration's RLS policies
match what's actually live cannot be independently confirmed without
database access — the exact same landing-gap risk that SIMPLE-
migrations.sql turned out to have for `sessions`' snapshot columns
(owner-review #2's concrete finding). **Owner action below** gives a
read-only query to confirm these are actually live before trusting
this audit.

**`session-images` Storage bucket:** no `CREATE POLICY` / bucket-setup
SQL exists anywhere in the twelve pre-existing `*.sql` files (checked
by grep across the whole repo) — this bucket's policies were
apparently configured entirely through the Supabase dashboard,
untracked in code. This is a genuine, standalone audit gap, distinct
from and not solved by Phase B's attachment-vault work (which adds
hash tracking, not bucket policy verification). **Owner action below**
gives a read-only query against `pg_policies` for `storage.objects`,
the only way to see what's actually enforced.

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

**1. Re-run the seven-table `information_schema` dump (owner-review
#2, still open from Gate 0).** Same query as before, unchanged, still
needed — Phase B's backfill (P4) currently trusts only the columns
`js/db.js` itself proves exist by writing them successfully; a real
dump might reveal more columns on `cleaning_logs`/`scope_adjustments`
in particular (no `source`/provenance column was assumed for either —
confirm that's actually true) worth adding to the payload before you
run the backfill.

```sql
select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name in ('rifles','barrels','loads','sessions','zero_records','scope_adjustments','cleaning_logs')
group by table_name
order by table_name;
```

**2. The zero_records timing recheck, right before you run the P4
backfill block (not before).** Owner-review #3 confirmed `zero_records`
had 0 rows on 2026-07-28, so P4 deliberately writes no backfill code
for it — but time will have passed by the time you actually run
`PHASEB-migrations.sql`, and it's a live table nothing this session
re-checked. Run this immediately before backfilling, not now:

```sql
select
  (select count(*) from public.zero_records) as zero_records,
  (select count(*) from public.zero_events) as zero_events;
```

If `zero_records` is still 0, nothing to do — P4 is correct as
written. If it's now nonzero (someone/something wrote to the dead
`addZeroRecord` path, or restored a backup), stop and flag it back —
that would mean re-auditing #3's "dead code" finding, not just adding
a backfill block.

**3. Confirm the existing event tables' RLS is actually live** (the
`REORG-migrations.sql` landing-gap risk named above):

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

**4. Check the `session-images` Storage bucket's actual policies** —
untracked in any repo SQL file, confirmed only by dashboard/catalog:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
```

Skim the results for anything scoping to `bucket_id = 'session-images'`
by folder prefix (`{auth.uid()}/...`) — that's the owner-scoping this
bucket needs. If nothing matches, every authenticated user can
currently read/write every other user's session photos and vaulted
attachments; this would be a real, unrelated-to-Phase-B finding worth
fixing immediately, independent of whether you run
`PHASEB-migrations.sql` at all.

**5. Review and run `PHASEB-migrations.sql`** (P1–P3 create tables;
P4 backfills; P5 is read-only, meant for a clone, not production — run
it there if you want the parity guarantee before trusting the live
backfill; P6 is rollback, reference only). Re-runnable if interrupted.

**6. Judgment call — is `attachment_vault`'s `session-images`-bucket-
reuse the right call, or do you want a dedicated bucket for vaulted
import files?** This session chose to match the existing steel-photo
convention (same bucket, path-prefix scoped) specifically to avoid
opening a second bucket-policy surface to audit on top of finding #4
above. If you'd rather isolate imports from photos entirely, that's a
straightforward follow-up migration — flagging it as a choice made,
not an oversight.

**7. Judgment call — `dope_entries`: restore the migration, or leave
it removed?** Owner-review #4 is closed on the "remove the dead call
sites" side (done this session). If `dopeLog` is coming back at some
point, say so and the migration can be restored instead; otherwise no
further action needed.

---

## STOP

Every item from the Gate 0/Phase A owner-review queue that could be
closed without your hands has been closed. Phase B's fact spine
(envelope, dual-write, backfill script, vault-first import, Workhorse
schema, RLS audit) is built and wired into working code where the
Amendment calls for working code, schema-only where it explicitly
calls for schema-only. All SQL lives in one additive, never-executed
file. Full test suite, canon manifest, and protected-engine hash lock
all green. Waiting for you on OWNER-ACTIONS above before Phase C.
