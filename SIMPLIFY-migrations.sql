-- ═══════════════════════════════════════════════════════════════
-- SIMPLIFY-migrations.sql — Build Contract v2.4 (§4.3 dope_entries)
--
-- OWNER RUNS THIS in the Supabase SQL Editor. Additive, re-runnable.
-- No tables are created, altered, or dropped; no data is touched.
-- Both statements only CREATE OR REPLACE functions so they stop
-- referencing dope_entries — a table that does NOT exist in the live
-- DB (its migration line was removed at owner review). Any function
-- that still references it throws at runtime.
--
--   1. delete_my_account — REQUIRED. The live version (from
--      MORNING/FOUNDATION migrations) deletes from dope_entries, so
--      account deletion currently fails. This is the same function
--      minus that one line. (v2.3 tables — steel_strings, steel_shots,
--      zero_events, mv_measurements, tracking_verifications,
--      truing_events, suppressors — cascade via their auth.users FKs
--      when the user row deletes, so no new lines are needed.)
--
--   2. admin_export_all — run ONLY IF you ran CROWD-DATA-migrations
--      optional step 5 (the hardened admin RPCs). Same function minus
--      the dope_entries key. If you never ran that step, skip this —
--      your live admin_export_all is the older beta-migration version
--      (also broken for the same reason; this replacement fixes it
--      either way, but note it requires is_crowd_admin() to exist).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. delete_my_account (REQUIRED) ─────────────────────────────
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

    DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- ── 2. admin_export_all (ONLY if CROWD step 5 was run) ──────────
-- Uncomment and run if applicable:
--
-- CREATE OR REPLACE FUNCTION public.admin_export_all()
-- RETURNS json
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   result json;
-- BEGIN
--   IF NOT public.is_crowd_admin() THEN
--     RAISE EXCEPTION 'Not authorized';
--   END IF;
--
--   SELECT json_build_object(
--     'exported_at',      now(),
--     'rifles',           COALESCE((SELECT json_agg(row_to_json(t)) FROM public.rifles t),           '[]'::json),
--     'barrels',          COALESCE((SELECT json_agg(row_to_json(t)) FROM public.barrels t),          '[]'::json),
--     'loads',            COALESCE((SELECT json_agg(row_to_json(t)) FROM public.loads t),            '[]'::json),
--     'sessions',         COALESCE((SELECT json_agg(row_to_json(t)) FROM public.sessions t),         '[]'::json),
--     'zero_records',     COALESCE((SELECT json_agg(row_to_json(t)) FROM public.zero_records t),     '[]'::json),
--     'scope_adjustments',COALESCE((SELECT json_agg(row_to_json(t)) FROM public.scope_adjustments t),'[]'::json),
--     'cleaning_logs',    COALESCE((SELECT json_agg(row_to_json(t)) FROM public.cleaning_logs t),    '[]'::json),
--     'ai_conversations', COALESCE((SELECT json_agg(row_to_json(t)) FROM public.ai_conversations t), '[]'::json),
--     'ai_usage_logs',    COALESCE((SELECT json_agg(row_to_json(t)) FROM public.ai_usage_logs t),    '[]'::json),
--     'velocity_strings', COALESCE((SELECT json_agg(row_to_json(t)) FROM public.velocity_strings t), '[]'::json),
--     'cold_bore_shots',  COALESCE((SELECT json_agg(row_to_json(t)) FROM public.cold_bore_shots t),  '[]'::json)
--   ) INTO result;
--   RETURN result;
-- END;
-- $$;
