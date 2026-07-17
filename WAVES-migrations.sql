-- ════════════════════════════════════════════════════════════
-- WAVES-migrations.sql — run top-to-bottom in the Supabase SQL
-- Editor. Feature Waves 1–3 on the foundation layer.
-- Every block is ADDITIVE / NON-DESTRUCTIVE and re-runnable.
-- (Blocks appended per feature during the overnight build.)
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- MIGRATION 1 (F1 scope tracking): per-rifle scope facts.
-- ADD COLUMN IF NOT EXISTS only; existing rows untouched (NULL).
-- Decision (noted in WAVES-REPORT): correction lives ON THE RIFLE,
-- not a separate scope entity — a scope entity is deferred until
-- scope-swapping demand exists.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS scope_click_value real;          -- MOA per click (0.25 default in UI)
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS scope_correction_factor real;    -- actual/expected travel (0.96 = clicks 4% small)
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS scope_tracking_tested_at timestamptz;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS scope_cant_warn boolean;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 2 (F2 suppressor configs): two-state configuration.
-- config values: 'bare' | 'suppressed'. All additive.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rifles           ADD COLUMN IF NOT EXISTS has_configs boolean;
ALTER TABLE public.rifles           ADD COLUMN IF NOT EXISTS active_config text;
ALTER TABLE public.rifles           ADD COLUMN IF NOT EXISTS config_velocity_delta real;  -- suppressed minus bare, fps (measured)
ALTER TABLE public.rifles           ADD COLUMN IF NOT EXISTS config_poi_shift jsonb;      -- {elevMOA, windMOA} suppressed minus bare
ALTER TABLE public.sessions         ADD COLUMN IF NOT EXISTS config text;
ALTER TABLE public.velocity_strings ADD COLUMN IF NOT EXISTS config text;
ALTER TABLE public.zero_records     ADD COLUMN IF NOT EXISTS config text;

-- cold_bore_shots is only created by beta-migration.sql, which was never
-- run on the live database (beta features are hard-disabled). The live
-- cold-bore feature stores auto-derived data in sessions.cold_bore
-- (cold-bore-migration.sql), but js/db.js still writes MANUAL cold-bore
-- entries to this table — so create it here if missing (definition
-- copied verbatim from beta-migration.sql), then tag it with config.
CREATE TABLE IF NOT EXISTS public.cold_bore_shots (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id            uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    distance_yards      integer DEFAULT 100,
    condition           text DEFAULT 'clean_cold',
    elevation_offset_moa real DEFAULT 0,
    windage_offset_moa  real DEFAULT 0,
    notes               text DEFAULT '',
    date                timestamptz DEFAULT now(),
    created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.cold_bore_shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own cold bore shots" ON public.cold_bore_shots;
CREATE POLICY "Users can read own cold bore shots"
    ON public.cold_bore_shots FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own cold bore shots" ON public.cold_bore_shots;
CREATE POLICY "Users can insert own cold bore shots"
    ON public.cold_bore_shots FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own cold bore shots" ON public.cold_bore_shots;
CREATE POLICY "Users can update own cold bore shots"
    ON public.cold_bore_shots FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own cold bore shots" ON public.cold_bore_shots;
CREATE POLICY "Users can delete own cold bore shots"
    ON public.cold_bore_shots FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cold_bore_shots_rifle
    ON public.cold_bore_shots(user_id, rifle_id);

ALTER TABLE public.cold_bore_shots ADD COLUMN IF NOT EXISTS config text;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 3 (F4/F5 field logging + wind grader): field_shots.
-- One row per logged STRING ("7 of 10 at 600, prone"), with an
-- optional pre-shot wind call and post-shot actual for the grader.
-- ADDITIVE: new table + RLS + index only.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_shots (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id       uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id        uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    date           timestamptz DEFAULT now(),
    distance_yards integer,
    hits           integer,
    shots          integer,
    position       text,                -- 'prone' | 'seated' | 'standing' | 'barricade'
    config         text,                -- suppressor config tag
    weather        jsonb,               -- auto-attached conditions snapshot
    wind_call      jsonb,               -- {mph, value: 'full-left'|'half-left'|'none'|'half-right'|'full-right'}
    wind_actual    jsonb,               -- {errorMil: signed; + = called under (needed more)}
    notes          text DEFAULT '',
    created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.field_shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own field shots" ON public.field_shots;
CREATE POLICY "Users can read own field shots"
    ON public.field_shots FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own field shots" ON public.field_shots;
CREATE POLICY "Users can insert own field shots"
    ON public.field_shots FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own field shots" ON public.field_shots;
CREATE POLICY "Users can update own field shots"
    ON public.field_shots FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own field shots" ON public.field_shots;
CREATE POLICY "Users can delete own field shots"
    ON public.field_shots FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_field_shots_rifle
    ON public.field_shots(user_id, rifle_id);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 4 (F7 lot manager): lot numbers on loads and strings.
-- ADDITIVE only.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.loads            ADD COLUMN IF NOT EXISTS lot_number text;
ALTER TABLE public.velocity_strings ADD COLUMN IF NOT EXISTS lot_number text;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 5 (F8 recipes): structured handload recipe on the load.
-- jsonb: { brass:{make,lot,timesFired}, primer:{make,lot},
--          powder:{make,lot,chargeGr}, bullet:{make,lot},
--          seatingDepthIn }
-- ADDITIVE only.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS recipe jsonb;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 6 (F9 ladder test): ladder sessions ride the existing
-- session engine. session_type: 'standard' (null) | 'ladder'.
-- ladder jsonb: { shotsPerGroup, series:[{label, indices, centroidYIn,
--                 sizeMOA, avgFps|null}], window:{startLabel, endLabel}|null }
-- ADDITIVE only.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS session_type text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ladder jsonb;
