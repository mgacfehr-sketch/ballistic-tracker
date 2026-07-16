# Morning Report — Stage A Overnight Build

Overnight autonomous run, 2026-07-15 → 16. **All 11 Stage A steps are code-complete.** Every automated check passes: **194 unit tests** across 4 suites (calculations 59, velocity-stats 78, garmin-import 49, onboarding 8), plus headless integration checks (SheetJS pipeline on your real export, jsPDF + QR library pins, Zero Guardian via VM, DB↔SQL column mapping) and a final 10-point consistency review (script load order, SW cache completeness, feature-key registry).

## 1. Status

| Step | Status | Notes |
|---|---|---|
| 1 — _stripActionBlocks + net.js | ✅ Done (pre-tonight) | `bdcacc4` |
| 2 — Garmin ShotView import | ✅ Done (pre-tonight) | `ab2b2a0` |
| 3 — Velocity strings + stats | ✅ Done; migration already run by you | `18a758b` |
| 4 — Load auto-split clustering | ✅ Tests green; UI needs browser check | |
| 5 — Performance Report | ✅ Tests green; UI needs browser check | |
| 6 — Build-sheet fields | ⚠️ Code done — **blocked on Migration 1** | |
| 7 — Certificate + PDF | ✅ Code done; render/export needs browser | |
| 8 — Zero Guardian | ✅ Headless-tested; banner needs browser | |
| 9 — Auto-conditions | ✅ Code done; needs live GPS check | |
| 10 — OCR + QR deep link | ✅ Code done; needs phone + real ammo box | |
| 11 — Hardening + compliance | ⚠️ Code done — **deletion blocked on Migration 2** | |

Service worker: **CACHE_VERSION 58** (bumped once at the end, per your instruction).

## 2. FIRST THING: run `MORNING-migrations.sql`

Open the file (project root), paste into the Supabase SQL Editor, run top-to-bottom. Two blocks, both safe to re-run:

1. **Migration 1 (Step 6):** six optional build-sheet text columns on `rifles` (`ADD COLUMN IF NOT EXISTS`, existing rows untouched). **Until this runs, creating or editing any rifle fails** — the app now always sends these columns.
2. **Migration 2 (Step 11):** creates the `delete_my_account()` function. **Running the migration deletes nothing** — the function only acts when a logged-in user taps Delete Account, and it can only ever delete *that caller's own* rows (no parameters; target comes solely from `auth.uid()`). Unlike the known-issue admin RPCs, this SECURITY DEFINER function is self-scoping.

## 3. Consolidated browser checklist (one sitting, in this order)

**Setup:** run the migrations (above) → hard-reload the app (SW v58; check DevTools → Application → SW) → log in.

**A. Build sheet (Step 6)**
1. Profiles → your rifle → ✎ edit → "Build Sheet (for certificate)" → fill all six fields → Save → re-open: persisted; detail card shows the rows.

**B. Chrono chain (Steps 4, 3)**
2. Chrono tab → import `sample-data/TEST SHOTVIEW SHEET.xlsx` with your rifle selected → 3 session cards; round-count defaults chain from your barrel count; Import → auto-opens **assignment review**.
3. Review shows **2 clusters** (the ~2743 avg session alone; ~2959+2977 together), nothing ambiguous. Assign each cluster to a load (try "+ New load…" for one) → Confirm → they land in "already-confirmed". Check `velocity_strings` in Supabase: `assignment_status='confirmed'`, `load_id` set.

**C. Report + certificate (Steps 5, 7) — the Workhorse deliverable**
4. Profiles → rifle → Performance Report: per-load table (confirmed strings only), best-group card with thumbnail, ★ recommended load.
5. Generate Certificate → pre-flight defaults to the best group + recommended load → Generate → preview shows WORKHORSE header, serial, build sheet ("—" for blanks), target photo, group MOA, velocity row, **QR bottom-right**.
6. **Cross-check every printed number against the report screen by hand.** Export PDF → phone share sheet / desktop download → valid one-page PDF.
7. Scan the QR with your phone camera → app opens on that rifle (log in first). Try `?rifle=garbage` → lands safely on home.
8. Negative test: with any string left unconfirmed, Generate Certificate must show the BLOCK screen, not a certificate.

