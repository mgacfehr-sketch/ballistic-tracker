-- ============================================================
-- yorT Admin Dashboard — Supabase SQL Functions
-- ============================================================

-- 1. admin_get_stats: counts across all tables
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
    'totalZeroRecords',     (SELECT count(*) FROM public.zero_records)
  ) INTO result;
  RETURN result;
END;
$$;

-- 2. admin_get_users: per-user summary
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
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

-- 3. admin_get_usage_summary: AI cost breakdown
CREATE OR REPLACE FUNCTION public.admin_get_usage_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  month_start timestamptz;
BEGIN
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
          COALESCE(sum(CASE WHEN l.created_at >= month_start THEN 1 ELSE 0 END), 0)    AS month_questions,
          COALESCE(sum(CASE WHEN l.created_at >= month_start THEN l.cost ELSE 0 END), 0) AS month_cost,
          count(*)              AS total_questions,
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

-- 4. admin_export_all: full data dump for backup
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
    'ai_usage_logs',    COALESCE((SELECT json_agg(row_to_json(t)) FROM public.ai_usage_logs t),    '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;
