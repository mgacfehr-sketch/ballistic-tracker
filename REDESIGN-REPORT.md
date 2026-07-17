# PROVEN — Presentation Rebuild Report

Ground-up presentation rebuild on branch `redesign` (run of 2026-07-17,
superseding the previous graphite-instrument pass), executed per
`docs/mockups/PROVEN-build-contract.md`. The design system is the token
block in `docs/mockups/proven-templates-v2.html`, transcribed verbatim
into `css/tokens.css`; Home is Option 1 (action-first) from
`proven-home-two-options.html`; all five category screens follow the
"Shoot" frame in `proven-click-two.html`. The engine — calculations.js,
velocity-stats.js, garmin-import.js, ballistic-solver.js, wizard-core.js,
db.js, net.js, schema, tests, SW offline strategy — is untouched.
**All 385 unit tests green at every commit** (71+37+103+49+8+117).

## Build log (one commit per step, CACHE_VERSION bumped each)

| Step | Commit | What |
|---|---|---|
| 1 | `0a4dea7` | `css/tokens.css` transcribed verbatim (light = field paper + ink + gold, dark = graphite + brass, `[data-theme]` switching); mockups committed under `docs/mockups/`. SW v90. |
| 2 | `251fd09` | Component layer: `css/ui.css` rewritten from blank on the tokens (cards, rowlinks, chips, banners, stat cells, rifle chip, category rows, segmented, gauge, wizard shell, tab bar, brand bar, forms, chat, overlays, admin, solver compat). `js/ui.js` render helpers (mark, brandBar, sectionHead, card, rowlink, chip, banner, statStrip, gauge, rifleChip, catRow). Category icons traced from the mockups into `js/icons.js`. `js/wizard.js` re-skinned to Template D. SW v91. |
| 3 | `7c76cf1` + `fab6bfc` | Navigation shell: login rebuilt under the Proven brand (W-dial SVG mark, PROVEN wordmark with gold period, "Proven by Workhorse" seal), header brand + theme toggle switching `data-theme` (light default, `yort_theme` key, migrates the old sunlight flag), theme-color meta synced from tokens, tab icons per mockups, Wind header button removed (Wind lives inside Shoot), `manifest.json` → Proven. SW v92. |
| 4 | `85af50f` | Home §3.1 (brand bar · Alerts · the five job categories · Recent) + `js/categories.js` (ONE category-screen component, five instances) + `js/readiness.js` (the single shared READY/ADJUST/NOT CHECKED verdict). THE RIFLE CHIP with switcher; per-category "For this rifle" strips; dormant tools as gold "＋ Add" rows (replaces the Home drawer; ToolRegistry + presets unchanged). Wrong-rifle protection: "Save to \<rifle\>" on session + field saves, "Assign … to \<rifle\>" on chrono confirms. Launch seams: `SessionLaunch`, `TargetSheet`, `AppNav.openCategory`. SW v93. |
| 5 | `175cfa4` | Rifles fleet tab §3.3 (summary chips line, search >8, status rows with readiness chips, Add rifle · Scan certificate) + slim rifle page §3.4 (identity, verdict banner + Confirm zero, stat strip, build sheet, five category shortcuts). Mega-hub retired; `rifle-cards.js` unshipped (kept on disk for Node tests). SW v94. |
| 6 | `7a43fca` | Forms on Template C (segmented turret-units + suppressor controls, sticky Save/Cancel, guarded delete); wizard verified against the Template D frame; full class sweep of every module vs `ui.css` — all covered. SW v95. |
| 7 | `998a6ee` | Polish: brand wording pass (no user-visible "yorT" outside "Ask yorT"), select-arrow hex moved into per-theme tokens, privacy page restyled on tokens. SW v96. |
| 8 | (this commit) | QA gates, tap-target fixes (hint-btn hit area, backline/Edit/close/step-back ≥52px), this report, morning checklist. SW v97. |

## QA gates

### 1. Headless screenshots (Playwright 390×844 @2x) — `docs/qa-screens/`

| Screen | Light | Dark |
|---|---|---|
| Login | `login-light.png` | `login-dark.png` |
| Home | `home-light.png` | `home-dark.png` |
| Category (Shoot) | `cat-shoot-light.png` | `cat-shoot-dark.png` |
| Category (Ammo & loads) | `cat-ammo-light.png` | — |
| Rifles (fleet) | `rifles-light.png` | `rifles-dark.png` |
| Slim rifle page | `slim-r1-light.png` | `slim-r1-dark.png` |
| Wizard (Template D) | `wizard-light.png` | `wizard-dark.png` |

Compared against the mockup frames: same composition (brand bar → alerts
→ five category rows → recent; chip → tools → strip; verdict banner →
Confirm zero → stats → build sheet → shortcuts; progress bar → step →
question → options → fixed Next/Back), same tokens, same spacing rhythm.
The lot-drift alert on Home is live math (real `lotDrift()` over fixture
strings), not staged copy.

### 2. Tests + VM consistency

