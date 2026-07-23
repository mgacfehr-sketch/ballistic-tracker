# STANDARDS.md — Proven Engineering Standards

These standards are derived from the codebase's proven patterns and govern all work from
the Range-Day Reorganization (v2.3) forward. Where older code conflicts, new work follows
this document and the conflict is noted in the current build report.

---

## 1. Stack ground rules

- Plain HTML, CSS, JavaScript. **No frameworks, no npm packages, no build tools.**
- Third-party libraries only via CDN `<script>` tags pinned in `index.html`
  (Supabase UMD, js-aruco2, SheetJS, jsPDF, qrcode). Pin to a commit SHA or exact version.
- One SPA shell (`index.html`), one service worker (`sw.js`), one serverless directory
  (`api/`). Everything else is a module in `js/` or a stylesheet in `css/`.

## 2. File organization

- **One file per concern.** A feature = at most one pure engine file + one UI file.
  - Pure engine: `js/<name>-core.js` or a math module (`calculations.js`,
    `truing-core.js`, `calibration-status.js`, `labradar-import.js`).
  - UI/manager: `js/<name>.js` (`session-flow.js`, `steel-session.js`, `truing.js`).
- Tests in `tests/test-<module>.js`, fixtures in `tests/fixtures/`.
- Mockups in `docs/mockups/` **are the design**. Token source of truth:
  `docs/mockups/proven-templates-v2.html` → `css/tokens.css`.
- SQL migrations live at repo root as one file per build contract
  (`REORG-migrations.sql`), additive-only, re-runnable. **Claude never runs SQL**;
  the owner runs it in the Supabase SQL Editor.

## 3. Module boundaries — pure engines vs UI

**Pure engine modules** (the calculation/parsing layer):
- No DOM, no storage, no network, no `Date.now()` hidden inside math, no side effects.
  Same inputs → same outputs.
- Bare `function` declarations + the CommonJS guard so Node tests can load them:
  ```js
  if (typeof module !== 'undefined' && module.exports) {
      module.exports = { fnA, fnB };
  }
  ```
- Browser-only helpers (e.g. anything touching `XLSX`, canvas) are intentionally
  **excluded** from the Node export list.
- Engines may call other pure engines (e.g. `truing-core.js` → `computeTrajectory`)
  via a top-of-file resolution guard that works in both browser globals and Node
  `require`.

**UI managers:**
- A manager class or IIFE namespace that renders HTML strings into its view container
  and binds events. Managers own no math — they call engines and `db.js`.
- Any algorithm worth testing gets lifted into the engine file, never left on a
  prototype method (the `dope-log.js _calculateTrueBC` pattern is the anti-pattern).

**Protected engine files** (do not rewrite; additive changes only where explicitly
allowed): `js/calculations.js`, `js/velocity-stats.js`, `js/garmin-import.js`,
`js/ballistic-solver.js` (math half), `js/wizard-core.js`, `js/db.js`, `js/net.js`,
and the service-worker caching strategy.

## 4. Feature registration seam (how a feature ships)

A new feature never adds a nav tab, a `#view-*` div, or an `app.js` route. It ships as:
1. A `TOOLS` entry in `js/tools.js` — activation/tier gating (`ToolRegistry`).
2. Tool row(s) in `Categories.DEFS[<job>].tools` in `js/categories.js` —
   `gate()` + `launch(ctx)`.
3. A launcher on `window.ToolActions.<name>` defined in the feature's own file.
4. A `<script>` tag in `index.html` (dependency order) + the file added to
   `APP_SHELL` in `sw.js`.

Home rows, the rifle chip, and slim-rifle-page shortcuts iterate `Categories.KEYS`
generically — keep `DEFS`, `hasActiveTools`, and icons consistent and they follow.

Wizards use `WizardCore` defs (`{id, version, steps}`) rendered by `WizardShell`;
anything beyond choice/text/number is a `type:'custom'` step calling `api.submit()`.
Bump the def `version` when steps change so persisted state can't strand a user.

## 5. Data access

- **All Supabase access goes through `js/db.js` (`BallisticDB`).** UI modules and
  engines never touch the Supabase client. db.js owns camelCase↔snake_case mapping
  and scopes every query by `user_id`.
- Every insert sets a **client-generated UUID** (`generateUUID()`), never a
  server-side-only key — this is what makes offline queueing possible.
- New tables get `created_at timestamptz default now()` **and**
  `updated_at timestamptz default now()`.
- Store **snapshots, not references**: sessions copy bullet diameter, velocity,
  weather, rifle/load names into the row.
- Images go to Supabase Storage (`session-images/{userId}/{sessionId}.jpg` +
  `_thumb.jpg`), never into IndexedDB or Postgres rows. Image upload failure must
  never block a record save.
- localStorage: settings and flags only, never domain data.

## 6. Foundational data principles (contract Part 0.6, condensed)

1. **Offline-first.** Every v1 job works with zero signal. Field-logging writes go
   through the sync queue (`SyncQueue.write('addX', payload)`), which calls db.js
   directly when online and queues (IndexedDB `yort_sync`) when offline or on
   network failure. Flush is FIFO on reconnect. **The device is the source of truth
   for a session in progress** — server data never overwrites unsynced local work
   (flush = upsert by client UUID, client wins). Photos queue as blobs and upload
   after their session row lands.