**D. Session flow (Steps 8, 9, 11.1)**
9. New session → data step: weather fields fill silently, button says "Auto-filled · tap to refresh" (deny location in a fresh profile → silent manual form, no popup).
10. Finish a session with impacts tight on POA → green "✓ ZERO CONFIRMED"; save → `is_zero_session=true` in Supabase. Offset group → amber clicks banner matching the ATZ card; 1/8-MOA selector doubles counts.
11. DevTools offline → save a session → "Save failed… Retry?" dialog; back online → retry saves.

**E. Compliance (Step 11)**
12. Privacy Policy link on the login screen and under Profiles → Account.
13. Fresh browser profile → Ask yorT tab → consent screen appears once; decline blocks chat; accept is remembered.
14. Ammo-box OCR: load form → 📷 Scan Ammo Box → real box photo → fields prefill (uses your Claude proxy; ~fractions of a cent).
15. **Account deletion — THROWAWAY ACCOUNT ONLY:** create a scratch account with a little data → Profiles → Account → Delete Account → type DELETE → verify every table + the storage folder + the auth user are gone, and login fails afterward.
16. (Stretch 11.5) After browsing once online: airplane mode → rifle report still lists imported strings.

## 4. Decisions I made or skipped — your call in the morning

- **"+ New load…" in assignment review** creates a name-only load (bullet fields blank, filled later in Profiles). Alternative: force the full load form mid-flow.
- **Recommended-load rule (prints on the certificate):** only loads with ≥1 eligible group (3+ marked shots) qualify; ranked by best group MOA; ties within 0.01 MOA → lower velocity SD; 5+-shot groups always outrank 3–4-shot ones; velocity-only loads are never recommended. Deterministic and documented — but it's customer-facing, so bless it explicitly.
- **Certificate presentation choices:** `CERT_BRAND = 'WORKHORSE'` text wordmark (no logo asset exists — constant in certificate.js); "Rounds at test" = round count of the latest confirmed string of the certified load; print-white serif page (intentionally unlike the app UI). All easy to change — review on the preview.
- **Privacy policy text is a PLACEHOLDER for legal review** (marked in the page itself); support-contact email still needed.
- **Admin export does NOT include velocity_strings yet** — updating `admin_export_all` would mean replacing existing DB functions, which your rules reserve for you. Flagged as deferred in both migration files.
- **Ambiguity flagging is deliberately symmetric:** when two velocity groups sit close, borderline strings on *both* sides can get "needs your call". Conservative by design.

## 5. Surprises / things worth knowing

- **Garmin uses population SD** (verified against your real export summaries) — used everywhere per your instruction; our numbers match ShotView's displayed stats within 0.1 fps (Garmin computes from unrounded values; the export rounds shots to 0.1 — documented in the tests).
- **The ` ` narrow no-break space is also in the DATE summary row**, not just the Time column. The cleaner strips every Unicode space variant everywhere.
- **No web Barometer API exists** — a PWA cannot read the phone's pressure sensor. `NetService.getDevicePressure()` is the documented Capacitor seam (returns null today; station pressure is used, same as before).
- **Clustering resists chain-drift:** a string joins a cluster only if compatible with *every* member, so 2790→2805→2820 can't silently merge into one blob.
- **Consistency review (all 10 PASS):** every script loads in index.html order without errors in a stubbed VM; every script is in the SW cache and every cached file exists; all cross-module globals resolve; all five `hasFeature` keys registered; QR box inside the page; CACHE_VERSION 58.
- Tech debt retired this stage: root-relative `/api/chat` (Step 1), triplicated Open-Meteo fetch (Step 9), stale db.js "IndexedDB" header (Step 3), latent `isZeroSession` field wired (Step 8).
- Nothing was deleted and no SQL was run against Supabase, per your rules.
