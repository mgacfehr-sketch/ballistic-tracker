# Stage C Readiness Audit — Capacitor Wrap

Read-only audit (2026-07-16, branch `stage-b-build`). Nothing below is implemented — findings only.
Context: inside Capacitor the app is served from `capacitor://localhost` (iOS) / `https://localhost` (Android) out of the app bundle; there is no web server, no real origin, and cold-start URLs arrive through plugins, not `location.search`.

Severity: 🔴 breaks a core flow · 🟡 degrades or partially breaks · 🟢 works but should be hardened.

## 🔴 Critical

**C1. API base defaults to same-origin → `/api/chat` has no server in native.**
`js/net.js:33` (`fetch(apiBase() + '/api/chat')`) with `apiBase()` defaulting to `''`. Under `capacitor://localhost` that resolves to a nonexistent endpoint — Ask yorT and ammo-box OCR both die.
*Fix:* the `yort_api_base` seam already exists; for native builds ship a hard default (build-time constant = production origin) instead of relying on a localStorage value that starts empty. One-line change in `apiBase()` when the deploy URL exists.

**C2. QR deep link never fires in native.**
`js/onboarding.js:186` reads `window.location.search` once after auth. A QR scan that opens the native app delivers its URL via the Capacitor App plugin's `appUrlOpen` event (and universal-link config), not `location.search` — so certificate QRs would do nothing in the wrapped app.
*Fix:* keep the current web path; add a listener seam (e.g. `Onboarding.handleUrl(url)`) that the Capacitor bootstrap can call from `appUrlOpen`. Requires universal-link/app-link setup so the printed `https://` QR opens the app.

