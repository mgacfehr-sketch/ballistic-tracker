# Stage B Report

Session started 2026-07-16 on branch `stage-b-build` (from `stage-a-build` @ `d279499`, Stage A frozen there).

## Headline finding

**All three Stage B build items already exist** — they were delivered during the Stage A overnight run (steps 8–10) and refined since. This session verified them against the Stage B spec instead of rebuilding them (rebuilding working, tested code would be churn and risk). Evidence below. The genuinely new work this session is the **Stage C readiness audit** (see STAGE-C-READINESS.md).

## Stage B item verification

| Spec item | Status | Where | Spec-match notes |
|---|---|---|---|
| 1. Zero Guardian | ✅ Built (Stage A step 8, `3b1fb0a`) | `js/zero-guardian.js`, `zeroVerdict()` in calculations.js (+10 Node tests), banner hook + `isZeroSession` wiring in session-flow.js | Green "✓ ZERO CONFIRMED" / amber "Adjust: X clicks DOWN, Y clicks RIGHT" banner above untouched detailed stats; ¼/⅛ MOA selector persisted; gated `hasFeature('zeroGuardian')`. Banner sub-text says "Group center within 0.25 MOA of point of aim" rather than the spec's "— you're ready" (cosmetic; say the word to change copy). |
| 2. Auto-conditions | ✅ Built (Stage A step 9, `8a3fd62`) | `NetService.getConditions()` in net.js; three duplicate fetch sites in session-flow/ballistic-solver/ai-assistant consolidated (tech debt retired — `open-meteo` appears only in net.js); silent auto-fill on the data step with "Auto-filled · tap to refresh"; geolocation denial degrades silently; `getDevicePressure()` documented Capacitor barometer seam (no web API exists); inHg via ×0.02953 | Matches spec exactly; gated `hasFeature('autoConditions')`. |
| 3. Onboarding (OCR + QR) | ✅ Built (Stage A step 10, `8c227aa`) | `js/onboarding.js`: downscale→vision→strict-JSON parse (whitelist + range clamps, 8 Node tests) → prefill load form, never auto-saves; unreadable → "couldn't read the box — enter manually"; deep link reads `?rifle=<id>` after auth, verifies via `db.getRifle`, navigates, cleans URL via `history.replaceState` | Matches spec exactly; gated `hasFeature('onboarding')`. |

**Verification run on this branch:** 218 unit tests green (calculations 59, velocity-stats 102, garmin-import 49, onboarding 8) + headless Zero Guardian check (10/10) + assignment-review render proof (9/9).

## Migrations

`STAGE-B-migrations.sql` contains **no SQL** — Stage B needed no new database objects (file exists with an explanatory header so the checklist doesn't dead-end). Only prerequisite: Stage A's `MORNING-migrations.sql`, which you've already applied.

## Stage C readiness audit

See **STAGE-C-READINESS.md** (written this session) — read-only findings; nothing implemented.

## Consolidated final report

### Done vs. needs-your-verification

- **Fully done this session:** branch `stage-b-build` created and pushed; Stage B spec verified item-by-item against shipped code (table above); `STAGE-B-migrations.sql` (no SQL needed); **Stage C readiness audit** written (`STAGE-C-READINESS.md` — 13 Capacitor findings + 3 security items, read-only, nothing implemented).
- **Code-complete, needs your browser verification:** the three Stage B features themselves — they shipped in Stage A and their browser checks may or may not be done from your morning pass. Checklist below covers exactly them.

### Migrations order

Nothing new. Only prerequisite is Stage A's `MORNING-migrations.sql` (already applied per your testing).

### Single-sitting browser checklist (Stage B features only)

1. **Zero Guardian:** session with impacts tight on POA → green "✓ ZERO CONFIRMED" banner above the untouched detailed stats; save → `is_zero_session = true` in Supabase. Offset group → amber "Adjust: X clicks DOWN/UP, Y clicks RIGHT/LEFT" matching the ATZ card; ⅛-MOA selector doubles the counts and survives reload; no-POA session shows no banner.
2. **Auto-conditions:** session data step fills every weather field silently with zero taps ("Auto-filled · tap to refresh"); fields stay editable; denying location (fresh profile) → plain manual form, no error modal; Solver and Ask yorT "Weather" buttons still work (solver now gets altitude; AI text includes wind direction + elevation).
3. **Onboarding OCR:** Profiles → load form → "📷 Scan Ammo Box" → real box photo prefills fields for review (never auto-saves); blurry photo → "couldn't read the box — enter manually", form stays usable.
4. **QR deep link:** `<app-url>?rifle=<real-id>` while logged in lands on that rifle; garbage id lands safely on home. (Certificate QR scanning needs the deployed URL — Stage C finding C3.)

### Decisions made without stopping

1. **Did not rebuild the three Stage B items** — the session's biggest judgment call. The spec matched shipped, tested code line-for-line (218 tests green on this branch); rebuilding had zero upside and real regression risk. Verified with evidence instead.
2. Left the Zero Guardian banner sub-copy as-is ("Group center within 0.25 MOA of point of aim") rather than the spec's paraphrase ("— you're ready"); one-line change on request.
3. Stage C audit ordered findings by what blocks a native wrap first (API base, deep link, QR origin) rather than by file order — that's the sequence Stage C implementation should follow.

### Surprises

- The Stage B prompt describes already-shipped work verbatim — it appears drafted before the overnight run. Worth reconciling future stage prompts against MORNING-REPORT.md before queuing them.
- The audit found the certificate QR + deep-link pair has **three** stacked native blockers (C1 API base, C2 event-based URLs, C3 QR origin) — they must be fixed together or the printed QRs are dead in native.
- Genuinely good news: Build Principles held up. Camera/GPS use standard shimmable APIs, all network goes through net.js seams that make C1/C3 one-line fixes, and settings already funnel through one choke point (db.setSetting) for the Preferences swap.

### Stage C findings summary

🔴 4 critical (API base default, deep-link event source, QR origin, three `location.reload` flows) · 🟡 5 degraded (no SW on iOS scheme, 6 CDN cold-start deps, `<a download>` fallbacks, iframe-print, Web Share variance) · 🟢 4 hardening (localStorage durability, permission declarations, system dialogs, IDB) · plus **S1: the admin RPCs must get a server-side auth check before any store submission**. Full detail with file:line and fixes in `STAGE-C-READINESS.md`.
