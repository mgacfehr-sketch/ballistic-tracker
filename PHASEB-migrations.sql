-- ════════════════════════════════════════════════════════════
-- PHASEB-migrations.sql — Amendment 1 Part B, "fact spine, right-sized"
--
-- NEVER RUN AUTOMATICALLY. This file is written for owner review and
-- owner-initiated execution in the Supabase SQL Editor — per this
-- session's rules of engagement, no SQL in this repo is run by the
-- assistant. Every block is ADDITIVE / NON-DESTRUCTIVE and safely
-- RE-RUNNABLE (IF NOT EXISTS everywhere; policies guarded with DROP
-- POLICY IF EXISTS; inserts guarded with ON CONFLICT DO NOTHING).
-- Nothing here deletes, renames, or rewrites existing data.
--
-- Naming note: this is Amendment 1 PHASE B (the fact spine). It is
-- unrelated to the already-shipped STAGE-B-migrations.sql (Zero
-- Guardian / auto-conditions / onboarding, a different lettering
-- scheme from an earlier build). Do not confuse the two.
--
-- Read PHASEB-REPORT.md before running anything below — it explains
-- what's additive-only here (P1-P3, safe to run any time) vs. what
-- depends on a judgment call or a fresh live-schema check (P4
-- backfill; see OWNER-ACTIONS).
--
-- Sections:
--   P0  — session-images bucket: add the missing UPDATE storage policy
--   P0b — import-vault: a new, dedicated bucket for vaulted originals
--   P0c — delete_my_account(): teach it to clean up import-vault too
--   P1  — fact_events            (the minimal event envelope)
--   P2  — attachment_vault       (vault-first import)
--   P3  — workhorse_packages     (SCHEMA ONLY — Phase F builds the claim flow)
--   P4  — Backfill: legacy rows -> fact_events (idempotent)
--   P5  — Parity check queries   (run on a database CLONE, not production)
--   P6  — Rollback
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- P0 — session-images bucket: add the missing UPDATE storage policy.
--
-- Found running OWNER-ACTIONS item 4 (RLS audit, 2026-07-28): the
-- session-images bucket has exactly 3 policies on storage.objects —
-- "Users can upload own images" (INSERT), "Users can view own images"
-- (SELECT), "Users can delete own images" (DELETE) — all correctly
-- scoped by folder prefix (bucket_id = 'session-images' AND
-- auth.uid()::text = (storage.foldername(name))[1]). There is NO
-- UPDATE policy. Supabase Storage's upload(..., {upsert: true}) needs
-- UPDATE permission when the target path already exists (INSERT alone
-- only covers a genuinely new path) — without it, re-uploading to an
-- existing path fails under RLS.
--
-- This bit js/db.js's own vaultImportFile (Phase B, this session) —
-- fixed in the same commit as this SQL block by checking
-- attachment_vault BEFORE ever calling Storage, so the common case
-- (re-importing an identical file) no longer depends on this policy at
-- all. It does NOT fix the pre-existing risk in js/sync-queue.js's
-- offline image-retry path: if saveSessionImage/saveSteelPhoto's
-- upload succeeds server-side but the client treats the response as a
-- network failure (a real, not-hypothetical race on a flaky range
-- connection) and queues + later retries, that retry targets the same
-- already-uploaded path and would fail the same way — and per
-- js/sync-queue.js's own comment, "image failure never blocks the
-- flush," so today that failure is silently swallowed, potentially
-- stranding a photo forever with no user-visible error. This migration
-- block closes that gap at the policy level; whether js/sync-queue.js
-- also deserves a code-level hardening pass is a separate question,
-- flagged in PHASEB-REPORT.md, not decided here.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own images" ON storage.objects;
CREATE POLICY "Users can update own images"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'session-images' AND auth.uid()::text = (storage.foldername(name))[1])
    WITH CHECK (bucket_id = 'session-images' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ────────────────────────────────────────────────────────────
-- P0b — `import-vault`: a DEDICATED Storage bucket for vaulted original
-- import files, per owner ruling on OWNER-ACTIONS item 6. Original
-- evidence (a raw Garmin CSV/XLSX, preserved unmodified as proof of
-- what was actually imported) has a different lifecycle and policy
-- surface than display images (session/steel photos, shown in the UI,
-- deleted when their parent record is deleted) — this session's first
-- draft reused the session-images bucket under a vault/ prefix; the
-- owner ruled that conflates the two and asked for separation instead.
-- js/db.js's vaultImportFile is updated in the same commit to upload
-- here instead. _registerAttachmentHash (session/steel image hash
-- tracking, owner-review #10) is UNCHANGED — those files stay exactly
-- where they already live, in session-images; only vaulted IMPORTS move.
--
-- All 4 policies (including UPDATE, learning from the P0 finding above
-- so this bucket never has the same gap) from the start.
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-vault', 'import-vault', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own import-vault files" ON storage.objects;
CREATE POLICY "Users can upload own import-vault files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'import-vault' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can view own import-vault files" ON storage.objects;
CREATE POLICY "Users can view own import-vault files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'import-vault' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can update own import-vault files" ON storage.objects;
CREATE POLICY "Users can update own import-vault files"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'import-vault' AND auth.uid()::text = (storage.foldername(name))[1])
    WITH CHECK (bucket_id = 'import-vault' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete own import-vault files" ON storage.objects;
CREATE POLICY "Users can delete own import-vault files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'import-vault' AND auth.uid()::text = (storage.foldername(name))[1]);

-- P0c — delete_my_account(): teach it about the new bucket.
--
-- Owner ran `select pg_get_functiondef('public.delete_my_account'::regproc);`
-- 2026-07-28 (OWNER-ACTIONS item 8): the LIVE function is confirmed to
-- be exactly SIMPLIFY-migrations.sql's version (the dope_entries-free
-- one — FOUNDATION-/MORNING-migrations.sql's earlier versions are NOT
-- live). Reproduced verbatim below with exactly one addition: the
-- import-vault cleanup line, same shape as the existing session-images
-- one. CREATE OR REPLACE is safe/idempotent/re-runnable like everything
-- else in this file — this is not a guess at what might be live, it is
-- the confirmed-live body plus one line.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid uuid := auth.uid();
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.user_settings     WHERE user_id = uid;
    DELETE FROM public.ai_usage_logs     WHERE user_id = uid;
    DELETE FROM public.ai_conversations  WHERE user_id = uid;
    DELETE FROM public.cold_bore_shots   WHERE user_id = uid;
    DELETE FROM public.velocity_strings  WHERE user_id = uid;
    DELETE FROM public.cleaning_logs     WHERE user_id = uid;
    DELETE FROM public.scope_adjustments WHERE user_id = uid;
    DELETE FROM public.zero_records      WHERE user_id = uid;
    DELETE FROM public.sessions          WHERE user_id = uid;
    DELETE FROM public.loads             WHERE user_id = uid;
    DELETE FROM public.barrels           WHERE user_id = uid;
    DELETE FROM public.rifles            WHERE user_id = uid;

    DELETE FROM storage.objects
        WHERE bucket_id = 'session-images' AND name LIKE uid::text || '/%';
    DELETE FROM storage.objects
        WHERE bucket_id = 'import-vault' AND name LIKE uid::text || '/%';

    DELETE FROM auth.users WHERE id = uid;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- P1 — fact_events: the minimal event envelope (Amendment 1 Part B).
--
-- Mandatory envelope fields per Amendment 1: id, type, schema version,
-- account, rifle, event time, provenance, source ref, eligibility,
-- supersedes, sync state, typed payload.
--
-- source_table + source_row_id is the idempotency key: it is what lets
-- both dual-write (new facts, written moments after their legacy row)
-- and the backfill script (P4, historical rows) use the exact same
-- ON CONFLICT DO NOTHING insert path without double-writing.
--
-- event_type is intentionally free text, not a CHECK-constrained enum —
-- Amendment 1 A2's fact taxonomy is meant to grow (new lifecycle/change
-- fact kinds) without a schema migration every time. Expected values as
-- of this migration: 'zero' | 'velocity' | 'tracking_verification' |
-- 'truing' | 'steel_string' | 'steel_shot' | 'cleaning' | 'scope_adjustment'.
--
-- provenance carries Amendment 1 A8's CLAIM KIND (not a strength
-- ranking): 'measured' | 'manual' | 'imported' | 'derived' | 'system' |
-- 'legacy' | 'legacy/unknown'. 'legacy/unknown' is reserved for backfill
-- rows whose original capture provenance cannot be honestly determined
-- (Amendment 1 Part B: "never invented facts") — NOT used for rows that
-- already carry a real source/method column; those get that real value.
--
-- rifle_id is nullable: most fact kinds are directly rifle-scoped, but
-- some (e.g. a steel_shot, scoped through its parent steel_strings row)
-- are not directly FK'd to a rifle at the row level. Ownership/RLS
-- never depends on rifle_id — only user_id does.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fact_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id           uuid REFERENCES public.rifles(id) ON DELETE CASCADE,
    event_type         text NOT NULL,
    schema_version     integer NOT NULL DEFAULT 1,
    event_time         timestamptz NOT NULL,          -- when the fact happened
    recorded_at        timestamptz NOT NULL DEFAULT now(), -- when THIS envelope row was written (honest backfill marker — see P4)
    provenance         text NOT NULL,
    source_table       text NOT NULL,                 -- the legacy/source table this envelope mirrors
    source_row_id      uuid NOT NULL,                  -- that table's own row id
    eligibility        text NOT NULL DEFAULT 'eligible', -- 'eligible' | 'excluded' (A2: rejected observations are preserved, never deleted)
    eligibility_reason text,
    supersedes         uuid REFERENCES public.fact_events(id) ON DELETE SET NULL,
    sync_state         text NOT NULL DEFAULT 'synced', -- 'synced' | 'pending' | 'quarantined' (mirrors js/sync-queue.js vocabulary)
    payload            jsonb NOT NULL,                 -- typed by event_type; camelCase keys mirroring js/db.js's _rowToJs shape
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fact_events_source_unique UNIQUE (source_table, source_row_id)
);

