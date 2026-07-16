-- ============================================================
-- yorT Velocity Strings — Supabase SQL Migration (Stage A Step 3)
-- Run this in the Supabase SQL Editor.
--
-- ADDITIVE ONLY: creates one new table + RLS + index.
-- Touches no existing tables, rows, or functions.
-- ============================================================

-- velocity_strings — one imported chronograph string (a session of shots)
CREATE TABLE IF NOT EXISTS public.velocity_strings (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id          uuid REFERENCES public.rifles(id) ON DELETE CASCADE,   -- null until assigned
    load_id           uuid REFERENCES public.loads(id) ON DELETE SET NULL,   -- null until confirmed
    barrel_id         uuid REFERENCES public.barrels(id) ON DELETE SET NULL,
    date              timestamptz,                 -- when the string was shot
    source            text DEFAULT 'manual',       -- 'garmin_csv' | 'garmin_xlsx' | 'manual'
    sheet_name        text DEFAULT '',             -- original sheet/file label
    shots             jsonb NOT NULL DEFAULT '[]', -- [{shot, fps, time}]
    avg_fps           real,                        -- population stats, Garmin convention
    sd_fps            real,
    es_fps            real,
    round_count_at    integer,                     -- barrel round count when this string was shot
    assignment_status text DEFAULT 'unassigned',   -- 'unassigned' | 'suggested' | 'confirmed' | 'ambiguous'
    notes             text DEFAULT '',
    created_at        timestamptz DEFAULT now()
);

-- RLS policies for velocity_strings
ALTER TABLE public.velocity_strings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own velocity strings"
    ON public.velocity_strings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own velocity strings"
    ON public.velocity_strings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own velocity strings"
    ON public.velocity_strings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own velocity strings"
    ON public.velocity_strings FOR DELETE
    USING (auth.uid() = user_id);

-- Index for fast lookups by rifle
CREATE INDEX IF NOT EXISTS idx_velocity_strings_rifle
    ON public.velocity_strings(user_id, rifle_id);

-- NOTE (deferred): admin_export_all / admin_get_stats are NOT updated here
-- to keep this migration purely additive. Velocity strings will be added to
-- the admin export in a later step.
