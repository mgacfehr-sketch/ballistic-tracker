# Migration Inventory

Gate 0 artifact (Amendment 1 Part B: *"Migration inventory: every
existing table, row counts, which fields lack provenance — written to
docs/canon/MIGRATION-INVENTORY.md. Read-only analysis; no schema
changes."*).

**Method:** static analysis. Every table below is enumerated from the
12 `*.sql` migration files in the repo root plus every `.from('...')`
call site in `js/db.js` (the sole Supabase access point per CLAUDE.md
rule 2) — this session has no database credentials, and per the rules
of engagement the assistant does not run SQL or authenticate as the
account owner. **One exception:** Section 5's admin-RPC hardening
question was resolved when the owner independently ran a read-only
`pg_get_functiondef()` catalog query (assistant-provided, owner-run) in
the Supabase SQL Editor and reported the result back — see that section
for the confirmed finding. Row counts remain **TBD**; a read-only
counting query is provided in the Appendix for the owner to run and
report back the same way, at their convenience.

---

## 0. The one finding that matters most

**Seven of the busiest tables in this database were never created by a
migration file in this repo.** `rifles`, `barrels`, `loads`, `sessions`,
`zero_records`, `scope_adjustments`, and `cleaning_logs` have no
`CREATE TABLE` anywhere in the twelve `*.sql` files — only later
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements layered on top
(confirmed directly: REORG-migrations.sql's own comment on
`ai_conversations`/`ai_usage_logs` says those "already exist on the
live database... created before schema-as-code," and the same is true,
undocumented even by comment, for the seven listed above). Their
*complete* column set is not reconstructable from the repo alone — only
inferred from `js/db.js`'s field usage and the additive columns below.
This is not a defect to fix in Gate 0 (read-only analysis only), but it
is the central fact anyone touching Phase B's fact-spine migration
needs to know: **the backfill script cannot trust the repo's SQL files
as a complete schema reference for these seven tables** — it needs an
actual `information_schema` dump from the live database first.

**This is not hypothetical — it already happened once, mid-Gate-0.**
SIMPLE-migrations.sql (five `sessions` snapshot columns) existed in the
repo and was believed applied, but a live check found it had never
actually landed on production, most likely run against the wrong
Supabase project at some point. See the `sessions` entry in Section 1
for the full finding and its Phase B backfill implication. A partial
live schema check (five columns on `sessions`) is done; a full
`information_schema` dump across all seven tables was attempted twice
but the pasted results didn't come through — still open, see the owner-
review queue.

**Second finding, already named by `docs/canon/PROVEN-Constitutional-Review.md`
and not re-litigated here:** `sessions` is the aggregate root today, and
it is session-shaped, not fact-shaped. Every one of the seven
undocumented base tables stores a *current value* with no envelope
(provenance class, confidence, supersedes-relationship) around it. The
append-only tables added later (Section 2 below) DO carry provenance —
this is the exact seam Amendment 1 Phase B's fact spine is designed to
generalize.

---

## 1. Undocumented base tables (predate schema-as-code)

Column lists below are assembled from every `ALTER TABLE` found in the
repo's migration files, plus fields `js/db.js` reads/writes that never
appear in any `ALTER TABLE` (meaning they were part of the original,
undocumented `CREATE TABLE`). **This list is not guaranteed complete.**

### `rifles`
Core columns are undocumented (inferred from `js/db.js`: at minimum
`id`, `user_id`, `name`, `caliber`, `zero_range`, `scope_height`,
`angle_unit`, timestamps). Additive columns on record:
- `serial_number`, `action`, `barrel_spec`, `trigger_spec`, `chassis`,
  `muzzle_device` (MORNING M1 — Certificate build sheet)
- `scope_click_value`, `scope_correction_factor`,
  `scope_tracking_tested_at`, `scope_cant_warn` (WAVES M1)
- `has_configs`, `active_config`, `config_velocity_delta`,
  `config_poi_shift` (WAVES M2 — suppressor two-state config; **legacy**,
  superseded in UI by the `suppressors` table + `suppressor_id` FKs but
  never dropped, so both mechanisms exist simultaneously)
- `origin`, `certified_by`, `certified_at`, `transfer_id` (REORG R6 —
  Workhorse factory provenance stamp; `origin: 'owner'|'factory'`)
- `trued_bc`, `trued_mv`, `trued_event_id`, `trued_at` — **note: these
  four are documented in REORG R5's comment as living "ON THE LOAD," but
  `js/db.js` and this list place them by the comment's own text; verify
  against live schema which table actually carries them (rifles vs
  loads) before Phase B trusts this inventory blindly** — see finding
  in Section 0.

### `barrels`
Undocumented core (inferred: `id`, `user_id`, `rifle_id`, `twist_rate`,
`twist_direction`, `install_date`, `is_active`, `notes`, timestamps).
**Known dual-column split:** both `round_count` and `total_rounds`
exist; `js/db.js`'s `_normalizeBarrel`/`_barrelRowForWrite` synchronize
them on every read/write because "the DB has both... We standardize on
totalRounds in JS." Two competing copies of one fact, kept in sync by
application code rather than a single source column — a data-integrity
smell distinct from a provenance gap, but adjacent to it.

### `loads`
Undocumented core (inferred: `id`, `user_id`, `rifle_id`, `name`,
`bullet_name`, `bullet_weight`, `bullet_length`, `bullet_diameter`,
`bullet_bc`, `drag_model`, `muzzle_velocity`, `notes`, timestamps).
Additive: `lot_number` (WAVES M4), `recipe` jsonb (WAVES M5, handload
detail), `trued_bc`/`trued_mv`/`trued_event_id`/`trued_at` (REORG R5 —
see the rifles-vs-loads placement caveat above).

**Provenance gap:** `loads.muzzle_velocity` (the box/advertised number)
carries no column-level marker distinguishing it from a measured value.
Provenance is reconstructed only at *read time*, in
`calibration-status.js`, by checking whether a newer `mv_measurements`
row exists — the fact itself is unlabeled in storage; the label is
computed downstream, every time, by one specific consumer. Any other
future consumer of `loads.muzzle_velocity` (a certificate, an export, a
different screen) would have to reimplement that same inference or risk
presenting an estimate as a measurement.

### `sessions`
The aggregate root. Undocumented core (inferred from extensive
`js/db.js` usage: `id`, `user_id`, `rifle_id`, `load_id`, `date`,
`distance_yards`, `rounds_fired`, `measured_velocity`, `results` jsonb,
`weather` jsonb, `impacts` jsonb, `is_zero_session` boolean, image
storage refs, timestamps). Additive columns on record:
- `updated_at` (REORG R0)
- `suppressor_id` (REORG R1)
- `lot_number` (REORG R2)
- `config` (WAVES M2 — suppressor config tag, redundant in *kind* with
  `suppressor_id` but a separate text column)
- `cold_bore` jsonb (cold-bore-migration.sql — auto-derived shot-1 offset)
- `rifle_name`, `rifle_caliber`, `load_name`, `load_bullet_name`,
  `load_bullet_weight` (SIMPLE-migrations.sql — snapshot columns
  restoring CLAUDE.md rule 7, "store snapshots not references," after
  they were silently dropped by an old whitelist bug) — **see the
  landing-gap finding immediately below**
- `session_type`, `ladder` jsonb (WAVES M6 — ladder test sessions ride
  the same table via a type discriminator rather than a separate table)

**RESOLVED FINDING 2026-07-28 — the SIMPLE migration had never actually
landed on production, despite existing in the repo.** A targeted
`information_schema.columns` check (owner-run, read-only) against
`sessions` for the five SIMPLE-migrations.sql columns returned zero
rows — the columns did not exist. Given the admin-RPC hardening
(CROWD-DATA-migrations.sql, a *later* migration) was confirmed applied,
the most likely explanation is SIMPLE-migrations.sql was originally run
against the wrong Supabase project. The owner ran it against production
in this session; a follow-up check confirmed all five columns now exist
with the correct types (`text` ×4, `numeric` ×1).

**Backfill implication for Phase B (recorded now so it isn't
rediscovered later):** every `sessions` row written between whenever
this gap began and 2026-07-28 has these five fields `NULL` — not
because the data was unknown at capture time, but because `js/db.js`'s
documented graceful-degradation fallback (SIMPLE-migrations.sql's own
header comment: "js/db.js now degrades gracefully — strips these
fields and retries — until this migration runs") silently stripped
them before every INSERT for the entire gap period. This is a known,
benign, fully-explained absence with a real cause, not a data-integrity
mystery. Per Amendment 1 Part B's backfill principle — "BACKFILL script
maps legacy records to events with explicit 'legacy/unknown'
provenance (**never invented facts**)" — Phase B's backfill **must
not** attempt to reconstruct these fields for gap-period sessions by
looking up the session's `rifle_id`/`load_id` against *current* rifle/
load records. Doing so would fabricate a value the session never
actually captured (today's rifle name is not evidence of what it was
named when a 2026-03 session fired) and would violate both "store
snapshots not references" (CLAUDE.md rule 7) and the never-invent-facts
rule simultaneously. The correct treatment: `NULL` on a gap-period
session is itself the honest fact; encode it as such (`legacy/unknown`
provenance), do not fill it in.

**Provenance gap:** `sessions.weather` is documented (REORG R2 comment)
to carry a `source` field (`'measured'|'manual'|'lookup'|'default'`)
*inside the jsonb blob* — correct in spirit (Constitution §37.2: "must
not appear... as an onsite measurement" unless it is one) but not
queryable/indexable/enforceable the way a real column would be; nothing
stops a future write path from omitting `source` and leaving weather
data silently unlabeled. No equivalent provenance field exists at all
for `measured_velocity`, `impacts`, or `results` — a session's shot data
carries no marker for photo-measured vs. manually entered vs. imported.

### `zero_records` (legacy)
Undocumented core (inferred: `id`, `user_id`, `rifle_id`, fields
paralleling a zero confirmation). **This table is a duplicate zero-truth
path alongside the new `zero_events` (Section 2).** REORG R4's own
comment confirms the split: *"zero_records (legacy) remains untouched;
zero_events is the new append-only feed."* Two tables can now describe
"this rifle's zero" with no documented reconciliation rule between them
— `calibration-status.js` reads only from `zeroEvents` +
`zeroVerdict`, so `zero_records` rows written by any surviving legacy
write path would be invisible to the PROVEN TO rollup entirely.

### `scope_adjustments`
Undocumented core (inferred: `id`, `user_id`, `rifle_id`, `date`, and
adjustment detail fields). Additive: `updated_at` (REORG R0). Consumed
by `calibration-status.js` only for its `date` field (to detect
"adjusted after the last zero").

### `cleaning_logs`
Undocumented core (inferred: `id`, `user_id`, `rifle_id`, `date`, round
count at cleaning, notes). Additive: `updated_at` (REORG R0). No
provenance field for exact-vs-approximate date/round-count, despite
Constitution §39/§74 explicitly requiring that distinction be
preservable ("exact," "minimum," "estimated," "unknown").

---

## 2. Event / append-only tables (v2.3 reorg — provenance-aware by design)

These six tables were built *after* the provenance model existed and it
shows: every one carries a `source` or `method` column and an explicit
timestamp establishing when the fact was captured, separate from any
"current value" cache elsewhere.

| Table | Key columns | Provenance field | Notes |
|---|---|---|---|
| `zero_events` | rifle_id, load_id, session_id, distance_yards, shot_count, group_data jsonb, suppressor_id, lot_number | `source: 'session'\|'manual'\|'factory'` | The new zero truth path; see `zero_records` duplication above |
| `mv_measurements` | rifle_id, load_id, velocity_string_id, value, sd, es, shot_count, lot_number, suppressor_id | `source: 'shotview'\|'labradar'\|'manual'\|'factory'` | Feeds calibration-status.js `mv` element directly |
| `tracking_verifications` | rifle_id, factor, click_value, cant_warn | `method` (default `'tall-target'`) | Feeds `tracking` element |
| `truing_events` | rifle_id, load_id, mode, stage, close/far/inputs/ledger jsonb, supersonic_pct, correction_type, old_value, new_value, confidence | inputs jsonb carries env source + prerequisite snapshot | Append-only by design — "re-truing adds an event; it never erases the old one" |
| `steel_strings` | rifle_id, load_id, distance_yd, tier, dialed_elev/wind, units, wind jsonb, direction_of_fire_deg, dof_source, environment jsonb, suppressor_id, lot_number | `dof_source: 'compass'\|'manual'`; `environment.source` | Per-string long-range observation header |
| `steel_shots` | string_id, seq, elev_off/wind_off, held_elev/wind, mv_fps, mv_source, wind_override jsonb | `mv_source: 'manual'\|'shotview'\|'labradar'` | Per-shot rows under a string; this is the closest thing in the live schema to the Validation Doctrine's per-shot evidence layer (§8), though it predates and does not yet implement velocity-compensated residuals (Amendment A11 — still spec-then-build) |

**Gap even here:** none of these six tables carry an explicit
*confidence* or *applicability* field (configuration epoch, zero
compatibility) — only provenance (source) and the raw values. Amendment
1 A8 requires reliability be carried separately from provenance
("provenance, basis/sample size, uncertainty, applicability, freshness,
decision confidence") — today only provenance and, informally, sample
size (`shot_count`) exist as columns; the rest is computed at read time
by `calibration-status.js`, not stored.

---

## 3. Supporting entity tables

| Table | Purpose | Provenance notes |
|---|---|---|
| `suppressors` | Per-user suppressor library (name, brand, model, length, weight) | No provenance fields — pure user-entered entity, appropriately (nothing to measure) |
| `velocity_strings` | One imported/typed chronograph string | `source: 'garmin_csv'\|'garmin_xlsx'\|'manual'`; `assignment_status: 'unassigned'\|'suggested'\|'confirmed'\|'ambiguous'` — this is the closest existing analog to Constitution §23's "unresolved evidence queue," scoped to Garmin imports only |
| `field_shots` | One logged string at field distance (hit/shot count, wind call vs actual) | `weather` jsonb ("auto-attached conditions snapshot" — no explicit source sub-field, unlike `sessions.weather`) |
| `certificate_transfers` | Workhorse rifle ownership transfer tokens | `rifle_snapshot` jsonb is the whole factory package at mint time — immutable by construction (server-minted, single-use token), the strongest provenance guarantee in the schema |
| `user_settings` | Cross-device key/value store (onboarding state, tool activations, feature flags) | N/A — not domain data |

---

## 4. AI tables

| Table | Notes |
|---|---|
| `ai_conversations` | rifle_id, title, messages jsonb. Dormant — "Ask yorT" AI chat is out of v1 scope per Product Definition §10/Constitution §114, though the table and code path exist and are wired live. |
| `ai_usage_logs` | **Known unreconciled dual-column split**, flagged in REORG R7's own comment: `js/db.js` writes `estimated_cost`; some admin RPCs aggregate a column literally named `cost`. Both columns exist (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for each) so neither write path errors, but nothing keeps them in sync — this is a live data-integrity gap, not just a provenance one. |

---

## 5. Admin / crowd-data tables

| Table | Notes |
|---|---|
| `admin_users` | Server-side admin registry (RLS enabled, no policies — invisible to any client role). Seeded with one hard-coded UUID matching the client-side `ADMIN_USER_ID` constant CLAUDE.md's Known Issues section flags. |
| `crowd_export_config` | Single-row table holding a server-generated anonymization salt for `crowd_get_data()`. RLS enabled, no policies. |

**RESOLVED 2026-07-28 — confirmed live against production.** The owner
ran a read-only `pg_get_functiondef()` check against `pg_proc` in the
Supabase SQL Editor: `is_crowd_admin` exists, and all four RPCs
(`admin_get_stats`, `admin_get_users`, `admin_get_usage_summary`,
`admin_export_all`) contain the `is_crowd_admin()` guard. CROWD-DATA-migrations.sql
Migration 5 (marked OPTIONAL in the file itself) **has been applied.**
CLAUDE.md's Known Issue ("`admin_*` RPCs are SECURITY DEFINER with no
server-side admin check") is **historical, not current** — the shipped
code still contains the pre-hardening comment/context, which is fine
(it explains why the hardening exists), but the vulnerability itself is
closed.

---

## 6. Not live / dormant

| Table | Status |
|---|---|
| `dope_entries` | **Referenced in `js/db.js` (three call sites: insert, select, delete for Come-Up Verification) but the `CREATE TABLE` was removed from the migration path at owner review and never run — SIMPLIFY-migrations.sql's own comment confirms "a table that does NOT exist in the live DB."** `js/db.js`'s `deleteRifle` cascade was already patched to skip it (a comment there notes it "made EVERY rifle deletion throw 42P01" before the fix). The feature that would exercise the remaining three call sites (`dopeLog`) is hard-disabled in `beta-features.js` (`isBetaEnabled()` returns `false` unconditionally), so this is currently dormant dead code — but it is a live trap: re-enabling `dopeLog` without also running a `dope_entries` migration reproduces the exact crash the cascade fix worked around, in a new place. |
| `cold_bore_shots` | Exists live (created by WAVES M2, which copies the definition originally drafted in beta-migration.sql — beta-migration.sql itself was never run as a whole). Serves TWO purposes simultaneously: manual entries via `js/db.js`/`cold-bore.js` (not beta-gated — CLAUDE.md lists Cold Bore Tracking as "not gated") and is a distinct data path from the auto-derived `sessions.cold_bore` jsonb column (cold-bore-migration.sql). Two storage locations for conceptually related cold-bore data, one per-shot-log table and one per-session-derived column, with no documented reconciliation. |

---

## 7. Storage (Supabase Storage, not Postgres)

| Bucket | Contents | Provenance notes |
|---|---|---|
| `session-images` | Target photos: `{userId}/{sessionId}.jpg` full + thumbnail (CLAUDE.md rule 8); also steel-target photos per REORG's documented decision, `{userId}/steel_{stringId}.jpg`, same bucket and rules | No content-hash or upload-state tracking found in `js/db.js`'s upload path — Phase A's failure-injection work (attachment protection, Constitution §56) will need this; noted here as a dependency, not solved in Gate 0 |

---

## 8. Summary: fields with no provenance mechanism at all

Distilled from the sections above, the fields most exposed under
Constitution Part III's "every important value must carry provenance,
applicability, and confidence":

1. `sessions.measured_velocity`, `sessions.impacts`, `sessions.results` — no source marker of any kind.
2. `loads.muzzle_velocity`, `loads.bullet_bc` — box/advertised values indistinguishable in storage from a value that started life as a truing output copied back onto the load (`trued_mv`/`trued_bc` are separate columns, but nothing prevents `muzzle_velocity` itself from later being hand-edited to match without leaving a trace).
3. `cleaning_logs` — no exact/approximate marker on date or round count.
4. `zero_records` vs `zero_events` — a structural gap: an entire legacy write path with no provenance model, still present, not merged into the append-only feed.
5. `field_shots.weather` — auto-attached with no `source` sub-field (contrast with `sessions.weather`, which has one).
6. Every one of the seven undocumented base tables (Section 1) — provenance for *any* field is whatever `js/db.js` happens to attach in application code at write time; there is no schema-level guarantee.

---

## Appendix — read-only row-count queries

Run in the Supabase SQL Editor (SELECT-only, no writes). Paste results
back to fill in row counts if desired; not required for Gate 0 to be
considered complete.

```sql
select
  (select count(*) from public.rifles)                 as rifles,
  (select count(*) from public.barrels)                as barrels,
  (select count(*) from public.loads)                  as loads,
  (select count(*) from public.sessions)                as sessions,
  (select count(*) from public.zero_records)            as zero_records,
  (select count(*) from public.scope_adjustments)       as scope_adjustments,
  (select count(*) from public.cleaning_logs)            as cleaning_logs,
  (select count(*) from public.zero_events)              as zero_events,
  (select count(*) from public.mv_measurements)          as mv_measurements,
  (select count(*) from public.tracking_verifications)   as tracking_verifications,
  (select count(*) from public.truing_events)             as truing_events,
  (select count(*) from public.steel_strings)             as steel_strings,
  (select count(*) from public.steel_shots)                as steel_shots,
  (select count(*) from public.suppressors)                as suppressors,
  (select count(*) from public.velocity_strings)            as velocity_strings,
  (select count(*) from public.field_shots)                  as field_shots,
  (select count(*) from public.certificate_transfers)        as certificate_transfers,
  (select count(*) from public.user_settings)                 as user_settings,
  (select count(*) from public.ai_conversations)               as ai_conversations,
  (select count(*) from public.ai_usage_logs)                   as ai_usage_logs,
  (select count(*) from public.cold_bore_shots)                  as cold_bore_shots,
  (select count(*) from public.admin_users)                       as admin_users;
```

`dope_entries` is deliberately omitted — per Section 6, the table does
not exist live; running `count(*)` against it will error.
