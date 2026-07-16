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


-- ────────────────────────────────────────────────────────────
-- MIGRATION 2 (Step 11): self-service account deletion function
--
-- What: creates ONE NEW function, delete_my_account(). RUNNING THIS
-- MIGRATION DELETES NOTHING — it only defines the function. Data is
-- deleted only when a logged-in user taps "Delete Account" in the app,
-- and the function can only ever delete THAT USER'S OWN rows: it takes
-- no parameters and derives the target exclusively from auth.uid().
--
-- Unlike the existing admin_* RPCs (client-side gating only — known
-- issue), this function is safe under SECURITY DEFINER because the
-- caller can only ever act on themselves.
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

    -- Children first, parents last (FK order)
    DELETE FROM public.ai_usage_logs     WHERE user_id = uid;
    DELETE FROM public.ai_conversations  WHERE user_id = uid;
    DELETE FROM public.dope_entries      WHERE user_id = uid;
    DELETE FROM public.cold_bore_shots   WHERE user_id = uid;
    DELETE FROM public.velocity_strings  WHERE user_id = uid;
    DELETE FROM public.cleaning_logs     WHERE user_id = uid;
    DELETE FROM public.scope_adjustments WHERE user_id = uid;
    DELETE FROM public.zero_records      WHERE user_id = uid;
    DELETE FROM public.sessions          WHERE user_id = uid;
    DELETE FROM public.loads             WHERE user_id = uid;
    DELETE FROM public.barrels           WHERE user_id = uid;
    DELETE FROM public.rifles            WHERE user_id = uid;

    -- Their target photos in Storage
    DELETE FROM storage.objects
        WHERE bucket_id = 'session-images' AND name LIKE uid::text || '/%';

    -- Finally the auth user itself (invalidates the session)
    DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
