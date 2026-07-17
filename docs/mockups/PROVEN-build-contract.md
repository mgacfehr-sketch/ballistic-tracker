# PROVEN — Presentation Rebuild Contract (paste into Claude Code)

GROUND-UP PRESENTATION REBUILD UNDER THE LOCKED DESIGN. Work on branch `redesign`
(confirm with `git branch --show-current` before anything else). Work autonomously,
commit + push per step, do not stop between steps. This contract supersedes all
previous visual/layout decisions in the repo, including the current state of the
redesign branch. The design is no longer your judgment call — it is specified by
mockup files and this contract. Where the mockups show something, match them; where
they don't, extend their token system, never invent a new style.

## 0. THE LAW (read before anything)
1. `docs/mockups/proven-templates-v2.html` — design tokens + the five templates,
   light and dark. THIS FILE'S TOKEN BLOCK IS THE DESIGN SYSTEM. Transcribe it into
   `css/tokens.css` (CSS custom properties, `[data-theme]` switching) verbatim, then
   build everything from those variables. No hardcoded colors/sizes/spacing anywhere.
2. `docs/mockups/proven-home-two-options.html` — Home is OPTION 1 (action-first).
   Option 2 exists in the file for reference only; do not build it as Home.
3. `docs/mockups/proven-click-two.html` — the "Shoot" category screen is the
   pattern for ALL five category screens; the rifle-hub frame in that file is
   reference for the SLIM rifle page's content, not its structure (see §3.4).
4. `docs/yorT_design_spec.md` — the underlying spec (templates, type scale, tap
   targets, wizard rules). Where it conflicts with the mockups or this contract,
   the mockups and this contract win. Specifically overridden: the four-tab bottom
   bar with raised center button is DEAD; navigation is §3 below.

## 1. BRAND (locked)
- App name in all UI: **Proven** (wordmark style per mockups: "PROVEN" with the
  gold period). The AI assistant remains **Ask yorT** everywhere.
- Do NOT rename code identifiers, database objects, storage keys, repo, URLs, or
  API routes. This is a UI-text and asset rename only. `yorT` may still appear in
  code internals; it must not appear in user-visible UI text except "Ask yorT".
- Mark: the W-dial (gold ring, tick marks, mountain range, W). Recreate it as a
  clean inline SVG (flat, single-color, stroke-based — see the brandbar SVG in the
  mockups) for all UI use: header, login, tab icons where applicable, certificate.
  If `assets/brand/` contains logo files, use them for login/certificate art; if
  not, the SVG mark + wordmark are sufficient — do not use any raster logo with a
  baked-in background anywhere.
- Seal text: **"Proven by Workhorse"** — appears on the login screen (tagline under
  the wordmark, replacing "Measured. Not guessed."), on the Performance Report
  footer, and on the Certificate.
- Light theme = ink primary + gold accents on field paper. Dark theme = graphite +
  brass. Both from the tokens file. Light is the default; the existing theme toggle
  switches `data-theme`.

## 2. WHAT MUST SURVIVE UNCHANGED (the engine)
js/calculations.js, js/velocity-stats.js, js/garmin-import.js, js/ballistic-solver.js
(CSS-only treatment via a compat section, as before), js/wizard-core.js, js/db.js,
js/net.js, the Supabase schema, the service worker offline strategy, and all Node
tests — 385 green at every commit. Never run SQL. Never delete data files. All 44
features must remain reachable and functional; this is a presentation restructure.

## 3. NAVIGATION MODEL (locked — Option 1, action-first)
Bottom bar, three destinations, always visible: **Home · Rifles · Ask yorT**.
Admin stays a header control for admin accounts only. Wind lives inside Shoot.

### 3.1 HOME
Top to bottom: brand bar (mark + PROVEN wordmark) · Alerts (only when true; the
existing monitors feed these) · "What do you want to do?" — the FIVE JOB CATEGORIES
as large rows exactly as mocked:
  1. **Check & zero** — "Photograph a target, confirm you're ready"
  2. **Shoot** — "Firing solution, DOPE cards, log field shots"
  3. **Ammo & loads** — "Chrono data, ladder tests, recipes, lots"
  4. **Verify equipment** — "Scope tracking, suppressor shift, lot drift"
  5. **Records & proof** — "History, reports, certificates"
· Recent (last session/rifle rows with status chips).
The old adaptive per-tool Home actions and the "+ Add a tool" drawer are replaced by
this fixed five-category structure. Tool activation (ToolRegistry) now governs which
ROWS APPEAR INSIDE each category screen, not Home; keep the registry and presets
working (onboarding still applies presets). A category with zero active tools for
this user is hidden from Home.

### 3.2 CATEGORY SCREENS (five instances of one component)
Pattern per the "Shoot" mockup frame:
- Back to Home · category title.
- THE RIFLE CHIP: gold-bordered, top of screen — rifle name, cartridge/load line,
  readiness word; "Change ›" opens the rifle switcher (list with readiness chips).
  Defaults to last-used rifle; persists per session. EVERY tool launched from the
  category runs against the chip's rifle.
