# Crowd Data Warehouse — Build Report

**Branch:** `crowd-data-build` (from `stage-b-build` @ cc8b969) · **Feature commit:** 774d719
**Date:** 2026-07-16

## What was built

An admin-only **Crowd Data Warehouse**: one place that organizes every velocity
string across ALL users — joined with its rifle/barrel/load specs and same-trip
group/session data — into a sortable, filterable table with one-click CSV and
XLSX export. Organization and export only; no analysis or charts in the app
(that happens externally, per spec).

### Data shape (one row per velocity string × matched session)

| Group | Fields |
|---|---|
| Identity (anonymized) | `shooter_key` — opaque salted hash, stable per shooter, NOT reversible |
| Velocity string | `string_date`, `source`, `avg_fps`, `sd_fps`, `es_fps`, `shot_count`, `shot_velocities` (semicolon-joined per-shot fps), `round_count_at`, `string_id` |
| Rifle / barrel | `caliber`, `barrel_spec`, `muzzle_device`, `twist_rate`, `twist_direction` |
| Load / ammo | `load_name`, `bullet_name`, `bullet_weight`, `bullet_diameter`, `bullet_bc`, `drag_model`, `nominal_velocity` |
| Matched session | `session_date`, `distance_yards`, `rounds_fired`, `session_measured_velocity`, `group_size_inches`, `group_size_moa`, `mean_radius_inches`, `mean_radius_moa`, `session_id` |
| Conditions | `temp_f`, `humidity_pct`, `wind_mph`, `wind_dir`, `altitude_ft`, `pressure_in_hg` |

**Session match rule** (raw organization, not analysis): a session attaches to a
string when it is the same user AND same rifle, the load is compatible (equal,
or either side unassigned), and it was shot within **±24 hours** of the string.
A string matching N sessions produces N rows; a string with no match produces
one row with the session fields null. The row count line in the UI states this.

### Anonymization

- `user_id` is replaced by `shooter_key = 'shooter_' + md5(user_id + salt)[0:10]`.
  The salt is **generated inside the database** on first migration run
  (`crowd_export_config`, RLS-locked, no client access) — it never appears in
  the repo or in shipped JS, so exports cannot be re-linked to user ids even
  with full source access.
- Deliberately **excluded**: emails, rifle names, serial numbers, free-text
  `notes`, and `sheet_name` (Garmin filenames can contain personal names).
  A unit test asserts no identifying field ever enters the column registry.

### Server-side authorization (the S1-correct pattern)

`crowd_get_data()` is SECURITY DEFINER but its **first statement** verifies the
caller: `auth.uid()` must exist in the new `admin_users` table or it raises
`Not authorized`. The table is RLS-enabled with zero policies (invisible to the
client API) and seeded with the current admin UUID. The client-side UUID check
in `admin.js` remains only as UI gating — the data is protected server-side.

Optional **Migration 5** applies the same check to the four legacy `admin_*`
RPCs, fully closing readiness item **S1** (STAGE-C-READINESS.md).

## Files changed

| File | Change |
|---|---|
| `CROWD-DATA-migrations.sql` | NEW — all SQL (nothing was run; run it yourself, see below) |
| `js/crowd-data.js` | NEW — CrowdDataManager: table, filters, sort, CSV/XLSX export |
| `tests/test-crowd-data.js` | NEW — 37 unit tests for the pure helpers |
| `js/db.js` | `crowdGetData()` RPC wrapper (all Supabase access stays in db.js) |
| `js/admin.js` | "Crowd Data Warehouse" dashboard section + `_showCrowdData()` |
| `index.html` | `<script src="js/crowd-data.js">` before admin.js |
| `sw.js` | `CACHE_VERSION` 65 → 66; `crowd-data.js` added to APP_SHELL |
| `css/main.css` | `.crowd-*` styles (sticky header, filter row, ≥44px touch targets) |

## Migration run-order (Supabase SQL Editor — I ran NO SQL)

**Prerequisites** (must already be applied — all were part of earlier stages):
1. `admin-migration.sql` (legacy admin RPCs exist)
2. `velocity-strings-migration.sql` (`velocity_strings` table)
3. `MORNING-migrations.sql` Migration 1 (`rifles.barrel_spec` / `muzzle_device`)

**Then run `CROWD-DATA-migrations.sql` top-to-bottom:**

