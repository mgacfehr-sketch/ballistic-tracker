# yorT (Ballistic Tracker) PWA — Full Specification

## Overview
yorT is a Progressive Web App (PWA) for precision rifle shooters: photograph a target, mark shot impacts, calculate group statistics, manage gun/load profiles, track barrel life, log DOPE and cold-bore behavior, run a ballistic solver, and get AI-powered shooting advice. Mobile-first, designed for use at the range, installable from the browser.

The app is **authenticated and cloud-backed**: users sign up with email/password (Supabase Auth) and all data is stored per-user in Supabase (Postgres + Storage). A read-only offline cache keeps profile data viewable without connectivity.

Planned next: wrap the PWA with Capacitor for iOS/Android app-store distribution, and add subscription billing (free vs premium tiers). See "Build Principles for Future Work" in CLAUDE.md.

## Tech Stack
- **Frontend:** Plain HTML, CSS, JavaScript (no frameworks, no build tools)
- **Backend:** Supabase — email/password auth, Postgres tables (primary data store, row-level security by `user_id`), Storage bucket `session-images` for target photos, Postgres RPCs for the admin dashboard
- **AI:** Claude API via a Vercel-style serverless proxy (`api/chat.js`); Anthropic API key lives in server env, never in the browser. Model: `claude-sonnet-4-5-20250929`
- **Offline:** Service worker (`sw.js`) caches the app shell; `js/offline-cache.js` mirrors rifles/barrels/loads into IndexedDB for read-only offline access
- **Image handling:** HTML5 Canvas API; ArUco fiducial detection via js-aruco2 (CDN, pinned commit SHA)
- **Ballistic solver:** Custom point-mass solver in JavaScript (G1/G7 drag models, RK4 integration)
- **localStorage:** lightweight settings, sunlight mode, beta flags only

---

## Feature Status
The original build phases, with current implementation status.

### Phase 1 — Core Session Workflow ✅ Implemented
The heart of the app. A standalone flow that works without profiles.

**Step-by-step UX flow:**
1. **Select profile** — Pick a rifle + load, or use Quick/Misc mode. Buttons to print or share the blank yorT target PDF.
2. **Load image** — Camera capture or pick from phone photo library
3. **Set scale / calibration** — Primary path: app auto-detects the four ArUco fiducial markers printed on the yorT target (ARUCO_MIP_36h12 dictionary) and warps the image flat using perspective correction, setting `pixelsPerInch` from the known 6.0" grid geometry. Corner assignment is position-based (outermost by diagonal projection), not by marker ID, so it works across devices. Fallback path: user zooms into any known 1-inch reference and taps point A then point B; app calculates `pixelsPerInch = distance_in_pixels / 1.0`.
4. **Input distance + bullet diameter** — Distance 1–1500 yards; bullet diameter in inches with common presets (.224–.338). Auto-fills from the load in profile mode. Optional: rounds fired, measured velocity, and weather (manual entry or auto-fetch from Open-Meteo via geolocation).
5. **Mark Point of Aim (POA)** — Single tap to place a blue marker where the shooter was aiming
6. **Mark impacts sequentially** — Tap to place numbered markers (1, 2, 3... up to 10), green crosshair style. Undo/clear supported.
7. **Calculate and display results** — Overlay card on the annotated image; save session, crop, save image, or share

**Calculations (impacts are tapped at hole centers, so all pixel distances are already center-to-center — no bullet-diameter subtraction):**

- **Group size (max spread):** Maximum center-to-center distance between any two impacts. Display in inches AND MOA.
- **MOA conversion:** `moa = (inches / distance_yards) × (100 / 1.047)`
- **Mean radius:** Average distance from each impact to the group centroid (mean X, mean Y of all impacts)
- **Vertical extreme spread:** Max Y difference between any two impacts (inches + MOA)
- **Horizontal extreme spread:** Max X difference between any two impacts (inches + MOA)
- **Elevation offset from POA:** Distance from POA to group centroid, vertical component (inches + MOA). Positive = high, negative = low.
- **Windage offset from POA:** Distance from POA to group centroid, horizontal component (inches + MOA). Positive = right, negative = left.
- **ATZ (Adjust to Zero):** The scope adjustment needed. E.g., "Down 0.60 MOA, Right 0.25 MOA". This is just the negation of the offset — if impacts are high-left, adjust down-right.