- Tools list (rows): the category's tools, gated by hasFeature + ToolRegistry.
- "For this rifle" strip: the category-relevant intelligence for the chip's rifle.
Category contents (all 44 features mapped):
  CHECK & ZERO → tools: Check a target (full session flow), Quick Mode, Print/share
    blank target; strip: readiness verdict + exact correction, last-checked date,
    cold-bore hold. (Zero Guardian, clustering, split/rejoin all live behind
    "Check a target" as today.)
  SHOOT → tools: Firing solution, Print a DOPE card (wizard), Log field shots,
    Make a wind call; strip: effective range by position, cold bore.
  AMMO & LOADS → tools: Import chrono data (NOTE: rifle-NEUTRAL — the import/review/
    assignment flow resolves rifles itself; the chip is informational here, not
    binding), Run a ladder test, the rifle's loads list (rows → Load Detail with
    recipe, lot, logbook), Add load, Scan ammo box; strip: ★ Match load + lot status.
  VERIFY EQUIPMENT → tools: Verify scope tracking (wizard), Bare/Suppressed toggle
    (acts in place, tags all new data), lot-drift status; strip: correction factor +
    verified date, measured config shift.
  RECORDS & PROOF → tools: Session history, Cleaning log, Scope adjustment log,
    Cold bore log, Development logbook (per-load), Performance report, Certificate;
    strip: rounds total/since-cleaning with edit, best group.
- WRONG-RIFLE PROTECTION (required): any flow that SAVES data (session save, field
  string save, ladder save, chrono confirm) restates the rifle name on its final
  confirm control (e.g., "Save to Test"). No silent cross-rifle writes.

### 3.3 RIFLES TAB (fleet)
Fleet summary chips line ("4 ready · 2 need adjustment · 1 not checked") · search
(shown when >8 rifles) · all rifles as rows (name, cartridge + one-line status,
readiness chip) · Add rifle · Scan certificate. Row → slim rifle page.

### 3.4 SLIM RIFLE PAGE (replaces the seven-section mega-hub)
Identity header (name, spec line, Edit) · readiness verdict banner + Confirm zero ·
stat strip (rounds, best MOA, 90% yd) · build sheet · five shortcut rows, one per
job category, each opening that category screen WITH THIS RIFLE pre-set in the chip.
Nothing else. All detail lives in the categories.

### 3.5 WIZARDS & SUB-SCREENS
All wizards (onboarding, session, scope tracking, DOPE, ladder) use the Template D
shell from the mockups (progress bar, one question, big options, fixed Next, Back).
Forms use Template C (segmented controls, sticky Save/Cancel, guarded delete).
Lists use Template A. Login per the templates file with the Proven brand + seal.

## 4. BUILD ORDER (commit per step, bump CACHE_VERSION per step)
1. `css/tokens.css` transcribed from the mockup token block (light+dark). Add the
   mockup files to the repo under docs/mockups/ if not already committed.
2. Component layer: templates A–E as reusable render helpers + component CSS
   (cards, rows, chips, banners, stat strips, rifle chip, segmented, wizard shell
   skin, tab bar, brand bar, the turret-dial gauge SVG as a parameterized helper).
3. Navigation shell: three-tab bottom bar + header (admin/theme/logout) + Login
   rebuilt under the brand.
4. Home (§3.1) + the category-screen component + all five category instances (§3.2).
5. Rifles tab (§3.3) + slim rifle page (§3.4); retire the old rifle-card mega-hub
   (content redistributes; RifleCards slots map into categories/strips).
6. Wizards + forms + remaining screens (history, session detail, load detail,
   logbook, logs, report, certificate, Ask yorT, admin) re-skinned on the templates.
7. Polish: empty states (one sentence + one button), transitions, wording pass
   (Proven brand check: grep UI strings for stray "yorT" outside "Ask yorT").

## 5. QA GATES (self-run before finishing; results in REDESIGN-REPORT.md)
- Headless screenshots of Login, Home, a category screen, Rifles, slim rifle page,
  one wizard step — in BOTH themes — visually compared against the mockup frames:
  same composition, tokens, spacing rhythm. Attach them.
- All 385 Node tests green; VM consistency check (script order, SW shell, no ghost
  nav); grep gates: no hardcoded hex outside tokens.css; no emoji in rendered UI;
  no user-visible "yorT" except "Ask yorT".
- Walk list: every one of the 44 features reachable through the new navigation
  (list each with its path in the report).
- Tap-target audit: interactive elements ≥52px; primary actions ≥58px; body 18px.
Finish with REDESIGN-REPORT.md updated per step + a single morning browser
checklist for me, ordered Home → each category → Rifles → slim page → one wizard →
login/theme, with the specific things to eyeball in each.
