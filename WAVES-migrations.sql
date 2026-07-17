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
ALTER TABLE public.cold_bore_shots  ADD COLUMN IF NOT EXISTS config text;
ALTER TABLE public.zero_records     ADD COLUMN IF NOT EXISTS config text;