**Annotated image output:**
- Composite the original photo + all markers + POA marker + results overlay card (`js/export.js`)
- Full-size JPEG + 400px thumbnail uploaded to Supabase Storage on session save
- User can save the composite to their photo library or share it (Web Share API)

**Canvas interaction:** pinch-to-zoom (up to ~15x), pan, accurate tap placement while zoomed, markers scale with zoom.

### Phase 2 — Data Model & Gun/Load Profiles ✅ Implemented (in Supabase, not IndexedDB)

Storage notes:
- Tables are **snake_case in Postgres, camelCase in JS** — `js/db.js` (`BallisticDB`) maps both ways and is the ONLY module that touches Supabase data.
- Every row carries `user_id`; queries are scoped to the logged-in user and tables use row-level security.
- Session images live in the **`session-images` Storage bucket** at `{userId}/{sessionId}.jpg` and `{userId}/{sessionId}_thumb.jpg` — not as filenames on disk and not as blobs in the database.

**Entities (Postgres tables):**

#### Rifle (`rifles`)
- `id` (UUID)
- `name` (string, e.g., "Bergara B14 HMR")
- `caliber` (string, e.g., ".308 Win")
- `scopeHeight` (number, inches — center of bore to center of scope)
- `zeroRange` (number, yards)
- `angleUnit` (string, "MOA" — future: "MIL")
- `notes` (string, optional)
- `createdAt` / `updatedAt` (ISO datetime)

#### Barrel (`barrels`)
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `twistRate` (string, e.g., "1:10")
- `twistDirection` (string, "Right" or "Left")
- `installDate` (ISO date)
- `isActive` (boolean — only one active barrel per rifle)
- `totalRounds` (number — manually tracked total round count)
- `notes` (string, optional)

#### Load / Ammo Profile (`loads`)
- `id` (UUID)
- `rifleId` (FK → Rifle)
- `name` (string, e.g., "Hornady 168gr ELD-M")
- `bulletName` (string)
- `bulletWeight` (number, grains)
- `bulletLength` (number, inches, optional)
- `bulletDiameter` (number, inches, e.g., 0.308)
- `bulletBC` (number, ballistic coefficient)
- `dragModel` (string, "G1" or "G7")
- `muzzleVelocity` (number, fps — baseline/expected)
- `notes` (string, optional)
- `createdAt` (ISO datetime)

#### Session (`sessions`)
- `id` (UUID)
- `rifleId` / `loadId` / `barrelId` (FKs, nullable for quick/misc mode)
- `date` (ISO datetime)
- `distanceYards` (number)
- `roundsFired` (number)
- `measuredVelocity` (number, fps, optional — chrono reading)
- `weather` (embedded WeatherSnapshot, optional)
- `calibrationData` (object: `{pointA: {x,y}, pointB: {x,y}, pixelsPerInch: number}`)
- `bulletDiameter` (number — snapshot at time of session)
- `rifleName` / `loadName` (denormalized snapshots for display)
- `poaPoint` (object: `{x, y}` in image pixel coordinates)
- `impacts` (array of `{id, number, x, y}` — ordered, in image pixel coordinates)
- `results` (object: calculated group size, mean radius, offsets, ATZ, advanced stats)
- `coldBore` (object, optional — first-shot offset data)
- `sightInComments` (string, optional)
- `isZeroSession` (boolean)
- `createdAt` (ISO datetime)

#### WeatherSnapshot (embedded, not a separate table)
- `temperature` (°F), `altitude` (ft), `barometricPressure` (inHg), `humidity` (%), `windSpeed` (mph), `windDirection` (string, e.g., "3 o'clock") — all nullable

#### ZeroRecord (`zero_records`)
- `id`, `rifleId`, `loadId`, `sessionId` (optional), `date`, `rangeYards`, `weather`, `notes`

#### ScopeAdjustment (`scope_adjustments`)
- `id`, `rifleId`, `sessionId` (optional), `date`, `elevationChange` (MOA, positive = up), `windageChange` (MOA, positive = right), `reason`, `notes`

