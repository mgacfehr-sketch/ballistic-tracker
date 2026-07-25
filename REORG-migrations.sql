-- ════════════════════════════════════════════════════════════
-- REORG-migrations.sql — Range-Day Reorganization (Contract v2.3)
-- Run top-to-bottom in the Supabase SQL Editor, ONCE, after
-- external review. Every block is ADDITIVE / NON-DESTRUCTIVE and
-- safely RE-RUNNABLE (IF NOT EXISTS everywhere; policies guarded
-- with DROP POLICY IF EXISTS; triggers guarded with DROP TRIGGER
-- IF EXISTS). Nothing here deletes, renames, or rewrites data.
--
-- The app on the `redesign` branch is built assuming this ran.
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- MIGRATION R0 — updated_at plumbing (offline sync, Part 0.6 #1).
-- One shared trigger function; column + trigger added per table
-- below. The trigger keeps updated_at honest server-side without
-- touching js/db.js write paths. Offline conflict resolution does
-- NOT compare updated_at (client wins unconditionally by design);
-- this column is for audit/analytics/future sync improvements.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- updated_at on the existing tables the offline queue can write.
ALTER TABLE public.sessions          ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.velocity_strings  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.field_shots       ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.cold_bore_shots   ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.zero_records      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.scope_adjustments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.cleaning_logs     ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.loads             ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.barrels           ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS trg_sessions_updated_at          ON public.sessions;
CREATE TRIGGER trg_sessions_updated_at          BEFORE UPDATE ON public.sessions          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_velocity_strings_updated_at  ON public.velocity_strings;
CREATE TRIGGER trg_velocity_strings_updated_at  BEFORE UPDATE ON public.velocity_strings  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_field_shots_updated_at       ON public.field_shots;
CREATE TRIGGER trg_field_shots_updated_at       BEFORE UPDATE ON public.field_shots       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_cold_bore_shots_updated_at   ON public.cold_bore_shots;
CREATE TRIGGER trg_cold_bore_shots_updated_at   BEFORE UPDATE ON public.cold_bore_shots   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_zero_records_updated_at      ON public.zero_records;
CREATE TRIGGER trg_zero_records_updated_at      BEFORE UPDATE ON public.zero_records      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_scope_adjustments_updated_at ON public.scope_adjustments;
CREATE TRIGGER trg_scope_adjustments_updated_at BEFORE UPDATE ON public.scope_adjustments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_cleaning_logs_updated_at     ON public.cleaning_logs;
CREATE TRIGGER trg_cleaning_logs_updated_at     BEFORE UPDATE ON public.cleaning_logs     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_loads_updated_at             ON public.loads;
CREATE TRIGGER trg_loads_updated_at             BEFORE UPDATE ON public.loads             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_barrels_updated_at           ON public.barrels;
CREATE TRIGGER trg_barrels_updated_at           BEFORE UPDATE ON public.barrels           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- MIGRATION R1 — Suppressor library (§1.3b).
-- Per-user suppressor entities. All shift/velocity analytics
-- group by (rifle_id, suppressor_id). Config tagging becomes
-- Bare (suppressor_id NULL) | <specific can> (suppressor_id set).
-- The legacy rifles.has_configs / active_config / config columns
-- REMAIN for back-compat and are superseded in the UI, never
-- dropped.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppressors (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name       text NOT NULL,
    brand      text,
    model      text,
    length_in  real,
    weight_oz  real,
    notes      text DEFAULT '',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.suppressors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own suppressors" ON public.suppressors;
CREATE POLICY "Users can read own suppressors"
    ON public.suppressors FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own suppressors" ON public.suppressors;
CREATE POLICY "Users can insert own suppressors"
    ON public.suppressors FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own suppressors" ON public.suppressors;
CREATE POLICY "Users can update own suppressors"
    ON public.suppressors FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own suppressors" ON public.suppressors;
CREATE POLICY "Users can delete own suppressors"
    ON public.suppressors FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_suppressors_user ON public.suppressors(user_id);

DROP TRIGGER IF EXISTS trg_suppressors_updated_at ON public.suppressors;
CREATE TRIGGER trg_suppressors_updated_at BEFORE UPDATE ON public.suppressors
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Nullable suppressor tag on every record type that can be shot
-- suppressed (NULL = bare). ON DELETE SET NULL: deleting a can
-- from the library never deletes shooting records.
ALTER TABLE public.sessions         ADD COLUMN IF NOT EXISTS suppressor_id uuid REFERENCES public.suppressors(id) ON DELETE SET NULL;
ALTER TABLE public.velocity_strings ADD COLUMN IF NOT EXISTS suppressor_id uuid REFERENCES public.suppressors(id) ON DELETE SET NULL;
ALTER TABLE public.zero_records     ADD COLUMN IF NOT EXISTS suppressor_id uuid REFERENCES public.suppressors(id) ON DELETE SET NULL;
ALTER TABLE public.cold_bore_shots  ADD COLUMN IF NOT EXISTS suppressor_id uuid REFERENCES public.suppressors(id) ON DELETE SET NULL;
ALTER TABLE public.field_shots      ADD COLUMN IF NOT EXISTS suppressor_id uuid REFERENCES public.suppressors(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- MIGRATION R2 — Session lot + environment provenance (§2.1, §2.5a).
-- lot_number asked every session ("Lot 3120-A — same as last time").
-- Lot drift computes silently from session/string lot tags — no
-- separate lot-manager entity (owner decision).
-- Environment: the existing sessions.weather jsonb remains the
-- environment snapshot; the app now writes a `source` field inside
-- it ('measured'|'manual'|'lookup'|'default') per the provenance
-- rule (Part 0.6 #3). No new column needed — documented here.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS lot_number text;


-- ────────────────────────────────────────────────────────────
-- MIGRATION R3 — Steel Session (§2.2): strings + per-shot rows.
-- NEW TABLES (decision, noted in REORG-REPORT.md): field_shots
-- stays as the legacy string-level hit/miss aggregate (casual
-- logging keeps working); full steel logging gets proper per-shot
-- rows. units: 'MOA' | 'MIL' | 'IN' (per-rifle preference).
-- wind jsonb: {clock: 1-12, mph, flagged: bool}
-- environment jsonb: {tempF, pressureInHg|altitudeFt, humidity, source}
-- held_* : the shooter's sticky hold IN ADDITION to the dialed
-- correction (default 0/0 = dialed everything).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.steel_strings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id              uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id               uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    session_date          timestamptz DEFAULT now(),
    distance_yd           integer NOT NULL,
    tier                  text DEFAULT 'full',        -- 'casual' | 'full'
    dialed_elev           real DEFAULT 0,             -- in `units`
    dialed_wind           real DEFAULT 0,             -- in `units`, + = right
    units                 text DEFAULT 'MOA',         -- 'MOA' | 'MIL' | 'IN'
    wind                  jsonb,                      -- {clock, mph, flagged}
    direction_of_fire_deg real,                       -- 0-360 true; captured >= 800 yd
    dof_source            text,                       -- 'compass' | 'manual'
    environment           jsonb,                      -- {tempF, pressureInHg, humidity, source}
    suppressor_id         uuid REFERENCES public.suppressors(id) ON DELETE SET NULL,
    lot_number            text,
    photo_ref             text,                       -- Storage path, casual photo mode
    notes                 text DEFAULT '',
    created_at            timestamptz DEFAULT now(),
    updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.steel_strings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own steel strings" ON public.steel_strings;
CREATE POLICY "Users can read own steel strings"
    ON public.steel_strings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own steel strings" ON public.steel_strings;
CREATE POLICY "Users can insert own steel strings"
    ON public.steel_strings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own steel strings" ON public.steel_strings;
CREATE POLICY "Users can update own steel strings"
    ON public.steel_strings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own steel strings" ON public.steel_strings;
CREATE POLICY "Users can delete own steel strings"
    ON public.steel_strings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_steel_strings_rifle
    ON public.steel_strings(user_id, rifle_id);

DROP TRIGGER IF EXISTS trg_steel_strings_updated_at ON public.steel_strings;
CREATE TRIGGER trg_steel_strings_updated_at BEFORE UPDATE ON public.steel_strings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.steel_shots (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    string_id     uuid NOT NULL REFERENCES public.steel_strings(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seq           integer NOT NULL,           -- shot 1..N within the string
    elev_off      real DEFAULT 0,             -- impact offset, + = HIGH, in `units`
    wind_off      real DEFAULT 0,             -- impact offset, + = RIGHT, in `units`
    units         text DEFAULT 'MOA',
    held_elev     real DEFAULT 0,             -- sticky hold at this shot (+ = held high)
    held_wind     real DEFAULT 0,             -- sticky hold at this shot (+ = held right)
    mv_fps        real,                       -- optional per-shot velocity
    mv_source     text,                       -- 'manual' | 'shotview' | 'labradar'
    wind_override jsonb,                      -- {clock, mph} gust override, else NULL
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.steel_shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own steel shots" ON public.steel_shots;
CREATE POLICY "Users can read own steel shots"
    ON public.steel_shots FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own steel shots" ON public.steel_shots;
CREATE POLICY "Users can insert own steel shots"
    ON public.steel_shots FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own steel shots" ON public.steel_shots;
CREATE POLICY "Users can update own steel shots"
    ON public.steel_shots FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own steel shots" ON public.steel_shots;
CREATE POLICY "Users can delete own steel shots"
    ON public.steel_shots FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_steel_shots_string
    ON public.steel_shots(user_id, string_id);

DROP TRIGGER IF EXISTS trg_steel_shots_updated_at ON public.steel_shots;
CREATE TRIGGER trg_steel_shots_updated_at BEFORE UPDATE ON public.steel_shots
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ────────────────────────────────────────────────────────────
-- MIGRATION R4 — Calibration events (§2.10, Part 0.6 #2).
-- APPEND-ONLY event tables. The Calibration Status card DERIVES
-- state from these; rifle/load columns are cached "current"
-- values pointing at their source events — never the only copy.
-- zero_records (legacy) remains untouched; zero_events is the
-- new append-only feed written by confirmed-zero sessions.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zero_events (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id       uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id        uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    session_id     uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
    date           timestamptz DEFAULT now(),
    distance_yards integer,
    shot_count     integer,
    group_data     jsonb,                     -- results snapshot {groupSizeMOA, atzElevationMOA, atzWindageMOA, meanRadius...}
    suppressor_id  uuid REFERENCES public.suppressors(id) ON DELETE SET NULL,
    lot_number     text,
    source         text DEFAULT 'session',    -- 'session' | 'manual' | 'factory'
    created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.zero_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own zero events" ON public.zero_events;
CREATE POLICY "Users can read own zero events"
    ON public.zero_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own zero events" ON public.zero_events;
CREATE POLICY "Users can insert own zero events"
    ON public.zero_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own zero events" ON public.zero_events;
CREATE POLICY "Users can update own zero events"
    ON public.zero_events FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own zero events" ON public.zero_events;
CREATE POLICY "Users can delete own zero events"
    ON public.zero_events FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_zero_events_rifle
    ON public.zero_events(user_id, rifle_id);

CREATE TABLE IF NOT EXISTS public.mv_measurements (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id           uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id            uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    velocity_string_id uuid REFERENCES public.velocity_strings(id) ON DELETE SET NULL,
    date               timestamptz DEFAULT now(),
    value              real NOT NULL,          -- average fps
    sd                 real,                   -- population SD (Garmin convention)
    es                 real,
    shot_count         integer,
    lot_number         text,
    suppressor_id      uuid REFERENCES public.suppressors(id) ON DELETE SET NULL,
    source             text DEFAULT 'manual',  -- 'shotview' | 'labradar' | 'manual' | 'factory'
    created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.mv_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own mv measurements" ON public.mv_measurements;
CREATE POLICY "Users can read own mv measurements"
    ON public.mv_measurements FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own mv measurements" ON public.mv_measurements;
CREATE POLICY "Users can insert own mv measurements"
    ON public.mv_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own mv measurements" ON public.mv_measurements;
CREATE POLICY "Users can update own mv measurements"
    ON public.mv_measurements FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own mv measurements" ON public.mv_measurements;
CREATE POLICY "Users can delete own mv measurements"
    ON public.mv_measurements FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mv_measurements_rifle
    ON public.mv_measurements(user_id, rifle_id);

CREATE TABLE IF NOT EXISTS public.tracking_verifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id    uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    date        timestamptz DEFAULT now(),
    factor      real NOT NULL,                -- actual/expected travel (1.0 = true)
    click_value real,                         -- MOA per click as tested
    cant_warn   boolean,
    method      text DEFAULT 'tall-target',
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.tracking_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tracking verifications" ON public.tracking_verifications;
CREATE POLICY "Users can read own tracking verifications"
    ON public.tracking_verifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own tracking verifications" ON public.tracking_verifications;
CREATE POLICY "Users can insert own tracking verifications"
    ON public.tracking_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own tracking verifications" ON public.tracking_verifications;
CREATE POLICY "Users can update own tracking verifications"
    ON public.tracking_verifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own tracking verifications" ON public.tracking_verifications;
CREATE POLICY "Users can delete own tracking verifications"
    ON public.tracking_verifications FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tracking_verifications_rifle
    ON public.tracking_verifications(user_id, rifle_id);


-- ────────────────────────────────────────────────────────────
-- MIGRATION R5 — Truing events (§2.5, Part 0.6 #2). APPEND-ONLY.
-- Re-truing adds an event; it never erases the old one.
-- close/far jsonb: {rangeYds, observed...} point summaries.
-- inputs jsonb: env + direction-of-fire + prerequisites snapshot
--   + data checklist state at truing time.
-- ledger jsonb: the normalization ledger for the "Why?" expander
--   (raw miss − velocity effect − wind effect − Coriolis = trued
--   residual, per observation).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.truing_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id        uuid NOT NULL REFERENCES public.rifles(id) ON DELETE CASCADE,
    load_id         uuid REFERENCES public.loads(id) ON DELETE SET NULL,
    mode            text NOT NULL,              -- 'quick' | 'full'
    stage           text NOT NULL,              -- 'mv' | 'drag'
    close           jsonb,                      -- close/zero point summary
    far             jsonb,                      -- far point / tied-in data summary
    inputs          jsonb,                      -- env + dof + prereq snapshot + checklist
    ledger          jsonb,                      -- normalization ledger (why-expander)
    supersonic_pct  numeric,                    -- far data distance / supersonic range
    correction_type text NOT NULL,              -- 'bc' | 'mv'
    old_value       real,
    new_value       real,
    confidence      text,                       -- 'Thin' | 'Moderate' | 'High' (+ segments in inputs)
    applied_at      timestamptz DEFAULT now(),
    created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.truing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own truing events" ON public.truing_events;
CREATE POLICY "Users can read own truing events"
    ON public.truing_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own truing events" ON public.truing_events;
CREATE POLICY "Users can insert own truing events"
    ON public.truing_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own truing events" ON public.truing_events;
CREATE POLICY "Users can update own truing events"
    ON public.truing_events FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own truing events" ON public.truing_events;
CREATE POLICY "Users can delete own truing events"
    ON public.truing_events FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_truing_events_rifle
    ON public.truing_events(user_id, rifle_id);

-- Derived "current" trued values live ON THE LOAD (decision, noted
-- in REORG-REPORT.md): bc/muzzle_velocity already live on loads,
-- and a load row IS the rifle+load pair (loads.rifle_id). Solutions
-- prefer trued_* when present; the source event is referenced so
-- the value is never the only copy.
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS trued_bc real;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS trued_mv real;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS trued_event_id uuid REFERENCES public.truing_events(id) ON DELETE SET NULL;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS trued_at timestamptz;


-- ────────────────────────────────────────────────────────────
-- MIGRATION R6 — Certificate cross-account transfer (§2.11).
-- Transfers are minted/redeemed ONLY by the server endpoint
-- (service role bypasses RLS). Clients can merely SEE transfers
-- they minted or redeemed — no client mint/redeem path exists,
-- so no INSERT/UPDATE/DELETE policies are created.
-- rifle_snapshot jsonb: full transfer package (profile/build
-- sheet, active zero summary, measured MV + SD + date, trued
-- values, scope factor, config notes).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.certificate_transfers (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token          text NOT NULL UNIQUE,        -- opaque single-use token (QR payload)
    rifle_snapshot jsonb NOT NULL,
    minted_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    minted_at      timestamptz DEFAULT now(),
    redeemed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    redeemed_at    timestamptz
);

ALTER TABLE public.certificate_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transfers" ON public.certificate_transfers;
CREATE POLICY "Users can read own transfers"
    ON public.certificate_transfers FOR SELECT
    USING (auth.uid() = minted_by OR auth.uid() = redeemed_by);

CREATE INDEX IF NOT EXISTS idx_certificate_transfers_token
    ON public.certificate_transfers(token);

-- Provenance stamps on imported rifles (Part 0.6 #3, §2.11).
-- origin: 'owner' (default/local) | 'factory' (certificate import).
-- Factory-origin records are immutable in app flows; owner changes
-- layer on top as normal events.
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS certified_by text;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS certified_at timestamptz;
ALTER TABLE public.rifles ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.certificate_transfers(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- MIGRATION R7 — AI seam (deferred feature's home, Part 0.5 / §2.9a).
-- ai_conversations and ai_usage_logs already exist on the live
-- database (created before schema-as-code); these CREATE IF NOT
-- EXISTS blocks bring their definitions into the repo and are
-- no-ops on the live DB. Shapes match js/db.js exactly.
-- KNOWN MISMATCH (flagged, not fixed here): js/db.js writes
-- `estimated_cost`; some admin RPCs aggregate a column named
-- `cost`. The guarded ADD COLUMN below ensures BOTH exist so
-- neither path errors; reconciliation is an admin-dashboard task.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id   uuid REFERENCES public.rifles(id) ON DELETE SET NULL,
    title      text,
    messages   jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can read own ai conversations"
    ON public.ai_conversations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can insert own ai conversations"
    ON public.ai_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can update own ai conversations"
    ON public.ai_conversations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ai conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete own ai conversations"
    ON public.ai_conversations FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rifle_id         uuid REFERENCES public.rifles(id) ON DELETE SET NULL,
    question_preview text,
    input_tokens     integer,
    output_tokens    integer,
    estimated_cost   real,
    created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS estimated_cost real;
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS cost real;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own ai usage" ON public.ai_usage_logs;
CREATE POLICY "Users can read own ai usage"
    ON public.ai_usage_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ai usage" ON public.ai_usage_logs;
CREATE POLICY "Users can insert own ai usage"
    ON public.ai_usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_day
    ON public.ai_usage_logs(user_id, created_at);


-- ════════════════════════════════════════════════════════════
-- DOCUMENTED, NO-SCHEMA-CHANGE DECISIONS (for the reviewer)
-- ════════════════════════════════════════════════════════════
-- 1. Per-rifle units preference reuses the existing rifles.angle_unit
--    text column with permitted values 'MOA' | 'MIL' | 'IN' (no
--    migration needed; 'IN' is new and handled by the UI layer).
-- 2. Recipe jsonb on loads (WAVES M5) is extended in-shape only:
--    { brass:{make,lot,timesFired}, primer:{make,lot},
--      powder:{make,lot,chargeGr}, bullet:{make,model,weightGr,lot},
--      seatingDepthIn, cbtoIn, neckTensionIn, bushingIn,
--      trimLengthIn, crimp, notes } — Tier-3 seam per Part 0.5.
-- 3. user_settings gains keys (no schema change — key/value table):
--    'job_activations' (v2 of tool_activations), 'suppressor_enabled'
--    (bool), 'last_suppressor_<rifleId>' (uuid), 'onboarding_done'.
-- 4. Crowd-data capture: all new tables carry user_id and structured
--    columns, so the existing salted shooter-key anonymization
--    pattern (crowd_get_data) extends to them without shape changes.
-- 5. steel_strings.photo_ref points at Supabase Storage
--    ('{userId}/steel_{stringId}.jpg'), same bucket + rules as
--    session images.
