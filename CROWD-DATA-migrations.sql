-- ════════════════════════════════════════════════════════════
-- CROWD-DATA-migrations.sql — run top-to-bottom in the Supabase
-- SQL Editor. Crowd Data Warehouse (admin-only, anonymized export).
--
-- Every REQUIRED block is ADDITIVE / NON-DESTRUCTIVE: no existing
-- rows are modified or deleted, no existing columns/tables/functions
-- are altered or dropped. Safe to re-run (IF NOT EXISTS on tables,
-- OR REPLACE on NEW functions only, seed inserts are idempotent).
--
-- PREREQUISITES (must already be applied):
--   1. admin-migration.sql            (existing admin_* RPCs)
--   2. velocity-strings-migration.sql (velocity_strings table)
--   3. MORNING-migrations.sql M1      (rifles.barrel_spec /
--                                      rifles.muzzle_device columns)
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- MIGRATION 1: admin_users table — SERVER-SIDE admin registry
--
-- What: one new table listing admin user ids, seeded with the
-- current admin. RLS is enabled with NO policies, so the table is
-- completely invisible/unwritable through the client API; only
-- SECURITY DEFINER functions (below) can read it.
-- Safety: creates one table + inserts one row. Touches nothing else.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_users FROM anon;
REVOKE ALL ON TABLE public.admin_users FROM authenticated;