#### CleaningLog (`cleaning_logs`)
- `id`, `rifleId`, `barrelId`, `date`, `roundCountAtCleaning` (pre-filled from barrel), `notes`

#### DopeEntry (`dope_entries`) — beta
- Verified come-up log: rifle + load, distance, elevation dial (MOA), wind hold, result (hit/miss/high/low). Feeds BC truing.

#### ColdBoreShot (`cold_bore_shots`)
- Manual cold-bore entries: rifle + load, vertical/horizontal offset. Merged with auto-derived `session.coldBore` data.

#### AIConversation (`ai_conversations`)
- Persisted multi-turn "Ask yorT" chats per user.

#### AIUsageLog (`ai_usage_logs`)
- Per-message token counts and estimated cost; surfaced in the admin dashboard.

**Profile limits:** Up to 50 rifle profiles. No hard limit on loads per rifle, sessions, or log entries.

**Derived/computed values (not stored, calculated on read):**
- Rounds since last cleaning = barrel `totalRounds` minus `roundCountAtCleaning` from most recent cleaning log
- Velocity trend = ordered list of `measuredVelocity` from sessions over time
- Trued BC (beta) = back-calculated from verified DOPE entries

### Phase 3 — Session History & Logging ✅ Implemented
- Sessions saved to profiles after calculation; per-rifle history lists + detail views (`js/history.js`)
- "Misc" (no-rifle) session list
- Cleaning log CRUD with rounds-since-last-clean
- Scope adjustment log CRUD
- Muzzle velocity tracking per session
- Weather entry form (all fields optional) + auto-fetch
- Thumbnails lazy-loaded from Supabase Storage

### Phase 4 — Quick/Miscellaneous Mode ✅ Implemented
- Full session workflow without profile association
- Bullet diameter prompt with presets (.224, .243, .264, .277, .284, .308, .338)
- Results saved as standalone "misc" session or discarded; annotated image always sharable

### Phase 5 — Advanced Statistics ✅ Implemented (except POI Score)
In `js/calculations.js`, shown on results/session detail:
- **CEP (Circular Error Probable):** radius of smallest circle centered on centroid containing 50% of shots
- **Radial SD, Vertical SD, Horizontal SD**
- **Mean windage / mean elevation** offsets from POA (inches + MOA)
- **POI Score:** not implemented — future work

### Phase 6 — AI Assistant ✅ Implemented ("Ask yorT")
Design changed from the original spec (no user-provided API key):
- Chat UI in `js/ai-assistant.js`; browser POSTs to the **`api/chat.js` serverless proxy**, which holds `ANTHROPIC_API_KEY` in server env and calls the Claude API (model `claude-sonnet-4-5-20250929`, max_tokens 2048)
- **Vision support:** attach or camera-capture a target photo (base64), or auto-attach a referenced session's image
- **Context gathering** from Supabase: rifles, loads, session history, computed trajectories, weather (auto-fetched from Open-Meteo)
- Conversations persisted to `ai_conversations`; per-message tokens + estimated cost logged to `ai_usage_logs`
- No rate limiting or quota enforcement yet (cost is tracked, not capped)

### Phase 7 — Ballistic Solver ✅ Implemented
`js/ballistic-solver.js`:
- Point-mass solver with published **G1 and G7 drag tables** (Mach → Cd)
- **4th-order Runge-Kutta** integration; speed-of-sound and air-density from temperature/pressure/humidity; pressure-at-altitude estimate; iterative zero-angle finding
- Inputs auto-filled from rifle + load profile; weather auto-fetch
- Outputs: drop/come-up table (MOA + inches) and wind-drift table
- Runs entirely locally; solver math is pure (module-exportable like calculations.js)
- Note: **spin drift and Coriolis are in Wind Call** (`js/wind-call.js`), not the core solver

### Phase 8 — Polish & PWA ✅ Largely implemented
- Service worker (`sw.js`, `CACHE_VERSION` currently 54): network-first for app-shell code, cache-first for static assets and CDN libs, **Supabase requests never cached**; auto-reload on new version via postMessage
- Manifest + icons (192/512/maskable); installable
- High-contrast "sunlight mode" toggle
- Touch handling: pinch-zoom, double-tap-zoom suppression, scroll prevention