ALTER TABLE public.fact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own fact events" ON public.fact_events;
CREATE POLICY "Users can read own fact events"
    ON public.fact_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own fact events" ON public.fact_events;
CREATE POLICY "Users can insert own fact events"
    ON public.fact_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own fact events" ON public.fact_events;
CREATE POLICY "Users can update own fact events"
    ON public.fact_events FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own fact events" ON public.fact_events;
CREATE POLICY "Users can delete own fact events"
    ON public.fact_events FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fact_events_user_rifle ON public.fact_events(user_id, rifle_id);
CREATE INDEX IF NOT EXISTS idx_fact_events_type       ON public.fact_events(user_id, event_type);


-- ────────────────────────────────────────────────────────────
-- P2 — attachment_vault: vault-first import (Amendment 1 Part B).
-- "Original file + hash preserved before association; unresolved
-- imports park safely."
--
-- Two distinct storage locations tracked through this ONE table (owner
-- ruling on OWNER-ACTIONS item 6 — see P0b above for the full reasoning):
--   - `kind IN ('garmin_csv', 'garmin_xlsx')` rows: original import
--     evidence, uploaded to the DEDICATED `import-vault` bucket (P0b).
--   - `kind IN ('session_image', 'steel_image')` rows: hash-tracking
--     only (owner-review #10) for images that already live in the
--     EXISTING `session-images` bucket at their own conventional path —
--     no upload happens for these, `storage_bucket`/`storage_path` just
--     record where the (unmoved) file already is.
-- storage_bucket is NOT NULL with no column default — both js/db.js
-- call sites (_registerAttachmentHash, vaultImportFile) always set it
-- explicitly, so a default would only ever mask a bug, not save typing.
--
-- content_hash is SHA-256 of the ORIGINAL uploaded bytes, computed
-- client-side (Web Crypto `crypto.subtle.digest`, available in both the
-- browser and a Capacitor WebView — no new dependency). The
-- (user_id, content_hash) unique constraint makes re-uploading the
-- exact same file a safe no-op at the vault layer, independent of and
-- in addition to js/chrono.js's existing per-shot velocity-fingerprint
-- and name+date dedup (owner-review queue #7 — confirmed already live,
-- see PHASEB-REPORT.md).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attachment_vault (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind                   text NOT NULL,             -- 'garmin_csv' | 'garmin_xlsx' | 'session_image' | 'steel_image'
    original_filename      text,
    content_hash           text NOT NULL,             -- sha256 hex of the original file bytes
    byte_size              integer,
    storage_bucket         text NOT NULL,             -- 'import-vault' (garmin_*) | 'session-images' (*_image) — always set explicitly by the caller, no default
    storage_path           text NOT NULL,             -- e.g. '{userId}/{contentHash}' (import-vault) or the image's own existing path (session-images)
    status                 text NOT NULL DEFAULT 'unresolved', -- 'unresolved' | 'associated' | 'orphaned'
    associated_fact_event_id uuid REFERENCES public.fact_events(id) ON DELETE SET NULL,
    associated_table       text,                      -- e.g. 'velocity_strings', 'sessions' (association may predate fact_events dual-write, e.g. session images)
    associated_row_id      uuid,
    created_at             timestamptz NOT NULL DEFAULT now(),
    resolved_at            timestamptz,
    CONSTRAINT attachment_vault_user_hash_unique UNIQUE (user_id, content_hash)
);

ALTER TABLE public.attachment_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own vaulted attachments" ON public.attachment_vault;
CREATE POLICY "Users can read own vaulted attachments"
    ON public.attachment_vault FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own vaulted attachments" ON public.attachment_vault;
CREATE POLICY "Users can insert own vaulted attachments"
    ON public.attachment_vault FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own vaulted attachments" ON public.attachment_vault;
CREATE POLICY "Users can update own vaulted attachments"
    ON public.attachment_vault FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own vaulted attachments" ON public.attachment_vault;
CREATE POLICY "Users can delete own vaulted attachments"
    ON public.attachment_vault FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_attachment_vault_status ON public.attachment_vault(user_id, status);


-- ────────────────────────────────────────────────────────────
-- P3 — workhorse_packages: SCHEMA ONLY (Amendment 1 Part B: "Workhorse
-- factory-package SCHEMA defined now (build later) so the envelope can
-- represent factory truth"). No application code writes to this table
-- yet — the claim flow, secret hashing, and certificate-evolution logic
-- are Phase F work. Defined now purely so fact_events can eventually
-- reference a workhorse_package_id without a later breaking migration.
--
-- claim_secret_hash: NEVER store the raw claim secret. Hash it
-- (server-side, at Phase F build time) the same way a password would
-- be. Distinct from serial_number by design (Amendment 1 Phase F:
-- "claim secret distinct from serial").
--
-- RLS: enabled with NO policies, matching this codebase's existing
-- convention for privileged, not-yet-user-owned tables (admin_users,
-- crowd_export_config — see docs/canon/MIGRATION-INVENTORY.md §5).
-- A package has no user_id until claimed; until Phase F's claim RPC
-- exists, this table must be invisible to every client role.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workhorse_packages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number      text NOT NULL UNIQUE,
    claim_secret_hash  text,                          -- set at factory mint time; NULL until minted
    status             text NOT NULL DEFAULT 'unminted', -- 'unminted' | 'unclaimed' | 'claimed' | 'revoked'
    claimed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    claimed_at         timestamptz,
    revoked_at         timestamptz,
    revoked_reason     text,
    rifle_snapshot     jsonb,                         -- the factory build sheet at mint time (mirrors certificate_transfers.rifle_snapshot's immutable-by-construction pattern)
    created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workhorse_packages ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies (see comment above) — service-role only until Phase F.


-- ────────────────────────────────────────────────────────────
-- P4 — Backfill: legacy rows -> fact_events, idempotent.
--
-- Scope: the six already-provenance-aware event tables from the v2.3
-- reorg (zero_events, mv_measurements, tracking_verifications,
-- truing_events, steel_strings, steel_shots) plus the two Amendment 1
-- A2 lifecycle-fact tables (cleaning_logs, scope_adjustments). This is
-- the exact seam docs/canon/MIGRATION-INVENTORY.md §0 identifies as
-- "already provenance-aware by design" — Phase B generalizes it, it
-- does not yet decompose anything new.
--
-- EXPLICITLY OUT OF SCOPE for this backfill (see PHASEB-REPORT.md for
-- the full reasoning):
--   - zero_records: CLOSED, owner-review #3 — confirmed dead code
--     (addZeroRecord has zero callers) AND confirmed empty (0 rows,
--     always has been, live-checked 2026-07-28). Nothing to migrate.
--   - dope_entries: does not exist live (removed at owner review,
--     owner-review #4 — its three dead call sites were removed from
--     js/db.js this session).
--   - sessions: the aggregate root. Deliberately NOT decomposed into
--     fact_events in Phase B (see PHASEB-REPORT.md's scope-boundary
--     note) — it stays session-shaped for now, a Phase C+ concern.
--     RULE PRESERVED FOR WHENEVER THAT WORK STARTS (Amendment 1's
--     "never invented facts" principle, established this session via
--     the SIMPLE-migrations.sql landing-gap finding): sessions rows
--     written before the five snapshot columns (rifle_name,
--     rifle_caliber, load_name, load_bullet_name, load_bullet_weight)
--     actually landed on production (owner-run fix applied 2026-07-28)
--     legitimately have NULL in those fields — js/db.js's documented
--     graceful-degradation fallback stripped them pre-insert for the
--     entire gap period. That NULL is the honest fact. A future
--     sessions backfill MUST tag gap-period rows 'legacy/unknown'
--     provenance on those five fields and leave them NULL — NEVER
--     reconstruct them from current rifle_id/load_id lookups, which
--     would fabricate a historical fact the session never captured.
--
-- Each block is a plain INSERT ... SELECT with
-- ON CONFLICT (source_table, source_row_id) DO NOTHING, so re-running
-- this section after a partial run (or after dual-write has already
-- started mirroring new rows) never double-writes.
--
-- payload uses jsonb_build_object with camelCase keys, matching
-- js/db.js's _rowToJs shape exactly, so a fact_events row written by
-- this backfill and one written by dual-write (P4 vs. the db.js
-- changes in this same commit) are byte-for-byte the same shape.
--
-- recorded_at is deliberately NOT copied from any legacy created_at
-- column — it is left at its table default (now()), honestly marking
-- "when this envelope row was written" as backfill time, distinct from
-- event_time (the fact's own original date/applied_at/session_date).
-- ────────────────────────────────────────────────────────────

-- zero_events -> fact_events ('zero')
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'zero', COALESCE(date, created_at, now()),
    COALESCE(source, 'legacy/unknown'), 'zero_events', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'loadId', load_id, 'sessionId', session_id,
        'date', date, 'distanceYards', distance_yards, 'shotCount', shot_count,
        'groupData', group_data, 'suppressorId', suppressor_id, 'lotNumber', lot_number,
        'source', source, 'createdAt', created_at
    )
FROM public.zero_events
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- mv_measurements -> fact_events ('velocity')
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'velocity', COALESCE(date, created_at, now()),
    COALESCE(source, 'legacy/unknown'), 'mv_measurements', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'loadId', load_id, 'velocityStringId', velocity_string_id,
        'date', date, 'value', value, 'sd', sd, 'es', es, 'shotCount', shot_count,
        'lotNumber', lot_number, 'suppressorId', suppressor_id, 'source', source, 'createdAt', created_at
    )
FROM public.mv_measurements
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- tracking_verifications -> fact_events ('tracking_verification')
-- Fixed provenance 'measured': every row here is a physical tall-target
-- test result — there is no other way this table has ever been written.
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'tracking_verification', COALESCE(date, created_at, now()),
    'measured', 'tracking_verifications', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'date', date, 'factor', factor,
        'clickValue', click_value, 'cantWarn', cant_warn, 'method', method, 'createdAt', created_at
    )
FROM public.tracking_verifications
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- truing_events -> fact_events ('truing')
-- Fixed provenance 'derived': a truing event is always a computed
-- correction from the protected routing engine, never hand-typed.
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'truing', COALESCE(applied_at, created_at, now()),
    'derived', 'truing_events', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'loadId', load_id, 'mode', mode, 'stage', stage,
        'close', close, 'far', far, 'inputs', inputs, 'ledger', ledger,
        'supersonicPct', supersonic_pct, 'correctionType', correction_type,
        'oldValue', old_value, 'newValue', new_value, 'confidence', confidence,
        'appliedAt', applied_at, 'createdAt', created_at
    )