- **385/385 Node tests green** (71 calculations · 37 crowd-data ·
  103 foundation · 49 garmin-import · 8 onboarding · 117 velocity-stats)
  at every step commit.
- Script order ↔ SW `APP_SHELL` verified in lockstep (nothing loaded
  that isn't cached, nothing cached that isn't loaded); `readiness.js`
  and `categories.js` added to both; `rifle-cards.js` removed from both.
- No ghost nav: every `data-view` target (`home/profiles/ai` tabs +
  injected `admin`) exists in the `views` map; wind view reachable only
  through Shoot (feature-gated).

### 3. Grep gates

- **Hex**: zero hardcoded hex outside `css/tokens.css` in stylesheets.
  Accepted deviations: canvas *drawing* colors inside JS (marker/export
  rendering — not CSS), one inline error color in **frozen**
  `ballistic-solver.js:533` (CSS-only treatment honored), and the
  standalone `aruco-test.html` diagnostic page.
- **Emoji**: none in rendered UI (icons are the stroke SVG set; the
  "＋" on Add rows and "★" on the Match chip are typographic, as in the
  mockups).
- **Brand**: no user-visible "yorT" outside "Ask yorT". The AI persona
  remains yorT by contract. `yort_*` storage keys, code identifiers,
  and `assets/yorT-target.pdf` intentionally unrenamed.

### 4. Tap-target audit

Tokens enforce the floor: `--tap-min: 52px` on buttons/inputs/segments/
chip controls/nav items, `--tap-primary: 58px` on every primary action
and option row, `--row-min: 64px` on list rows; body type is 18px
(`--type-body`). Small visual affordances (the "?" hint dot) keep a
quiet 28px face but carry a ≥52px hit area via an inset pseudo-element.
Back links, Edit, wizard/overlay close, and step-back are all ≥52px.

### 5. The 44 features — walk list (path through the new navigation)

| # | Feature | Path |
|---|---|---|
| 1 | Target photo group measurement | Home → Check & zero → **Check a target** (7-step session) |
| 2 | Fiducial auto-calibration ("Verified") | inside session step 3 — auto-detects, "Verified" chip |
| 3 | Full group statistics (mean radius, CEP, ATZ) | session step 7 results card |
| 4 | Multi-group ladder test | Home → Ammo & loads → **Run a ladder test** → session → results "Split into ladder groups" |
| 5 | Garmin ShotView import | Home → Ammo & loads → **Import chrono data** |
| 6 | Velocity string stats (avg/SD/ES) | chrono review + load rows (SD on the Ammo & loads list) |
| 7 | Auto load-splitting by velocity clustering | chrono review → "Assign group (n) to \<rifle\>" |
| 8 | Velocity-fingerprint duplicate detection | silent inside chrono import |
| 9 | Ammo-box OCR | Home → Ammo & loads → **Scan ammo box** (scan button atop the load form) |
| 10 | Auto-conditions (GPS + weather) | session step 4 "Get weather"; solver conditions |
| 11 | Rifle/barrel/load profiles + build sheets | Rifles tab → rifle → Edit; build sheet on the slim page |
| 12 | Round count & barrel life | slim page stat strip; Records & proof strip (with edit) |
| 13 | Cold-bore tracking & prediction | Records & proof → **Cold bore log**; hold line on Check/Shoot strips |
| 14 | Zero / scope-adjustment / cleaning logs | Records & proof → Cleaning log · Scope adjustment log |
| 15 | Zero drift tracking | scope adjustment log + readiness verdict history |
| 16 | Suppressed vs unsuppressed configs | Verify equipment → **Bare/Suppressed** toggle + suppressor-shift strip |
| 17 | Scope-tracking verification (tall-target) | Verify equipment → **Verify scope tracking** (wizard) |
| 18 | Session history | Records & proof → **Session history** (misc sessions on the Rifles tab) |
| 19 | G1/G7 solver | Home → Shoot → **Get a firing solution** |
| 20 | Solver truing | inside the solver (uses verified data) |
| 21 | Zero Guardian verdict | session results banner; feeds every readiness word/chip |
| 22 | Travel check | Home → Check & zero → Check a target (one-shot verdict at camp) |
| 23 | Wind Call (spin drift & Coriolis) | Home → Shoot → **Make a wind call** (beta-gated; hidden while `windCall` is off) |
| 24 | Printable DOPE/range cards | Home → Shoot → **Print a DOPE card** (wizard) |
| 25 | Steel/hit logging | Home → Shoot → **Log field shots** ("Save to \<rifle\>") |
| 26 | Wind-call trainer/grader | inside Log field shots (optional wind-call fold) + Shoot strip insight |
| 27 | Personal effective range | Shoot strip "Effective range"; slim page "90% yd" stat |
| 28 | Offline field mode | automatic (SW shell + IndexedDB read cache); conn dot in header |
| 29 | Reloading recipes | Ammo & loads → load → recipe fold (bench tool) |
| 30 | Component lot tracking | recipe fields (powder/bullet/brass/primer lots) |
| 31 | Factory ammo lot manager | load lot number + lot-drift monitoring (alerts, strips) |
| 32 | Load-development logbook | Home → Records & proof → **Development logbook** (per-load, bench-gated) |
| 33 | Ammo Trial (guided A/B/C) | Ammo & loads → Run a ladder test guided flow |
| 34 | Ask yorT | tab bar → **Ask yorT** |
| 35 | Miss Forensics | Ask yorT (context-aware: zero, groups, cold bore attached) |
| 36 | Called Shot mode | session shot-order marking → cold-bore trend (Records) |
| 37 | Verified Handicap | verified-session stats → Performance report (best-group framing) |
| 38 | Crowd dataset foundation | Admin (header, admin accounts) → crowd export |
| 39 | Certificate of Performance | Home → Records & proof → **Certificate** ("Proven by Workhorse" seal) |
| 40 | Performance Report per serial | Home → Records & proof → **Performance report** |
| 41 | Admin dashboard + crowd export | header Admin button (admin accounts only) |
| 42 | Cloud sync/backup | automatic (Supabase via db.js) |
| 43 | Account security/privacy/deletion | Rifles tab → Account fold (privacy policy · Delete account) |
| 44 | Feature activation system | onboarding presets + dormant-tool "＋ Add" rows inside categories; toolless categories hidden from Home |