---

## Authentication & Backend
- **Auth:** Supabase email/password (`js/app.js`) — signup (min 6-char password, email confirmation), login, logout, session restore on load
- **Data access layer:** `BallisticDB` (`js/db.js`) is the single gateway for all Supabase tables, Storage, and RPCs; injects/strips `user_id` and maps camelCase↔snake_case
- **Storage:** bucket `session-images`, paths `{userId}/{sessionId}.jpg` + `_thumb.jpg`; image upload failure is non-fatal (doesn't block session save)
- **Migrations:** SQL files in repo root — `admin-migration.sql` (admin RPCs), `beta-migration.sql` (`dope_entries`, `cold_bore_shots` + RLS), `cold-bore-migration.sql` (session-level cold-bore fields)

## Admin Dashboard
- Gated by a hard-coded `ADMIN_USER_ID` UUID (`js/admin.js`); matching users get an Admin nav tab
- Shows database stats, per-user usage table, AI cost (month + all-time), and an all-users JSON export
- Backed by Postgres RPCs: `admin_get_stats`, `admin_get_users`, `admin_get_usage_summary`, `admin_export_all`
- **Known issue:** these RPCs are `SECURITY DEFINER` with no server-side admin check — gating is client-side only. Must be fixed before scaling users.

## Beta Feature Flags
- Registry in `js/beta-features.js`: `windCall`, `dopeLog`, `coldBore`, `quickStart`, `highContrast`, `offlineMode`, `sessionCompare` (localStorage-backed flags)
- **Current state: `isBetaEnabled()` is hard-coded to return `false`** — all beta features are disabled for everyone, including admin. The Wind tab and Verified DOPE section do not appear in the current build.
- Cold Bore is intentionally **not** gated and always visible in rifle detail.

### Beta feature details
- **Wind Call** (`js/wind-call.js`): compass heading (`DeviceOrientationEvent`, iOS permission flow) + GPS latitude; clock-face wind dial; computes wind drift (from solver trajectory), spin drift (from twist rate), Coriolis (horizontal + vertical), and total windage hold in inches/MOA
- **Verified DOPE & BC Truing** (`js/dope-log.js`): log verified hits per rifle+load to `dope_entries`; back-calculates a "trued" BC by sweeping a 0.85–1.15 BC multiplier through the solver and minimizing come-up error; shows box BC vs trued BC
- **Cold Bore Tracking** (`js/cold-bore.js`): merges auto first-shot offsets from `session.coldBore` with manual `cold_bore_shots` entries; per-load averages, history, and offset-trend target diagram

## Offline Behavior
Two independent layers:
- **`sw.js`** caches the app shell (HTML/CSS/JS/icons/target PDF + Supabase UMD) so the app loads offline
- **`js/offline-cache.js`** mirrors rifles/barrels/loads from Supabase into IndexedDB (`yort_offline`) for read-only access when offline; refreshes on init, `online`, and `visibilitychange`; drives the connection-status dot
- **No offline write queue** — saving sessions, images, and AI chat require connectivity

---

## Future Work
- **Capacitor wrap** for iOS/Android — see "Build Principles for Future Work" in CLAUDE.md (configurable API base URLs, no browser-only assumptions, standard web APIs for camera/GPS/sensors)
- **Subscription billing** — free vs premium tiers; keep tier gating in a single entitlement layer
- **Centralized network service layer** — consolidate the duplicated Open-Meteo fetches and other scattered network calls
- **Server-side admin authorization** for the `admin_*` RPCs
- **POI Score** metric (algorithm TBD)
- **Offline write queue** (save sessions offline, sync later)
- Re-enable beta features via proper per-user entitlements

---

## File Structure

```
ballistic-app/
├── index.html                  # SPA shell, auth screen, CDN + script loading
├── aruco-test.html             # Standalone ArUco detection diagnostic page
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (CACHE_VERSION, shell caching)
├── api/
│   └── chat.js                 # Serverless Claude API proxy (server-side key)
├── css/
│   └── main.css                # Single stylesheet (incl. sunlight mode)
├── js/
│   ├── app.js                  # Supabase client init, auth, nav, bootstrap
│   ├── db.js                   # BallisticDB — ALL Supabase CRUD/Storage/RPC
│   ├── canvas-manager.js       # Image loading, zoom/pan, marker placement
│   ├── calibration.js          # Manual 2-tap calibration
│   ├── aruco-calibration.js    # ArUco detection + homography warp
│   ├── calculations.js         # All group math (PURE FUNCTIONS)
│   ├── session-flow.js         # 7-step session workflow controller
│   ├── profiles.js             # Rifle/barrel/load profile management UI
│   ├── history.js              # Session history, cleaning + scope logs
│   ├── export.js               # Annotated image + thumbnail rendering
│   ├── ai-assistant.js         # "Ask yorT" chat (vision, context, usage logs)
│   ├── ballistic-solver.js     # G1/G7 RK4 point-mass solver + Solver UI
│   ├── admin.js                # Admin dashboard (hard-coded ADMIN_USER_ID)
│   ├── beta-features.js        # Feature-flag registry (currently all-off)
│   ├── wind-call.js            # Wind/spin-drift/Coriolis holds (beta)
│   ├── dope-log.js             # Verified DOPE + BC truing (beta)
│   ├── cold-bore.js            # Cold-bore first-shot tracking
│   ├── offline-cache.js        # IndexedDB read-only mirror (yort_offline)
│   └── utils.js                # UUID, formatting, help tooltips, helpers
├── tests/
│   └── test-calculations.js    # Node unit tests (node tests/test-calculations.js)
├── admin-migration.sql         # Admin RPC functions
├── beta-migration.sql          # dope_entries + cold_bore_shots tables + RLS
├── cold-bore-migration.sql     # Session-level cold-bore fields
├── icons/                      # PWA icons (192/512/maskable)
├── assets/
│   ├── logo.png
│   └── yorT-target.pdf         # Printable ArUco calibration target
├── SPEC.md                     # This file
├── CLAUDE.md                   # Instructions for Claude Code
└── README.md                   # Project documentation
```

---

## Key Design Principles
1. **Calculation engine is pure functions** — no DOM, no storage, no side effects. Takes coordinates in, returns measurements out. Fully testable (`tests/test-calculations.js`).
2. **All Supabase access goes through `db.js`** — UI modules never touch the client directly; every query is user-scoped (`user_id` + RLS).
3. **Calibration data is stored per session** — different photos have different scales.
4. **Images live in Supabase Storage** — keyed by user + session id; never in IndexedDB or database rows.
5. **All fields that could change over time are snapshotted in the session** — bullet diameter, velocity, weather, rifle/load names. The session is a self-contained record.
6. **Mobile-first design** — every interaction designed for thumb use on a phone screen at the range.
7. **Offline-tolerant, not offline-first** — the shell and profile data are viewable offline; saving sessions and AI chat require connectivity.
8. **Built to be wrapped** — follow the "Build Principles for Future Work" in CLAUDE.md (service layer, no hard-coded URLs, standard web APIs, free/premium separation) so the Capacitor + subscription work lands cleanly.

---

## Constants & Formulas

```
MOA_FACTOR = 1.047 // 1 MOA = 1.047 inches at 100 yards

// Inches to MOA at a given distance
toMOA(inches, distanceYards) = (inches / distanceYards) * (100 / MOA_FACTOR)

// Group size = max center-to-center distance between any pair of impacts
// (user taps hole centers directly; pixel distance is already center-to-center —
//  no bullet-diameter subtraction)
// Mean radius = average distance from each impact to centroid
// Centroid = (mean(all X), mean(all Y))
// ATZ = negation of (centroid offset from POA), converted to MOA

// ArUco auto-calibration (js/aruco-calibration.js):
//   dictionary: ARUCO_MIP_36h12
//   target grid: 6.0" × 6.0", markers 0.6" square, MARKER_OFFSET = 0.8"
//   corner selection: position-based diagonal projection (min/max of x+y, x-y)
//     — NOT by marker ID (IDs decode differently across devices)
//   sanity guard: bounding box must span ≥30% of image in both axes
//   output pixelsPerInch = 120 (fixed for the warped flat canvas)
```
