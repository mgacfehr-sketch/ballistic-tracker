-- ════════════════════════════════════════════════════════════
-- PHASECD-migrations.sql — Amendment 1 Phase C (memory + minimal
-- invalidation) and Phase D (validation statuses + coach brain).
--
-- NEVER RUN AUTOMATICALLY. Written for owner review and owner-initiated
-- execution in the Supabase SQL Editor, exactly like PHASEB-migrations.sql
-- before it. Every block is ADDITIVE / NON-DESTRUCTIVE and safely
-- RE-RUNNABLE (IF NOT EXISTS everywhere; policies guarded with DROP
-- POLICY IF EXISTS). Nothing here deletes, renames, or rewrites existing
-- data. All new/changed js/db.js call sites that reference a
-- not-yet-existing column degrade gracefully (see js/db.js's
-- _insertGracefulRow) until this file is run.
--
-- Sections:
--   Phase C:
--     PC1 — config_epochs        (suppressor/lot CHANGE ledger)
--     PC2 — recurring_targets    (remembered places, Constitution §35.5)
--     PC3 — barrel_id columns    (additive, nullable, on 4 existing tables)
--   Phase D:
--     PD1 — troubleshooting_checks (Validation Doctrine §7 ladder)
--   Parity / rollback:
--     P9  — Parity check queries (run on a database CLONE, not production)
--     P10 — Rollback
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- PC1 — config_epochs: append-only suppressor/lot CHANGE ledger
-- (Amendment 1 Phase C; Constitution §12.1 configuration epochs; A2
-- lifecycle/change facts; A15 "an explicit current-state fact outranks
-- inference"). A row here means "this changed, here" — never "this was
-- used again." js/config-memory.js's deriveCurrentState derives CURRENT
-- as the latest row per (rifle_id, kind); there is no UPDATE path, ever
-- — pure append-and-derive, same idiom as zero_events/truing_events.
--
-- kind: 'suppressor' | 'lot'. value is free text: a suppressor_id (or
-- NULL = bare) for 'suppressor'; the lot string (or NULL = unknown lot)
-- for 'lot'. Barrel epochs are NOT stored here — barrels.install_date /
-- is_active already exist and remain the source for barrel epoch
-- boundaries; this table only covers the two facts that had no epoch
-- history at all before Phase C (suppressor state lived only in a
-- user_settings cache; lot lived only in the mutable loads.lotNumber
-- field with no change history whatsoever).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.config_epochs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id    uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    kind        text NOT NULL,             -- 'suppressor' | 'lot'
    value       text,                      -- suppressor_id, lot text, or NULL (bare / unknown)
    started_at  timestamptz NOT NULL DEFAULT now(),
    source      text NOT NULL DEFAULT 'manual',
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.config_epochs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own config epochs" ON public.config_epochs;
CREATE POLICY "Users can read own config epochs"
    ON public.config_epochs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own config epochs" ON public.config_epochs;
CREATE POLICY "Users can insert own config epochs"
    ON public.config_epochs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own config epochs" ON public.config_epochs;
CREATE POLICY "Users can update own config epochs"
    ON public.config_epochs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own config epochs" ON public.config_epochs;
CREATE POLICY "Users can delete own config epochs"
    ON public.config_epochs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_config_epochs_rifle_kind
    ON public.config_epochs(user_id, rifle_id, kind, started_at DESC);


-- ────────────────────────────────────────────────────────────
-- PC2 — recurring_targets: remembered places (Constitution §35.5 —
-- "If a shooter repeatedly uses the same 900-yard or 1,000-yard steel
-- at a known range, PROVEN should remember: target identity, distance,
-- azimuth... and prior observations"). v1 scope: distance + optional
-- azimuth/label, ranked by recency then use count (Phase C: "switcher
-- ranked by recency"). One row per (rifle, distance) -- re-using the
-- same distance again is an UPDATE (use_count++, last_used_at bumped),
-- not a new row; this is a preference/recognition cache, not an
-- evidentiary fact, so it does NOT dual-write into fact_events (compare
-- config_epochs above, which IS a canonical lifecycle fact and does).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_targets (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id      uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    distance_yd   integer NOT NULL,
    azimuth_deg   real,
    label         text,
    use_count     integer NOT NULL DEFAULT 1,
    last_used_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recurring_targets_rifle_distance_unique UNIQUE (rifle_id, distance_yd)
);

ALTER TABLE public.recurring_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own recurring targets" ON public.recurring_targets;
CREATE POLICY "Users can read own recurring targets"
    ON public.recurring_targets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own recurring targets" ON public.recurring_targets;
CREATE POLICY "Users can insert own recurring targets"
    ON public.recurring_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recurring targets" ON public.recurring_targets;
CREATE POLICY "Users can update own recurring targets"
    ON public.recurring_targets FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own recurring targets" ON public.recurring_targets;
CREATE POLICY "Users can delete own recurring targets"
    ON public.recurring_targets FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_targets_rifle_recency
    ON public.recurring_targets(user_id, rifle_id, last_used_at DESC);


-- ────────────────────────────────────────────────────────────
-- PC3 — barrel_id: additive, nullable columns on the four tables
-- js/config-memory.js's checkCompatibility needs to detect a barrel
-- change (Constitution §12.2's "New barrel" row: invalidates barrel
-- round count, zero, truing applicability, group baseline). None of
-- these four tables previously recorded which barrel was active when
-- the row was written -- MIGRATION-INVENTORY.md §2 already named this
-- gap. NULL on every existing row is the honest "unknown" (never
-- backfilled/fabricated, per Amendment 1's "never invented facts");
-- only rows written after js/db.js's Phase C code (already shipped,
-- gracefully degrading until this migration runs) will carry a value.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.zero_events      ADD COLUMN IF NOT EXISTS barrel_id uuid REFERENCES public.barrels(id) ON DELETE SET NULL;
ALTER TABLE public.mv_measurements  ADD COLUMN IF NOT EXISTS barrel_id uuid REFERENCES public.barrels(id) ON DELETE SET NULL;
ALTER TABLE public.truing_events    ADD COLUMN IF NOT EXISTS barrel_id uuid REFERENCES public.barrels(id) ON DELETE SET NULL;
ALTER TABLE public.steel_strings    ADD COLUMN IF NOT EXISTS barrel_id uuid REFERENCES public.barrels(id) ON DELETE SET NULL;