FROM public.truing_events
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- steel_strings -> fact_events ('steel_string')
-- Fixed provenance 'manual': the string header is always shooter-logged
-- (dof_source/environment.source sub-fields are preserved in payload).
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'steel_string', COALESCE(session_date, created_at, now()),
    'manual', 'steel_strings', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'loadId', load_id, 'sessionDate', session_date,
        'distanceYd', distance_yd, 'tier', tier, 'dialedElev', dialed_elev, 'dialedWind', dialed_wind,
        'units', units, 'wind', wind, 'directionOfFireDeg', direction_of_fire_deg,
        'dofSource', dof_source, 'environment', environment, 'suppressorId', suppressor_id,
        'lotNumber', lot_number, 'photoRef', photo_ref, 'notes', notes, 'createdAt', created_at
    )
FROM public.steel_strings
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- steel_shots -> fact_events ('steel_shot')
-- rifle_id is looked up via the parent steel_strings row (steel_shots
-- itself only carries string_id) — a read, not an invented fact.
-- Fixed provenance 'manual' (mv_source's own sub-value is preserved).
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    sh.user_id, st.rifle_id, 'steel_shot', COALESCE(sh.created_at, now()),
    'manual', 'steel_shots', sh.id,
    jsonb_build_object(
        'id', sh.id, 'stringId', sh.string_id, 'seq', sh.seq,
        'elevOff', sh.elev_off, 'windOff', sh.wind_off, 'units', sh.units,
        'heldElev', sh.held_elev, 'heldWind', sh.held_wind, 'mvFps', sh.mv_fps,
        'mvSource', sh.mv_source, 'windOverride', sh.wind_override, 'createdAt', sh.created_at
    )
FROM public.steel_shots sh
LEFT JOIN public.steel_strings st ON st.id = sh.string_id
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- cleaning_logs -> fact_events ('cleaning')
-- Fixed provenance 'manual' (Amendment 1 A2 lifecycle fact; no source
-- column exists on this table — see docs/canon/MIGRATION-INVENTORY.md
-- §1's #10 finding, still an open gap for exact/approximate marking,
-- not solved here). Columns confirmed via the owner-run
-- information_schema dump 2026-07-28 (owner-review #2, CLOSED) —
-- event_time/payload now include created_at, matching the other six
-- backfilled tables' shape (this table's created_at wasn't confirmed
-- to exist when this block was first written).
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'cleaning', COALESCE(date, created_at, now()),
    'manual', 'cleaning_logs', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'barrelId', barrel_id, 'date', date,
        'roundCountAtCleaning', round_count_at_cleaning, 'notes', notes, 'createdAt', created_at
    )