2. **Immutable event history.** Zeros, truings, MV measurements, tracking
   verifications, sessions are **append-only events**. "Current" numbers on a rifle
   are derived/cached state pointing at source events — never the only copy. Normal
   app flows never destroy user records; no deletion-on-lapse logic anywhere.
3. **Measurement provenance everywhere.** Every meaningful number carries a quality
   stamp that travels with it: MV measured/estimated/box (+date, shot count, SD);
   zero shot-count + date; environment `'measured'|'manual'|'lookup'|'default'`;
   truing distance as % of supersonic range. The data model always knows, even when
   the display is subtle.
4. **Single-user accounts.** One account = one shooter. Certificate handoff is a
   one-time transfer, not shared access.
5. **Retention & trust.** Lapsed/free users keep read-only access and export rights.
   Explicit account deletion (user-initiated) is the only deletion path.
6. **User data export.** Self-service CSV export of everything, generated
   client-side, always available.
7. **Units per rifle.** The per-rifle MOA/MIL/Inches preference flows through every
   screen, stepper, export. Convert internally; display in the rifle's units. No
   mixed-unit leaks.

## 7. Security

- **RLS on every per-user table**, four named policies, idempotently guarded:
  ```sql
  ALTER TABLE x ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Users can read own x" ON x;
  CREATE POLICY "Users can read own x" ON x FOR SELECT USING (auth.uid() = user_id);
  -- + insert (WITH CHECK), update, delete; plus:
  CREATE INDEX IF NOT EXISTS idx_x_rifle ON x(user_id, rifle_id);
  ```
- Registry/server-only tables: RLS enabled with **no** policies + `REVOKE ALL` from
  `anon` and `authenticated`; access only via `SECURITY DEFINER` functions that
  `SET search_path = public`, check authorization **inside the function**
  (`is_crowd_admin()` pattern), and are `REVOKE`d from public/anon with
  `GRANT EXECUTE TO authenticated`.
- **Never trust the client** for limits, caps, entitlements, or admin gating —
  enforce server-side (serverless proxy or SECURITY DEFINER). Client-side gates are
  UX, not security.
- Secrets (Anthropic key, service keys, transfer-token signing) live server-side in
  `api/` only. The Supabase anon key is the only key shipped to the browser.
- Transfer/import tokens are single-use, opaque, minted and redeemed server-side.

## 8. Naming

- Tables/columns: `snake_case`; JS: `camelCase`; db.js maps between them.
- Files: kebab-case (`steel-session.js`); classes `PascalCase` manager names
  (`SessionFlow`); IIFE namespaces PascalCase (`ToolRegistry`, `Categories`).
- Event tables named as what they are: `zero_events`, `truing_events`,
  `mv_measurements`, `tracking_verifications`.
- User-visible brand: **Proven** ("PROVEN." wordmark). The only permitted
  user-visible "yorT" is the **Ask yorT** assistant. Code internals, db names, repo,
  URLs are never renamed.

## 9. Testing

- Suites are standalone Node scripts: `node tests/test-<name>.js`. No runner, no
  package.json. Harness pattern:
  ```js
  var passed = 0, failed = 0;
  function check(label, actual, expected) { /* ✓/✗, epsilon for numerics */ }
  // ... assertions ...
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
  ```
- **Every pure engine module ships with a suite.** Parsers test against real-format
  fixtures in `tests/fixtures/` and must reject unrecognizable input loudly
  (`checkThrows`), never guess.
- Solvers prove themselves by **round-trip**: generate synthetic observations from a
  known perturbation, assert recovery within tolerance.
- All suites green at every commit. Current baseline: **385 tests**. New features
  raise the count, never lower it.
- Defensive coding everywhere: validate inputs, handle null/undefined, no silent
  failures; per-row problems become `warnings[]`, structural problems `throw`.

## 10. UI standards

- Tokens only: **no hardcoded colors/sizes/spacing outside `css/tokens.css`.**
  Light "field paper + ink + gold" default; dark "graphite + brass" via
  `[data-theme]`. Both themes must pass visual QA.
- Tap targets ≥52px (primary actions ≥58px, rows ≥64px). Body text 18px.
  Tabular/mono numerals for all data. **No emoji anywhere**; one thin-stroke SVG
  icon family (`js/icons.js`).
- **Verdict-first**: plain-English verdict on top, numbers underneath. Coach voice
  for guidance — teaches, never nags, always offers the escape ("true anyway").
  Silence is a feature: monitors speak only when true.
- Wrong-rifle protection: every saving flow restates the rifle on its final confirm
  control ("Save to TB 6.5 PRC").
- Outdoor budgets: ≤3 taps from Home to logging; wizards one question per screen,
  resumable; empty states = one sentence + one button; steppers first, keyboard only
  via explicit number-pad taps (`inputmode="numeric"`).
- No browser-only assumptions (Capacitor wrap is planned): configurable API base
  (`NetService.apiBase()`), standard web APIs for camera/GPS/sensors, no reliance on
  `<a download>`/`iframe.print()` semantics.

## 11. Deploy checklist (every step commit)

1. All Node suites green.
2. New JS files: `<script>` tag in `index.html` **and** `APP_SHELL` entry in `sw.js`.
3. Bump `CACHE_VERSION` in `sw.js` on any app-shell change.
4. Commit + push (`redesign` branch); migrations are never run by the assistant.
5. Keep the current build report (`REORG-REPORT.md`) updated: judgment calls,
   deviations, deferred-item seams.
