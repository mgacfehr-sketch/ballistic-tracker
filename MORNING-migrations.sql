-- ════════════════════════════════════════════════════════════
-- MORNING-migrations.sql — run top-to-bottom in the Supabase SQL
-- Editor. Accumulated during the overnight Stage A build.
--
-- Every block is ADDITIVE / NON-DESTRUCTIVE: no existing rows are
-- modified or deleted, no existing columns/tables/functions are
-- altered or dropped. Safe to re-run (IF NOT EXISTS / OR REPLACE
-- on NEW objects only).
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- MIGRATION 1 (Step 6): rifle build-sheet columns
--
-- What: six new OPTIONAL text columns on public.rifles for the
-- Certificate of Performance build sheet.
-- Safety: ADD COLUMN IF NOT EXISTS with no defaults on existing
-- rows beyond NULL — existing rifle rows are untouched.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS barrel_spec text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS trigger_spec text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS chassis text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS muzzle_device text;