| # | What | Safety |
|---|---|---|
| 1 | `admin_users` table + RLS + seed admin UUID | Additive; idempotent |
| 2 | `crowd_export_config` + server-generated salt | Additive; idempotent (salt generated once, then stable) |
| 3 | `is_crowd_admin()` function | New function only |
| 4 | `crowd_get_data()` RPC | New function only |
| 5 | **OPTIONAL** — harden legacy `admin_*` RPCs (closes S1) | ⚠ Replaces 4 existing functions (no data change, same return shapes; `admin_export_all` additionally gains `velocity_strings`, `dope_entries`, `cold_bore_shots`). Skip if you want strictly new-objects-only; run before any store submission. |

Migrations 1–4 are strictly additive: no existing row, column, table, or
function is altered or deleted. Everything is re-runnable.

## Testing

### Automated (all green at commit time)
- `node tests/test-crowd-data.js` — 37/37: CSV escaping (RFC 4180), CSV
  building, AND-filters + blank token + global search, numeric/date sort with
  blanks-last, cell formatting/truncation, distinct values, column registry
  (no duplicates, required fields present, **no identifying fields**)
- `node tests/test-calculations.js` — 59/59 (unchanged, regression check)
- `node --check` on every touched JS file

### Manual checklist (do after running migrations 1–4)

**Authorization (the important one)**
- [ ] Log in as a **non-admin** user, open DevTools console, run:
      `supabase.rpc('crowd_get_data').then(console.log)` → must return an
      error containing `Not authorized`, never data.
- [ ] Same call as the **admin** → returns a JSON array.
- [ ] Non-admin: `from('admin_users').select()` and
      `from('crowd_export_config').select()` → empty/denied (RLS, no policies).
- [ ] If Migration 5 was run: non-admin `supabase.rpc('admin_get_users')` →
      `Not authorized` (this is the S1 fix); admin dashboard still loads.

**Warehouse UI (as admin)**
- [ ] Admin tab → "Crowd Data Warehouse" section → **Open Crowd Data** loads
      the table; row count reads "N of M rows".
- [ ] `shooter_key` values look like `shooter_ab12cd34ef` — same shooter's
      strings share one key; no emails anywhere in the table.
- [ ] Strings shot the same day as a session on the same rifle show group
      size / distance / conditions; unmatched strings show blank session cells.
- [ ] Each dropdown (Shooter, Caliber, Barrel Spec, Twist, Muzzle Device,
      Load/Ammo, Bullet) narrows the table; filters combine; "(blank)" option
      appears when a column has empty cells; Clear resets everything.
- [ ] Click a column header → sorts; click again → reverses; arrow indicator
      moves; blanks always sink to the bottom.
- [ ] Back → Dashboard returns to the normal admin dashboard; Refresh re-fetches.

**Export (core deliverable)**
- [ ] Filter to a subset → **CSV (filtered)** downloads only visible rows;
      open in Excel: headers are the snake_case keys, commas/quotes in load
      names survive, `shot_velocities` is one semicolon-joined cell.
- [ ] **XLSX (filtered)** opens in Excel with one `CrowdData` sheet, numbers
      as numbers.
- [ ] **CSV (all)** / **XLSX (all)** ignore filters and export every row.
- [ ] Row counts in exports match the on-screen count (+1 header row).

**PWA**
- [ ] After deploy, app updates itself (SW v66 activate → reload) and the
      Crowd Data view works; hard-reload first if testing on localhost
      (per the stale-JS trap).

## Notes / caveats

- **No SQL was executed by me** and nothing in the migration deletes or
  modifies data. Migration 5 is the only block that replaces existing
  functions, and it is opt-in.
- Adding a future admin = one INSERT into `admin_users` (and the client-side
  `ADMIN_USER_ID` UI gate would also need that user's UUID to show the tab).
- The RPC returns the full dataset and the UI filters client-side — right for
  the current scale; if crowd data grows past tens of thousands of rows, add
  server-side paging/filter params to `crowd_get_data()`.
- Exports download via `<a download>` (same pattern as the existing admin JSON
  backup). Under a future Capacitor wrap this needs the share/save seam from
  STAGE-C-READINESS C7–C9; admin exports are desktop-browser use today.
- Weather/results fields are extracted from the session JSONB using the app's
  camelCase keys (`tempF`, `groupSizeMOA`, …) and cast to numbers; the app is
  the only writer of those blobs.
- **Parallel-session note:** this feature was built while a UX-audit session
  was actively committing to `ux-audit` in the same checkout. The crowd work
  was moved to a dedicated git worktree (`../ballistic-crowd-build`) and
  committed only to `crowd-data-build`; the shared tree was restored so the
  UX session keeps a clean slate. Side effect: ux-audit's Wave 3 commit
  (cf7a2e9) picked up the (unused there) `.crowd-*` CSS block in
  `css/main.css` — harmless, and it will merge cleanly with this branch.