-- Seed the current admin (same UUID the client UI already gates on).
-- Idempotent: re-running does nothing.
INSERT INTO public.admin_users (user_id)
VALUES ('7288736c-d421-47e1-8562-b51dcdabd805')
ON CONFLICT (user_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 2: crowd_export_config — server-generated anon salt
--
-- What: one new single-row table holding a random salt used to
-- derive opaque shooter keys. The salt is generated INSIDE the
-- database on first run and never appears in the repo or the
-- client, so exported shooter keys cannot be linked back to
-- user ids by anyone holding only the export + source code.
-- RLS enabled with no policies: invisible to the client API.
-- Safety: creates one table + inserts one row. Idempotent.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crowd_export_config (
    id        integer PRIMARY KEY CHECK (id = 1),
    anon_salt text NOT NULL
);

ALTER TABLE public.crowd_export_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crowd_export_config FROM anon;
REVOKE ALL ON TABLE public.crowd_export_config FROM authenticated;

INSERT INTO public.crowd_export_config (id, anon_salt)
SELECT 1, gen_random_uuid()::text || gen_random_uuid()::text
WHERE NOT EXISTS (SELECT 1 FROM public.crowd_export_config WHERE id = 1);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 3: is_crowd_admin() — server-side admin check
--
-- What: one NEW helper function. Returns true only when the
-- CALLER's JWT identity (auth.uid()) is present in admin_users.
-- This is the check the crowd RPC (and optionally the legacy
-- admin_* RPCs, Migration 5) enforce server-side — unlike the
-- original admin_* pattern, a non-admin calling the RPC directly
-- gets an exception, not data.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_crowd_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_crowd_admin() FROM public;
REVOKE ALL ON FUNCTION public.is_crowd_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_crowd_admin() TO authenticated;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 4: crowd_get_data() — the warehouse RPC
--
-- What: one NEW function returning every velocity string across
-- ALL users, joined with rifle/barrel/load specs and same-trip
-- session group data, ANONYMIZED:
--   • user_id is replaced by shooter_key = 'shooter_' + salted
--     md5 prefix — stable per shooter, not reversible from exports
--   • NO emails, names, serials, free-text notes, or file names
--     are included (sheet_name and notes are deliberately omitted)
--
-- Session match rule (raw organization, not analysis): a session
-- row is attached when it belongs to the same user AND same rifle,
-- has a compatible load (equal, or either side unassigned), and
-- was shot within ±24 hours of the velocity string. A string that
-- matches N sessions produces N rows; a string with no matching
-- session produces one row with the session fields null.
--
-- Server-side authorization: raises 'Not authorized' unless the
-- caller is in admin_users. This is the corrected pattern that
-- readiness item S1 calls for.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crowd_get_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_salt text;
    result json;
BEGIN
    IF NOT public.is_crowd_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT anon_salt INTO v_salt FROM public.crowd_export_config WHERE id = 1;
    IF v_salt IS NULL THEN
        RAISE EXCEPTION 'crowd_export_config not seeded - run Migration 2 of CROWD-DATA-migrations.sql';
    END IF;

    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
    FROM (
        SELECT
            'shooter_' || substr(md5(vs.user_id::text || v_salt), 1, 10) AS shooter_key,

            -- velocity string
            vs.id::text                                   AS string_id,
            vs.date                                       AS string_date,
            vs.source                                     AS source,
            vs.avg_fps                                    AS avg_fps,
            vs.sd_fps                                     AS sd_fps,
            vs.es_fps                                     AS es_fps,
            COALESCE(jsonb_array_length(COALESCE(vs.shots, '[]'::jsonb)), 0) AS shot_count,
            (SELECT string_agg(e.shot->>'fps', ';' ORDER BY e.ord)
               FROM jsonb_array_elements(COALESCE(vs.shots, '[]'::jsonb))
                    WITH ORDINALITY AS e(shot, ord))      AS shot_velocities,
            vs.round_count_at                             AS round_count_at,

            -- rifle / barrel spec (session snapshot as fallback)
            COALESCE(r.caliber, s.rifle_caliber)          AS caliber,
            r.barrel_spec                                 AS barrel_spec,
            r.muzzle_device                               AS muzzle_device,
            b.twist_rate                                  AS twist_rate,
            b.twist_direction                             AS twist_direction,

            -- load / ammo (session snapshot as fallback)
            COALESCE(l.name, s.load_name)                 AS load_name,
            COALESCE(l.bullet_name, s.load_bullet_name)   AS bullet_name,
            COALESCE(l.bullet_weight, s.load_bullet_weight) AS bullet_weight,
            l.bullet_diameter                             AS bullet_diameter,
            l.bullet_bc                                   AS bullet_bc,
            l.drag_model                                  AS drag_model,
            l.muzzle_velocity                             AS nominal_velocity,

            -- matched session (group data)
            s.id::text                                    AS session_id,
            s.date                                        AS session_date,
            s.distance_yards                              AS distance_yards,
            s.rounds_fired                                AS rounds_fired,
            s.measured_velocity                           AS session_measured_velocity,
            (s.results->>'groupSizeInches')::real         AS group_size_inches,
            (s.results->>'groupSizeMOA')::real            AS group_size_moa,
            (s.results->>'meanRadiusInches')::real        AS mean_radius_inches,
            (s.results->>'meanRadiusMOA')::real           AS mean_radius_moa,

            -- conditions snapshot from the matched session
            (s.weather->>'tempF')::real                   AS temp_f,
            (s.weather->>'humidity')::real                AS humidity_pct,
            (s.weather->>'windMph')::real                 AS wind_mph,
            s.weather->>'windDir'                         AS wind_dir,
            (s.weather->>'altitudeFt')::real              AS altitude_ft,
            (s.weather->>'pressureInHg')::real            AS pressure_in_hg

        FROM public.velocity_strings vs
        LEFT JOIN public.rifles  r ON r.id = vs.rifle_id
        LEFT JOIN public.barrels b ON b.id = vs.barrel_id
        LEFT JOIN public.loads   l ON l.id = vs.load_id
        LEFT JOIN public.sessions s
            ON  s.user_id = vs.user_id
            AND vs.rifle_id IS NOT NULL
            AND s.rifle_id = vs.rifle_id
            AND (vs.load_id IS NULL OR s.load_id IS NULL OR s.load_id = vs.load_id)
            AND vs.date IS NOT NULL
            AND s.date IS NOT NULL
            AND abs(extract(epoch FROM (s.date::timestamptz - vs.date))) <= 86400
        ORDER BY vs.date DESC NULLS LAST, vs.created_at DESC
    ) t;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.crowd_get_data() FROM public;
REVOKE ALL ON FUNCTION public.crowd_get_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.crowd_get_data() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- MIGRATION 5 (OPTIONAL — read before running):
-- S1 hardening of the four EXISTING admin_* RPCs
--
-- ⚠ This block MODIFIES existing functions (CREATE OR REPLACE on
-- admin_get_stats / admin_get_users / admin_get_usage_summary /
-- admin_export_all). It deletes or changes NO data and returns the
-- same shapes the dashboard already consumes — the only behavior
-- change is that non-admin callers now get 'Not authorized' instead
-- of everyone's data. It fully closes readiness item S1.
-- admin_export_all additionally gains velocity_strings, dope_entries
-- and cold_bore_shots (the additions deferred in
-- velocity-strings-migration.sql).
--
-- Skip this block if you want this run to be strictly new-objects-
-- only; Migrations 1–4 do not depend on it. Run it before any store
-- submission per STAGE-C-READINESS.md S1.
-- Requires Migrations 1 & 3 (admin_users + is_crowd_admin) first.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_crowd_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'totalRifles',          (SELECT count(*) FROM public.rifles),
    'totalSessions',        (SELECT count(*) FROM public.sessions),
    'totalBarrels',         (SELECT count(*) FROM public.barrels),
    'totalLoads',           (SELECT count(*) FROM public.loads),
    'totalConversations',   (SELECT count(*) FROM public.ai_conversations),
    'totalCleaningLogs',    (SELECT count(*) FROM public.cleaning_logs),
    'totalScopeAdjustments',(SELECT count(*) FROM public.scope_adjustments),
    'totalZeroRecords',     (SELECT count(*) FROM public.zero_records)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_crowd_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      u.id                AS user_id,
      u.email             AS email,
      COALESCE(r.cnt, 0)  AS rifle_count,
      COALESCE(s.cnt, 0)  AS session_count,
      COALESCE(ai.cnt, 0) AS ai_question_count,
      GREATEST(r.latest, s.latest, ai.latest) AS last_active
    FROM auth.users u
    LEFT JOIN (
      SELECT user_id, count(*) AS cnt, max(updated_at) AS latest
      FROM public.rifles GROUP BY user_id
    ) r ON r.user_id = u.id
    LEFT JOIN (
      SELECT user_id, count(*) AS cnt, max(updated_at) AS latest
      FROM public.sessions GROUP BY user_id
    ) s ON s.user_id = u.id
    LEFT JOIN (
      SELECT user_id, count(*) AS cnt, max(created_at) AS latest
      FROM public.ai_usage_logs GROUP BY user_id
    ) ai ON ai.user_id = u.id
    ORDER BY last_active DESC NULLS LAST
  ) t;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_usage_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  month_start timestamptz;
