# CLAUDE.md — Instructions for Claude Code

## Project
yorT (Ballistic Tracker) — a PWA for precision rifle shooters to photograph targets, mark shot impacts, calculate group statistics, manage gun/load profiles, track barrel life and DOPE, and get AI-powered shooting advice. Authenticated, cloud-backed (Supabase), installable from the browser.

## Tech Stack
- Plain HTML, CSS, JavaScript (NO frameworks, NO build tools)
- Supabase: email/password auth, Postgres (primary data store), Storage bucket `session-images` for target photos, RPCs for the admin dashboard
- Serverless proxy `api/chat.js` (Vercel-style) for the Claude API — the Anthropic API key lives server-side only, never in the browser
- IndexedDB (`js/offline-cache.js`) — read-only offline mirror of rifles/barrels/loads
- localStorage — lightweight settings, sunlight mode, beta flags only
- HTML5 Canvas for image/marker interaction
- PWA: service worker (`sw.js`) + manifest; Supabase UMD and js-aruco2 loaded from CDN (pinned commit SHA)

## Architecture Rules
1. **Calculation engine (`calculations.js`) must be pure functions.** No DOM, no storage, no side effects. Same for the solver math in `ballistic-solver.js` (drag tables, RK4 integration). Unit tests: `node tests/test-calculations.js`.
2. **All Supabase access goes through `js/db.js` (`BallisticDB`).** UI modules never call the Supabase client directly. db.js owns camelCase↔snake_case row mapping and scopes every query by `user_id`.
3. **One file per concern.** Canvas, calibration, calculations, db, session flow, profiles, history, export, AI, solver — all separate files.
4. **Mobile-first.** Touch targets ≥44px. Design for phone screens at the range.
5. **Defensive coding.** Validate inputs, handle null/undefined, no silent failures.
6. **Calibration is per-session.** Never assume a global scale factor.
7. **Store snapshots, not references.** Sessions copy bullet diameter, velocity, weather, and rifle/load names into the session record.
8. **Session images go to Supabase Storage** (`{userId}/{sessionId}.jpg` + thumbnail), never into IndexedDB or Postgres rows. Image upload failure must not block session save.
9. **Bump `CACHE_VERSION` in `sw.js`** on any deploy that changes app-shell files.

## Build Principles for Future Work
1. **All network/API calls go through a dedicated service layer** — no scattered `fetch()` calls in UI modules. (Known debt: the Open-Meteo weather fetch is currently duplicated in session-flow.js, ballistic-solver.js, and ai-assistant.js — consolidate when touched.)
2. **No browser-only assumptions and no hard-coded URLs.** This PWA will be wrapped with Capacitor for iOS/Android. API endpoints (e.g. `/api/chat`) must be configurable base URLs, not root-relative paths; don't rely on `window.location.reload()` semantics, `<a download>`, or `iframe.print()` working in a WebView.
3. **Use standard web APIs for camera, GPS, and sensors** (getUserMedia / `<input capture>`, `navigator.geolocation`, `DeviceOrientationEvent`) so Capacitor plugins can shim them cleanly later.
4. **Keep free-tier and premium features cleanly separated** in the code — subscription billing will be added later. Gate features through a single entitlement check (extend `beta-features.js` patterns), never inline tier logic in UI modules.

## Current State (as of July 2026)
Implemented and live:
- Full 7-step session workflow: profile/quick-mode → image → calibration → distance/bullet/weather → POA → impacts (up to 10) → results + save/share
- ArUco auto-calibration with homography warp, manual 2-tap fallback
- Rifle/barrel/load profiles; session history; cleaning + scope-adjustment logs
- Advanced stats (mean radius, CEP, radial/vertical/horizontal SD)
- G1/G7 point-mass ballistic solver (RK4); drop + wind-drift tables
- "Ask yorT" AI assistant: vision-capable chat via `/api/chat` proxy (claude-sonnet-4-5), context from user's rifles/sessions/trajectories, usage logged to `ai_usage_logs`
- Cold Bore tracking (always visible in rifle detail)
- Admin dashboard (stats, users, AI cost, export) via Supabase RPCs
- PWA shell: SW cache v54, offline read cache for profile data

Beta-gated and **currently hard-disabled** (`isBetaEnabled()` returns `false` in `beta-features.js`): Wind Call (wind/spin-drift/Coriolis holds), Verified DOPE + BC truing, quick start, session compare, etc.

Planned next: Capacitor iOS/Android wrap, subscription billing, centralized network service layer.