**C3. Printed QR base URL would be `capacitor://localhost`.**
`js/net.js:53-54` — `appBaseUrl()` falls back to `window.location.origin + pathname`. A certificate generated inside the native app would carry an unscannable-to-web `capacitor://localhost?rifle=…` QR.
*Fix:* hard-default `appBaseUrl()` to the production `https://` URL (needed anyway for C2's universal links); keep the localStorage override for dev. (Already noted for the Vercel deploy; native makes it mandatory.)

**C4. `window.location.reload()` in three load-bearing flows.**
- `js/app.js:162` — logout
- `index.html:334` — service-worker update handler
- `js/profiles.js:119` — post account-deletion (`location.href = pathname`)
Reload semantics inside a WebView are unreliable (CLAUDE.md Build Principle 2 explicitly forbids relying on them).
*Fix:* logout/deletion → tear down state and show the auth screen in place (or Capacitor App plugin restart); the SW-update path is moot in native (see C5) — guard it.

## 🟡 Degraded in native

**C5. Service worker likely won't run at all on iOS.**
`index.html:321-334` registration + all of `sw.js`. WKWebView does not support service workers on the `capacitor://` custom scheme; the offline app-shell, CDN caching, and the SW_UPDATED auto-reload flow silently vanish.
*Fix:* that's acceptable — in native, the shell ships inside the app bundle (no SW needed). Guard registration (`if (!window.Capacitor)`), and treat C6 as the real offline story.

**C6. Six CDN `<script>` dependencies at cold start.**
`index.html:282-292` — Supabase UMD, js-aruco2 (×3), SheetJS, jsPDF, qrcode-generator (plus `aruco-test.html:44-46`). With no SW cache (C5), a native app opened offline loses Supabase entirely (login impossible) and the optional libs. All are version-pinned, so vendoring is mechanical.
*Fix:* for the native build, bundle these files locally (`js/vendor/`) and reference relatively; keep CDN for the web build if desired. Note the Supabase UMD tag is pinned only to `@2` (floating minor) — pin it fully when vendoring.

**C7. `<a download>` fallbacks are no-ops in WebViews.**
`js/certificate.js:485`, `js/session-flow.js:1277,1305,1419`, `js/history.js:889`, `js/admin.js:189`. Primary paths are fine — certificate/image sharing leads with `navigator.share`, and inside a WebView the mobile-UA branch (`js/certificate.js:466-479`) selects the share path — but every fallback silently does nothing in a WebView.
*Fix:* route saves through a small seam that uses Capacitor Filesystem/Share plugins in native; `<a download>` stays for desktop web.

**C8. Blank-target printing uses `iframe…print()` and `window.open`.**
`js/session-flow.js:1366` (`iframe.contentWindow.print()`), `:1372` (`window.open(BLANK_TARGET_URL,'_blank')`). Both explicitly flagged as WebView-unsafe in CLAUDE.md; printing the ArUco target from the native app would fail.
*Fix:* in native, share the bundled PDF via the share sheet (path already exists at `:1399`) and drop the print/iframe branch behind a capability check.

**C9. Web Share `files:` support varies on Android WebView.**
`js/certificate.js:474`, `js/session-flow.js:1293-1307`, `js/history.js:900-905`. `navigator.share({files})` works in modern Chrome WebViews but not universally; when `canShare` fails the fallback is C7's broken `<a download>`.
*Fix:* same seam as C7 — prefer `@capacitor/share` in native.

## 🟢 Works, harden later

**C10. localStorage for settings/consent/flags/base-URLs.**
`js/db.js:923-944` (settings incl. AI consent), `js/beta-features.js`, `js/zero-guardian.js` (click value), `js/net.js` (base URLs). iOS can evict WKWebView localStorage under storage pressure. No domain data is at risk (that's all in Supabase), but a wiped `ai_consent` re-prompts and a wiped `yort_api_base` would re-break C1 if left localStorage-based.
*Fix:* db.setSetting/getSetting is already the single choke point — back it with Capacitor Preferences in native. (C1's fix — compile-time default — removes the worst case.)

**C11. Permissions plumbing needed for existing standard APIs.**
`navigator.geolocation` (js/net.js:60-70), camera via `<input capture>` (onboarding scan, session photo). Both are the right, Capacitor-shimmable APIs (Build Principle 3 ✓) but need native permission declarations: iOS `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`/photo-library strings; Android manifest permissions. Config task, not code.

**C12. `prompt()/confirm()/alert()` dialogs.**
Used for round-count edits, deletions, DELETE-account confirmation (chrono.js, profiles.js, session-flow.js). They function in WebViews but render as bare system dialogs and `prompt()` is clunky on iOS.
*Fix (optional):* replace with in-app modals or `@capacitor/dialog` during native polish.

**C13. IndexedDB offline cache** (`js/offline-cache.js`) — supported in WKWebView/Android WebView; keep as-is. Same eviction caveat as C10 but it's a read-only mirror by design.

## Security items to close BEFORE any store submission (not Capacitor-specific)

**S1.** `admin_*` RPCs are SECURITY DEFINER with **no server-side admin check**; admin gating is a hard-coded client-side UUID (`js/admin.js:9`). Any authenticated user who calls the RPC directly gets admin data. Known issue in CLAUDE.md — must be fixed (add `auth.uid()` check inside the functions) before shipping binaries.
**S2.** Supabase anon key + URL hard-coded (`js/app.js:12-13`) — normal for Supabase *provided RLS is airtight*; RLS exists on all user tables. Acceptable, but S1 is the exception that breaks the model.
**S3.** Store-compliance features already in place from Stage A: privacy policy page (placeholder text needs legal review + contact email), AI consent gate, in-app account deletion (Apple requirement) — verify the deletion RPC on a throwaway account before submission.

## Suggested fix order for Stage C proper

1. C1 + C3 together (one config constant each; unblocks native AI/OCR and valid QRs)
2. C6 vendoring (offline-capable cold start), then C5 guard
3. C2 deep-link seam + universal links
4. C4 reload removals
5. C7/C8/C9 share/save seam
6. S1 admin RPC hardening (independent; do any time before store)
7. C10–C12 polish