BEGIN
  IF NOT public.is_crowd_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  month_start := date_trunc('month', now());

  SELECT json_build_object(
    'thisMonth', (
      SELECT json_build_object(
        'totalQuestions', count(*),
        'totalCost',      COALESCE(sum(cost), 0)
      )
      FROM public.ai_usage_logs
      WHERE created_at >= month_start
    ),
    'allTime', (
      SELECT json_build_object(
        'totalQuestions', count(*),
        'totalCost',      COALESCE(sum(cost), 0)
      )
      FROM public.ai_usage_logs
    ),
    'perUser', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          l.user_id,
          u.email,
          COALESCE(sum(CASE WHEN l.created_at >= month_start THEN 1 ELSE 0 END), 0)      AS month_questions,
          COALESCE(sum(CASE WHEN l.created_at >= month_start THEN l.cost ELSE 0 END), 0) AS month_cost,
          count(*)                 AS total_questions,
          COALESCE(sum(l.cost), 0) AS total_cost
        FROM public.ai_usage_logs l
        LEFT JOIN auth.users u ON u.id = l.user_id
        GROUP BY l.user_id, u.email
        ORDER BY total_cost DESC
      ) t
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_all()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_crowd_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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
    'velocity_strings', COALESCE((SELECT json_agg(row_to_json(t)) FROM public.velocity_strings t), '[]'::json),
    'dope_entries',     COALESCE((SELECT json_agg(row_to_json(t)) FROM public.dope_entries t),     '[]'::json),
    'cold_bore_shots',  COALESCE((SELECT json_agg(row_to_json(t)) FROM public.cold_bore_shots t),  '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_stats()         FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_get_users()         FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_get_usage_summary() FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_export_all()        FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_stats()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_users()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_usage_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_all()        TO authenticated;