FROM public.cleaning_logs
ON CONFLICT (source_table, source_row_id) DO NOTHING;

-- scope_adjustments -> fact_events ('scope_adjustment')
-- Fixed provenance 'manual' (Amendment 1 A2 lifecycle fact). Same
-- confirmed-schema / created_at note as cleaning_logs above.
INSERT INTO public.fact_events
    (user_id, rifle_id, event_type, event_time, provenance, source_table, source_row_id, payload)
SELECT
    user_id, rifle_id, 'scope_adjustment', COALESCE(date, created_at, now()),
    'manual', 'scope_adjustments', id,
    jsonb_build_object(
        'id', id, 'rifleId', rifle_id, 'sessionId', session_id, 'date', date,
        'elevationChange', elevation_change, 'windageChange', windage_change,
        'reason', reason, 'notes', notes, 'createdAt', created_at
    )
FROM public.scope_adjustments
ON CONFLICT (source_table, source_row_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- P5 — Parity check queries. RUN ON A DATABASE CLONE, NOT PRODUCTION
-- (Amendment 1 Part B: "parity check on a database clone"). Compares
-- row counts and a content spot-check between each legacy table and
-- its fact_events mirror. All read-only.
-- ────────────────────────────────────────────────────────────

-- 5a. Count parity — every row's count should match exactly (backfill
-- is total, not sampled) once P4 has run to completion.
SELECT 'zero_events' AS source_table,
    (SELECT count(*) FROM public.zero_events) AS legacy_count,
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'zero_events') AS fact_events_count
UNION ALL
SELECT 'mv_measurements',
    (SELECT count(*) FROM public.mv_measurements),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'mv_measurements')
