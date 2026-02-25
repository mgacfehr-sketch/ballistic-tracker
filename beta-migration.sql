-- ============================================================
-- yorT Beta Features — Supabase SQL Migration
-- Run this in Supabase SQL Editor to create tables for
-- DOPE Log and Cold Bore Tracking beta features.
-- ============================================================

-- 1. dope_entries — Come-Up Verification / DOPE Log
CREATE TABLE IF NOT EXISTS public.dope_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id    uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id     uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    distance_yards  integer DEFAULT 0,
    elevation_moa   real DEFAULT 0,
    windage_moa     real DEFAULT 0,
    result          text DEFAULT 'hit',
    notes           text DEFAULT '',
    date            timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

-- RLS policies for dope_entries
ALTER TABLE public.dope_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own dope entries"
    ON public.dope_entries FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dope entries"
    ON public.dope_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dope entries"
    ON public.dope_entries FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dope entries"
    ON public.dope_entries FOR DELETE
    USING (auth.uid() = user_id);

-- Index for fast lookups by rifle
CREATE INDEX IF NOT EXISTS idx_dope_entries_rifle
    ON public.dope_entries(user_id, rifle_id);

-- 2. cold_bore_shots — Cold Bore Tracking
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

-- RLS policies for cold_bore_shots
ALTER TABLE public.cold_bore_shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cold bore shots"
    ON public.cold_bore_shots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cold bore shots"
    ON public.cold_bore_shots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cold bore shots"
    ON public.cold_bore_shots FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cold bore shots"
    ON public.cold_bore_shots FOR DELETE
    USING (auth.uid() = user_id);

-- Index for fast lookups by rifle
CREATE INDEX IF NOT EXISTS idx_cold_bore_shots_rifle
    ON public.cold_bore_shots(user_id, rifle_id);

-- 3. Add new tables to admin_export_all function
CREATE OR REPLACE FUNCTION public.admin_export_all()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'exported_at',      now(),
    'rifles',           COALESCE((SELECT json_agg(row_to_json(t)) FROM public.rifles t),           '[]'::json),
    'barrels',          COALESCE((SELECT json_agg(row_to_json(t)) FROM public.barrels t),          '[]'::json),
    'loads',            COALESCE((SELECT json_agg(row_to_json(t)) FROM public.loads t),            '[]'::json),
    'sessions',         COALESCE((SELECT json_agg(row_to_json(t)) FROM public.sessions t),         '[]'::json),
    'zero_records',     COALESCE((SELECT json_agg(row_to_json(t)) FROM public.zero_records t),     '[]'::json),
    'scope_adjustments',COALESCE((SELECT json_agg(row_to_json(t)) FROM public.scope_adjustments t),'[]'::json),
    'cleaning_logs',    COALESCE((SELECT json_agg(row_to_json(t)) FROM public.cleaning_logs t),    '[]'::json),
    'ai_conversations', COALESCE((SELECT json_agg(row_to_json(t)) FROM public.ai_conversations t), '[]'::json),
    'ai_usage_logs',    COALESCE((SELECT json_agg(row_to_json(t)) FROM public.ai_usage_logs t),    '[]'::json),
    'dope_entries',     COALESCE((SELECT json_agg(row_to_json(t)) FROM public.dope_entries t),     '[]'::json),
    'cold_bore_shots',  COALESCE((SELECT json_agg(row_to_json(t)) FROM public.cold_bore_shots t),  '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

-- 4. Update admin_get_stats to include new tables
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'totalRifles',          (SELECT count(*) FROM public.rifles),
    'totalSessions',        (SELECT count(*) FROM public.sessions),
    'totalBarrels',         (SELECT count(*) FROM public.barrels),
    'totalLoads',           (SELECT count(*) FROM public.loads),
    'totalConversations',   (SELECT count(*) FROM public.ai_conversations),
    'totalCleaningLogs',    (SELECT count(*) FROM public.cleaning_logs),
    'totalScopeAdjustments',(SELECT count(*) FROM public.scope_adjustments),
    'totalZeroRecords',     (SELECT count(*) FROM public.zero_records),
    'totalDopeEntries',     (SELECT count(*) FROM public.dope_entries),
    'totalColdBoreShots',   (SELECT count(*) FROM public.cold_bore_shots)
  ) INTO result;
  RETURN result;
END;
$$;