## Key Formulas
```
groupSize_inches = pixelDistance / pixelsPerInch
  (impacts are tapped at hole centers, so pixel distance IS center-to-center —
   NO bullet-diameter subtraction anywhere)
MOA = (inches / distanceYards) * (100 / 1.047)
ATZ = negate the offset from POA to group centroid, in MOA
pixelsPerInch (manual fallback) = pixelDistanceBetweenCalibrationPoints / 1.0
```

## ArUco Auto-Calibration
- Dictionary: `ARUCO_MIP_36h12` (js-aruco2 CDN, pinned commit SHA)
- Target geometry: 6.0" grid, 0.6" markers, `MARKER_OFFSET = 0.8"` (measured from printed target)
- Corner assignment is **position-based** (outermost by diagonal projection: min/max of x+y and x−y). **Never use hard-coded marker IDs** — they decode differently across devices
- Sanity guard: detected bounding box must span ≥30% of image in both axes
- On success, image is warped flat via 4-point homography; `pixelsPerInch = 120` (fixed)
- Falls back to manual 2-tap calibration if library is missing or fewer than 4 markers found
- Printable target: `assets/yorT-target.pdf`; diagnostic page: `aruco-test.html`

## File Structure
```
ballistic-app/
├── index.html            # SPA shell, auth screen, CDN + script loading
├── aruco-test.html       # Standalone ArUco detection diagnostic page
├── manifest.json / sw.js # PWA manifest + service worker (CACHE_VERSION)
├── api/chat.js           # Serverless Claude API proxy (server-side key)
├── css/main.css          # Single stylesheet (incl. sunlight/high-contrast mode)
├── js/
│   ├── app.js            # Supabase client init, auth, nav, bootstrap
│   ├── db.js             # BallisticDB — ALL Supabase CRUD/Storage/RPC access
│   ├── canvas-manager.js # Image load, zoom/pan, marker placement
│   ├── calibration.js    # Manual 2-tap calibration
│   ├── aruco-calibration.js # ArUco detection + homography warp
│   ├── calculations.js   # PURE group-analysis math
│   ├── session-flow.js   # 7-step session wizard
│   ├── profiles.js       # Rifle/barrel/load CRUD UI
│   ├── history.js        # Session history, cleaning + scope logs
│   ├── export.js         # Annotated image + thumbnail rendering
│   ├── ai-assistant.js   # "Ask yorT" chat (vision, context, usage logging)
│   ├── ballistic-solver.js # G1/G7 RK4 point-mass solver + Solver UI
│   ├── admin.js          # Admin dashboard (hard-coded ADMIN_USER_ID)
│   ├── beta-features.js  # Feature-flag registry (currently all-off)
│   ├── wind-call.js      # Wind/spin-drift/Coriolis holds (beta)
│   ├── dope-log.js       # Verified DOPE + BC truing (beta)
│   ├── cold-bore.js      # Cold-bore first-shot tracking (not gated)
│   ├── offline-cache.js  # IndexedDB read-only mirror (yort_offline)
│   └── utils.js          # UUID, formatting, help tooltips, canvas helpers
├── tests/test-calculations.js  # Node unit tests (node tests/test-calculations.js)
├── *.sql                 # Supabase migrations (admin, beta, cold-bore)
└── assets/               # logo.png, yorT-target.pdf (printable ArUco target)
```

## Testing
- `node tests/test-calculations.js` — pure-math unit tests; run after any calculations.js change
- `aruco-test.html` — load a target photo, verify marker detection verdict
- Verify MOA conversion: 1.047" at 100 yards = 1.0 MOA

## Known Issues / Cautions
- The `admin_*` RPCs are `SECURITY DEFINER` with **no server-side admin check** — admin gating is client-side only (hard-coded UUID). Fix before scaling users.
- Supabase anon key and admin UUID are hard-coded in shipped JS.
- `fetch('/api/chat')` is root-relative — breaks under Capacitor (Build Principle 2).
- `db.js` header comment still says "IndexedDB version" — misleading, it's Supabase.

## Style
- Dark theme (easy on eyes at range, matches shooting app conventions); optional high-contrast "sunlight mode"
- Green accent color for impact markers (high visibility on most target backgrounds)
- Blue for POA marker
- Clean, functional UI — not decorative. This is a tool.

## Do NOT
- Use any npm packages, build tools, or frameworks (React, Vue, etc.)
- Call the Supabase client directly from UI modules — go through `db.js`
- Store images in IndexedDB or Postgres rows — use Supabase Storage
- Use localStorage for domain data (sessions, profiles) — settings/flags only
- Make the calculation engine depend on the DOM
- Hard-code bullet diameters, distances, or ArUco marker IDs
- Put the Anthropic API key anywhere client-side
- Add new scattered `fetch()` calls — see Build Principles #1