UNION ALL
SELECT 'tracking_verifications',
    (SELECT count(*) FROM public.tracking_verifications),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'tracking_verifications')
UNION ALL
SELECT 'truing_events',
    (SELECT count(*) FROM public.truing_events),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'truing_events')
UNION ALL
SELECT 'steel_strings',
    (SELECT count(*) FROM public.steel_strings),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'steel_strings')
UNION ALL
SELECT 'steel_shots',
    (SELECT count(*) FROM public.steel_shots),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'steel_shots')
UNION ALL
SELECT 'cleaning_logs',
    (SELECT count(*) FROM public.cleaning_logs),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'cleaning_logs')
UNION ALL
SELECT 'scope_adjustments',
    (SELECT count(*) FROM public.scope_adjustments),
    (SELECT count(*) FROM public.fact_events WHERE source_table = 'scope_adjustments');
-- Expect: legacy_count = fact_events_count on every row. A mismatch
-- means P4 didn't finish, or a row was written to the legacy table
-- AFTER the backfill ran but before dual-write went live in the same
-- deploy — re-run the relevant P4 block (it's idempotent) to close it.

-- 5b. Orphan check — any fact_events row whose source_row_id no longer
-- exists in its legacy table (would indicate a legacy delete that
-- didn't reach fact_events; Amendment 1 A2 says events stay
-- append-only/deletable-by-the-logging-user but not silently orphaned).
SELECT fe.source_table, fe.source_row_id
FROM public.fact_events fe
WHERE fe.source_table = 'zero_events'
  AND NOT EXISTS (SELECT 1 FROM public.zero_events z WHERE z.id = fe.source_row_id)
UNION ALL
SELECT fe.source_table, fe.source_row_id
FROM public.fact_events fe
WHERE fe.source_table = 'mv_measurements'
  AND NOT EXISTS (SELECT 1 FROM public.mv_measurements m WHERE m.id = fe.source_row_id);
-- (extend with the remaining six tables the same way if this returns
-- rows worth investigating on the first two)

-- 5c. Spot-check content parity on one table (adjust LIMIT/table as
-- needed) — confirms payload values actually match the live row, not
-- just that a row exists.
SELECT z.id, z.rifle_id, z.distance_yards, fe.payload->>'rifleId' AS fe_rifle_id,
       (fe.payload->>'distanceYards')::int AS fe_distance_yards
FROM public.zero_events z
JOIN public.fact_events fe ON fe.source_table = 'zero_events' AND fe.source_row_id = z.id
LIMIT 20;


-- ────────────────────────────────────────────────────────────
-- P6 — Rollback.
--
-- P1-P3 (fact_events, attachment_vault, workhorse_packages) are purely
-- additive new tables — nothing in the existing schema or application
-- read path depends on them existing. Legacy tables remain the sole
-- source of truth for every screen in the app throughout Phase B; the
-- dual-write added to js/db.js in this same commit is best-effort and
-- swallows its own errors (see PHASEB-REPORT.md), so it cannot break
-- an existing save even if these tables are absent or rolled back.
--
-- To fully roll back Phase B's database changes:
--   1. Stop or revert the js/db.js dual-write code (redeploy the
--      previous commit, or comment out the _writeFactEvent call sites).
--   2. DROP TABLE IF EXISTS public.fact_events CASCADE;
--      DROP TABLE IF EXISTS public.attachment_vault CASCADE;
--      DROP TABLE IF EXISTS public.workhorse_packages CASCADE;
--   3. No backfill data needs to be "un-migrated" elsewhere — the
--      backfill (P4) only ever writes fact_events rows; it never
--      modifies a legacy table.
--   4. If rolling back P0b too: any files already vaulted to
--      import-vault should be exported/backed up first (this bucket
--      holds original evidence — treat deleting it as a real data-loss
--      action, not routine cleanup). Once safe:
--      DELETE FROM storage.objects WHERE bucket_id = 'import-vault';
--      DELETE FROM storage.buckets WHERE id = 'import-vault';
--      (the 4 policies on storage.objects are harmless to leave in
--      place — they only ever match rows with bucket_id = 'import-vault',
--      which no longer exist once the bucket is gone.)
--   5. P0's UPDATE policy on session-images is safe to leave in place
--      even on a full rollback — it only grants what INSERT already
--      implied (overwrite your own existing file), never widens access.
--   6. P0c's added DELETE line is also safe to leave in place even if
--      P0b's bucket is rolled back — deleting zero matching rows from
--      storage.objects for a bucket_id that no longer exists is a
--      harmless no-op, not an error.
--
-- Partial rollback (keep the tables, undo only a bad backfill run):
--   DELETE FROM public.fact_events WHERE source_table = '<one table>';
-- then re-run that table's P4 block once the underlying issue is fixed.
-- ════════════════════════════════════════════════════════════