### Known deviations / notes

- **DOPE-card wizard rifle preselect**: the wizard asks "Which rifle?"
  as its own first step rather than inheriting the chip (the frozen
  wizard core has no answer-injection path). The wizard restates the
  rifle, so no silent cross-rifle write is possible.
- **`css/main.css`** remains on disk, dead and unreferenced (file
  deletions require explicit approval).
- **`js/rifle-cards.js` / `js/dope-log.js` (beta)**: rifle-cards is
  unshipped but kept for `test-foundation.js`; the beta DOPE-log card
  lost its host surface with the mega-hub — it is beta-off today and
  should be re-homed into a category if the flag ever ships.
- **Rifle edit resets `activeConfig` to 'bare'** when the suppressor
  option stays enabled — pre-existing behavior, untouched (engine, not
  presentation).
- Category screens render inside the Home tab; opening one flashes Home
  for a frame while data loads (cosmetic; candidate micro-polish).

---

## Morning browser checklist (in order)

Hard-reload first (Ctrl+Shift+R) — SW v97 must activate.

1. **Home** — light field-paper background, W-dial + PROVEN. brand bar.
   Five category rows with gold icon tiles. Alerts section ONLY if a
   real lot drift exists. Recent row shows your last rifle with its
   readiness chip. No "+ Add a tool" drawer anywhere.
2. **Check & zero** — tap it: gold-bordered rifle chip on top (name ·
   caliber · load · READY/ADJUST word). "Change ›" opens the switcher
   with readiness chips. Tools: Check a target / Quick Mode / Print or
   share a blank target. Strip shows verdict + correction, last
   checked, cold-bore hold. Tap "Check a target" — it should land in
   the session flow with your rifle + load already selected.
3. **Shoot** — the same chip persists (it remembered your rifle).
   Firing solution / Print a DOPE card / Log field shots rows. Open
   Log field shots: the save button must read "Save to \<your rifle\>"
   and re-label when you switch the rifle dropdown.
4. **Ammo & loads** — note under the chip about chrono being
   rifle-aware. Loads list with mono stats and the ★ Match chip on your
   best-proven load. Import chrono data → review: assign buttons must
   name the rifle.
5. **Verify equipment** — scope-tracking row (or your correction % +
   verified date in the strip); Bare/Suppressed segmented control if
   the rifle has a suppressor — tapping it re-renders in place.
6. **Records & proof** — session history / cleaning / scope log / cold
   bore log / performance report / certificate rows. Strip shows
   rounds + since-cleaning + best MOA with an edit row.
7. **Rifles tab** — fleet chips line ("N ready · N need adjustment"),
   every rifle with a one-line status + readiness chip. Add rifle and
   Scan certificate at the bottom. Tap a rifle:
8. **Slim rifle page** — name + mono spec line + Edit, colored verdict
   banner, ink (light) / brass (dark) Confirm zero button, the
   57 / 0.68 / 600-style stat strip, build sheet, five shortcut rows.
   Tap a shortcut — the category opens with THIS rifle in the chip.
   No seven-question card stack anywhere.
9. **One wizard** — Verify equipment → Verify scope tracking: gold
   progress bar, "Step 1 of N", big option rows (selected = gold border
   + cream fill), fixed Next, ‹ Back underneath.
10. **Login / theme** — log out: W-dial mark, PROVEN. wordmark,
    PROVEN BY WORKHORSE seal, ink Log In button. Log back in, tap the
    sun icon: graphite + brass everywhere, brass primary buttons; the
    choice survives reload. Run one session to the results step: the
    save button must read "Save to \<rifle\>".
