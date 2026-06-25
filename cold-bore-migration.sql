-- ============================================================
-- yorT Cold Bore Auto-Tracking + Shot Order — Supabase Migration
-- Adds session-level cold-bore storage. Additive only — no data loss.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Add cold_bore column to sessions for auto-derived shot #1 offsets.
-- Older sessions (no shot order) simply have cold_bore = null.
ALTER TABLE public.sessions
    ADD COLUMN IF NOT EXISTS cold_bore jsonb;

-- impacts column is already jsonb; per-impact shotNumber is stored
-- inside the existing JSON array, no schema change needed for that.
