-- ═══════════════════════════════════════════════════════════════
-- SIMPLE-migrations.sql — Build Contract v2.5 field audit fix
--
-- OWNER RUNS THIS in the Supabase SQL Editor. Additive, re-runnable,
-- ADD COLUMN IF NOT EXISTS only — no data is touched, no table is
-- created or dropped.
--
-- WHAT HAPPENED: v2.5 step 7 (offline sync visibility) restored five
-- fields to db.js addSession() that had been silently dropped by an
-- old whitelist. Two of them (suppressor_id, lot_number) are real
-- columns — REORG-migrations.sql added them. The other five were
-- NEVER actually added to `sessions`: they were only referenced in a
-- COALESCE fallback inside CROWD-DATA-migrations.sql's admin export
-- query (a separate branch, written for a future state that never
-- shipped here). Sending them to a live INSERT threw:
--   "Could not find the 'load_bullet_name' column of 'sessions'
--    in the schema cache"
-- js/db.js now degrades gracefully (strips these fields and retries)
-- until this migration runs — so the app does not hard-fail either
-- way. But per the data principle "snapshot, not references" (CLAUDE.md
-- rule 7 / STANDARDS.md §6.2), these columns belong on the table: they
-- let a session keep its rifle/load's name and specs even after the
-- rifle or load is later renamed or deleted. Adding them for real.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS rifle_name         text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS rifle_caliber      text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS load_name          text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS load_bullet_name   text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS load_bullet_weight numeric;
