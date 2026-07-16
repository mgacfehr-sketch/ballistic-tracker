-- ════════════════════════════════════════════════════════════
-- FOUNDATION-migrations.sql — run in the Supabase SQL Editor.
-- Foundation layer (Home / cards / tool registry / wizard).
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- MIGRATION 1: user_settings — cross-device key/value store for
-- tool activations, onboarding state, and future preferences.
-- ADDITIVE: new table + RLS + nothing else touched.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key        text NOT NULL,
    value      jsonb,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
    ON public.user_settings FOR DELETE
    USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 2 — ⚠ REVIEW BEFORE RUNNING: this RE-CREATES the
-- existing delete_my_account() function (CREATE OR REPLACE of a
-- deployed object) to add ONE line: cleaning up the new
-- user_settings rows so account deletion stays complete for
-- store compliance. The function body is otherwise identical to
-- the one you already ran in MORNING-migrations.sql. Running it
-- deletes nothing by itself; skip it if you prefer, and account
-- deletion will simply leave orphaned user_settings rows behind
-- (they cascade away via the FK anyway when auth.users deletes —
-- this change just makes the cleanup explicit and ordered).
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

    DELETE FROM public.user_settings     WHERE user_id = uid;
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

    DELETE FROM storage.objects
        WHERE bucket_id = 'session-images' AND name LIKE uid::text || '/%';

    DELETE FROM auth.users WHERE id = uid;
END;
$$;
