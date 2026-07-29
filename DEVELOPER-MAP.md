# DEVELOPER-MAP.md — every JS file, its role, and what governs it

**Purpose:** a working map for whoever next opens this codebase cold —
what each file does, whether it's hash-locked (protected engine),
and which canon/contract sections it implements. Generated overnight
run #2, item 5, from each file's own header comment + the live
protected-engine fixture (`tests/fixtures/protected-engine-hashes.json`)
+ `docs/canon/`. Update this file whenever a file is added, removed, or
its role changes materially — it decays otherwise, same as any map.

**How to read "Protected":**
- **PROTECTED** — byte-hash-locked in `tests/test-protected-engine-hashes.js`
  against `tests/fixtures/protected-engine-hashes.json`. Any edit fails
  that test until the fixture is deliberately updated in the same
  commit as the change, per Gate 0's "freeze truth" discipline
  (`docs/canon/PROVEN-Amendment-1.md` Part B). These 8 files are the
  mathematical/data-shape authorities the rest of the app defers to.
- **shadow-stage** — `js/residual-engine.js` only: tested and disclosed
  as a candidate for the same discipline once promoted out of shadow
  (Amendment 1 A11, `E-SHADOW-SPEC.md` §10), not protected yet
  (PHASECD-REPORT.md's own disclosed follow-up #7).
- **plain** — everything else. Ordinary application code, editable
  freely subject to the usual test suite / canon manifest gates.

For the canon documents themselves (Product Definition, Constitution,
Validation Doctrine, Evidence & History Doctrine, Amendment 1) see
`docs/canon/MANIFEST.md`. This map cites them by shorthand (A1–A17 =
Amendment 1 parts; §N = a numbered section in whichever doctrine a
file's own header names).

---

## 1. Bootstrap, auth, navigation

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `app.js` | Supabase client init, login/signup/logout, initializes every manager, top-level nav/routing. | plain | — |
| `net.js` | `NetService` — the one place calls to this app's own backend (`/api/chat`) go through, so the base URL stays configurable for a future Capacitor WebView. | plain | CLAUDE.md Build Principle #1/#2 |
| `utils.js` | UUID generation, formatting, help tooltips, canvas helpers, `friendlyError()`. No DOM access. | plain | — |
| `icons.js` | The single SVG icon family (Lucide-style, thin-stroke). Every icon in the product comes from `Icon(name, size)` here. | plain | REDESIGN-SPEC II.5 (no emoji anywhere) |
| `ui.js` | Render-helper templates (A–E) — the one place UI structure is stamped from, on top of `css/tokens.css`/`css/ui.css`. | plain | — |

## 2. Protected calculation / solver engines

These 8 files are byte-hash-locked. Nothing else in the app reaches
around them; UI and coach-brain modules call into them, never
reimplement their math.

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `calculations.js` | Pure group-analysis math: MOA conversion, centroid, mean radius/CEP, radial/vertical/horizontal SD, zero verdict. | **PROTECTED** | CLAUDE.md Architecture Rule 1 |
| `ballistic-solver.js` (top section) | Point-mass G1/G7 trajectory solver, RK4 integration, secant zero-finding. (Bottom section, `BallisticSolverManager`, is the plain UI layer over it, same file.) | **PROTECTED** | CLAUDE.md Architecture Rule 1 |
| `truing-core.js` | Two-stage, Mach-bracket-aware truing engine (MV truing supersonic, drag truing transonic) + device compensation. | **PROTECTED** | A1 (Mach-bracket doctrine, sole truing-routing authority) |
| `simple-true.js` | One-observation truing mode — "WHERE DID IT HIT?" → immediate payoff, doctrine-routed silently through `truing-core.js`. | **PROTECTED** | Contract v2.5 §2.3 |
| `velocity-stats.js` | Population-SD (never sample SD) velocity statistics, matching what a Garmin chronograph itself reports. | **PROTECTED** | — |
| `garmin-import.js` | Pure Garmin ShotView CSV/XLSX parser — structure found by content, never row position; never guesses. | **PROTECTED** | — |
| `calibration-status.js` | THE Calibration Status / PROVEN TO rollup — four elements derived from append-only events, never a wizard. | **PROTECTED** | A3 ("frozen with golden test vectors before any refactor touches its inputs") |
| `target-geometry.js` | THE single-source-of-truth ArUco target geometry constants; `aruco-calibration.js` and `target-pdf.js` both derive from it. | **PROTECTED** | v2.4 Part 3 |

## 3. Shadow-stage engine

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `residual-engine.js` | Per-shot residual decomposition (explained-by-velocity vs. unresolved). Computes and may log; nothing reads its output back yet — no live wiring to truing/solutions/PROVEN TO. | shadow-stage | A11; spec in `E-SHADOW-SPEC.md` v1.1.0 |

## 4. Database access

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `db.js` | `BallisticDB` — the ONLY module allowed to touch the Supabase client. Owns camelCase↔snake_case mapping, every `user_id` scope, Storage uploads, fact-spine dual-write, shadow logging, admin RPCs. | plain (but architecturally load-bearing — CLAUDE.md Architecture Rule 2) | Amendment 1 Phase B (fact_events dual-write), Phase C (config_epochs/recurring_targets), Phase D (troubleshooting_checks), Phase E (residual_shadow_log) |
| `offline-cache.js` | Read-only IndexedDB mirror of rifles/barrels/loads for offline reading. | plain | A16 |
| `sync-queue.js` | The offline WRITE queue — `SyncQueue.write('addX', payload)` durably enqueues when offline, flushes on reconnect. | plain | A16, Part 0.6 #1 |

## 5. Image capture, calibration, canvas

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `canvas-manager.js` | HTML5 Canvas: image load, pinch-zoom/pan, marker rendering, screen↔image coordinate conversion. | plain | CLAUDE.md Architecture Rule 4 (mobile-first) |
| `calibration.js` | Manual two-tap 1-inch calibration state machine (idle→waitingA→waitingB→complete). | plain | CLAUDE.md Architecture Rule 6 |
| `aruco-calibration.js` | Automatic ArUco marker detection + 4-point homography warp; falls back to manual calibration. | plain (derives from the protected `target-geometry.js`) | v2.4 Part 3 |
| `target-pdf.js` | Generates the printable ArUco calibration target PDF. | plain (derives from the protected `target-geometry.js`) | v2.4 Part 3 |
| `export.js` | Renders the annotated results image (markers + stat overlay) onto an offscreen canvas for saving/sharing. | plain | — |

## 6. Session capture — legacy/detailed lane

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `session-flow.js` | The original step-by-step paper-session state machine: PROFILE→LOAD→CALIBRATE→DATA→POA→IMPACTS→RESULTS. | plain | — |
| `steel-core.js` | Pure logic for steel/field sessions: stepper increments, offset formatting, chrono-to-impact reconciliation. Node-tested. | plain | §2.2 |
| `steel-session.js` | The Steel/Field Session job UI, casual and full tiers. | plain | §2.2 |
| `chrono.js` | Garmin ShotView import UI: parse → preview → dedup-checked assignment to a rifle. | plain | — |
| `labradar-import.js` | Pure LabRadar CSV parser, same "never guess" discipline as `garmin-import.js`. | plain | §2.2 |
| `zero-guardian.js` | Plain-English zero verdict banner over `calculations.js`'s pure `zeroVerdict()`. | plain | — |

## 7. Session capture — v3/v4 Card system (current primary UI)

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `rifle-app.js` | `RifleApp` — THE RIFLE, the app's only resting screen. Owns the add-chooser, steel/chrono/payoff/why/chart/record sibling screens. | plain | Contract v3.0 Part 1 |
| `rifle-add.js` | "WHAT HAPPENED?" — the three fact cards: zero (`_zeroScreen`), steel (`_steelScreen`), chrono (`_chronoScreen`). Save always happens before any analytic gate. | plain | Contract v4.0 Part 2; Anti-Pattern #94 |
| `rifle-payoff.js` | THE PAYOFF — runs `simple-true.js` on an already-saved hit; "add more shots" IS detailed truing now. Amendment 1 Phase D validation gate lives here. | plain | Contract v3.0 Part 1 view 4; A1, A10 |
| `rifle-why.js` | WHY — the four calibration elements in plain language, each tappable into its own fact card. | plain | Contract v3.0 Part 1 view 5 |
| `rifle-chart.js` | FULL CHART — complete drop table + "for your rangefinder" block. | plain | Contract v3.0 Part 1 view 6 |
| `rifle-record.js` | A RECORD — edit/delete any logged record; corrections are "undone," never destructively deleted (append-only). | plain | Contract v3.0 Part 1 view 7; STANDARDS §6.2 |
| `fact-draft.js` | Autosaves every fact card's in-progress state to localStorage; drafts survive crash/close/offline, clear only after a real save. | plain | Contract v4.0 Law 4 |
| `feed-core.js` | Pure: merges every event source for one rifle into one newest-first, plain-language feed. | plain | Contract v3.0 Part 1 view 1 |

## 8. Session capture — simple lane (v2.5, superseded by §7 but still live)

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `lanes.js` | The Simple/Detailed lane toggle — both write the same tables/events underneath. | plain | Contract v2.5 Part 1 |
| `log-shooting.js` | LOG SHOOTING — "paper or steel?" one-flow entry point; populates the live `ToolActions` registry. | plain | Contract v2.5 §2.2 |
| `mv-entry.js` | ADD BULLET SPEED sheet — the front door wherever velocity is requested, never import-gated. | plain | v2.5 §2.5 |
| `rifle-simple.js` | MY RIFLE — the simple lane's one scrolling page. | plain | Contract v2.5 §2.4 |
| `home.js` | `HomeManager`/`HomeCore` (pure ordering) + `Recents` (used live by half a dozen other files). | plain | Contract v2.4 §1.1 |

## 9. Coach brain / validation (Amendment 1 Phases C–D)

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `config-memory.js` | Carry-forward current state (suppressor/lot) + the compatibility/invalidation service. | plain | A12, A15; Constitution §12.1–12.2, §120 |
| `validation-status.js` | Settling segments, spot-check three-outcome classification, one-shot check copy, troubleshooting hold. | plain | A4, A5, A6, A10 |
| `historical-insights.js` | Deterministic whitelist of trigger→insight rules, one statement at a time. | plain | A13 |
| `round-budget.js` | Pre-trip round budgeting, request-only, never a capture prerequisite. | plain | A14 |
| `next-action.js` | THE NEXT ACTION engine — one suggestion from calibration state + data present. | plain | Contract v2.4 §1.2 |
| `readiness.js` | The one shared "is this rifle ready?" computation every readiness chip/word calls. | plain | — |
| `suppressors.js` | Per-user suppressor library; `rememberLastUsed` writes `config_epochs` facts on real changes only. | plain | §1.3b |

## 10. Truing / scope / DOPE

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `truing.js` | The Truing job UI (Quick/Full modes) over the protected `truing-core.js`. | plain | §2.5 |
| `scope-check.js` | Tall-target scope-tracking verification wizard. | plain | — |
| `dope-cards.js` | Printable DOPE/range cards. | plain | Budget C |
| `dope-log.js` | Come-up verification log + BC truing card. Admin-only beta, currently unreachable (`dopeLog` beta flag hard off). | plain | beta |
| `ladder.js` | Multi-group ladder test over the session engine. | plain | Budget C |
| `field.js` | Steel/hit logging, wind-call grader, personal effective range. | plain | F4/F5/F6 |
| `wind-call.js` | Wind/Coriolis/spin-drift hold calculator. Admin-only beta. | plain | beta |
| `cold-bore.js` | Cold-bore first-shot tracking (always visible, not beta-gated). | plain | — |

## 11. Profiles, records, export

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `profiles.js` | Rifle/Load profile CRUD UI (list, form, detail). | plain | — |
| `new-ammo.js` | "+ New ammo" minimal 3-field load form (name/bullet/weight), unblocks any session flow that dead-ended on "which load?" | plain | — |
| `history.js` | Session history, cleaning logs, scope-adjustment history. | plain | — |
| `records-core.js` | Pure computed surfaces: suppressor shift by can, lot drift, CSV encoding. | plain | §2.7 |
| `data-export.js` | "Export my data" — CSV per type + one-workbook XLSX, client-side, always available. Now includes `fact_events`/`attachment_vault`/derived validation statuses. | plain | Part 0.6 #6 |
| `device-export.js` | Device Sync/Export — what to punch into a rangefinder/solver device that doesn't know the scope's tracking error. | plain | §2.12 |
| `rifle-report.js` | Per-rifle performance report (recommended load, best group, per-load rollup). | plain | — |
| `certificate.js` | Certificate of Performance — canvas render → PDF → share. | plain | — |
| `transfer.js` | Certificate cross-account transfer client (mint/claim via server, client never writes `transfers` directly). | plain | §2.11 |

## 12. Ballistics / DOPE tools

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `ballistics-job.js` | Decorates `BallisticSolverManager` from outside (trued values, scope-tracking-corrected come-ups) without touching the protected solver file. | plain | §2.4 |

## 13. AI assistant

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `ai-assistant.js` | "Ask yorT" — gathers rifle history, sends to Claude via `net.js`/`api/chat.js`, vision-capable. | plain | — |

## 14. Admin / crowd data

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `admin.js` | Admin dashboard — user overview, AI cost, DB stats, export. Client-side gating only on a hard-coded admin UUID (known issue, see CLAUDE.md). | plain | — |
| `crowd-data.js` | Admin-only crowd data warehouse — anonymized velocity strings across all users, sortable/exportable. | plain | — |

## 15. Job registry, onboarding, wizard shell

| File | Role | Protected | Canon / contract |
|---|---|---|---|
| `tools.js` | `ToolsCore`/`ToolRegistry` — job activation registry (tier axis × user axis). | plain | Contract v2.3 §1.2/§1.3 |
| `categories.js` | The five job-category screens, one component/five instances. | plain | §3.2 |
| `wizard-core.js` | Pure Budget-C wizard state machine (one question per screen, resumable). Node-testable, zero mocks. | plain | Master Plan §5.3 |
| `wizard.js` | `WizardShell` — the DOM layer over `wizard-core.js`. | plain | REDESIGN-SPEC III.5 |
| `onboarding.js` | Ammo-box OCR (via Claude vision) + certificate QR deep linking. Gated by `hasFeature('onboarding')` — a DIFFERENT, always-on gate (see below), not a beta flag. | plain | — |
| `beta-features.js` | Two independent gates: `BETA_FEATURES`/`isBetaEnabled()` (currently hard-returns `false` for everyone, including admin) and `STAGE_A_FEATURES`/`hasFeature()` (ships enabled unconditionally — the entitlement-check seam CLAUDE.md Build Principle #4 calls for once billing exists). | plain | — |

## 16. Feature-flag status (read `js/beta-features.js` before trusting this — it changes)

**`isBetaEnabled()` — hard-returns `false` for everyone right now:**
Wind Call (`wind-call.js`), Verified DOPE + BC truing (`dope-log.js`),
Cold Bore Tracking's *flag entry* (present in `BETA_FEATURES` but
CLAUDE.md's Current State documents cold-bore tracking as always
visible/not gated in practice — worth a closer look if that ever seems
inconsistent), Quick Session Start, High Contrast/Sunlight Mode,
Offline Mode's *flag entry*, Session Comparison.

**`hasFeature()` — ships enabled unconditionally today (Stage A):**
Garmin Chrono Import, Certificate of Performance, Zero Guardian, Auto
Conditions, Smart Onboarding (`onboarding.js`).

---

## Deleted this session (overnight run #2, item 4)

`js/rifle-cards.js` and `css/main.css` — confirmed dead (zero
references, not loaded by `index.html`, not in `sw.js`'s precache
list), superseded by the v3/v4 Card system (§7 above). See
`OVERNIGHT2-REPORT.md` for the full verification trail, including one
stale claim from `V3-REPORT.md` that was checked and found no longer
true (`home.js`/`log-shooting.js`/`mv-entry.js`/`rifle-simple.js` are
NOT dead — left in place).

---

## Where the doctrine itself lives

Not JS files, but load-bearing: `docs/canon/PROVEN-Product-Definition.md`,
`PROVEN-Product-and-Interaction-Constitution.md`,
`PROVEN-Validation-Doctrine.md`, `PROVEN-Evidence-and-History-Doctrine.md`,
`PROVEN-Amendment-1.md` (governs the other four wherever it explicitly
modifies them), tracked with a content-hash check in
`docs/canon/MANIFEST.md` / `tests/test-canon-manifest.js` — an edit to
any of these five files without updating the manifest's recorded hash
fails that test on purpose.
