# UX Audit — Implementation Progress

Branch `ux-audit`. Updated after each wave.

| Wave | Findings | Status |
|---|---|---|
| 1 (P0) | F1 password reset · F2 AI chat-wipe guard · F3 wizard Back · F4 solver empty states | ✅ done |
| 2 (P1 flow) | F7 F9 F13 F14 F6 F11 F26 (+F20 hint, pulled forward) | ✅ done |
| 3 (P1 data trust) | F15 F5 F12 F10 | ✅ done |
| 4 (P2) | F16a F17 F18(partial) F19 F21 F22 F23(partial) — F20 done in W2 | ✅ done |
| 5 (P3) | F24 F25 F27 F28 F29 F30 F31 | — |

## Wave 1 notes

- **F1:** "Forgot password?" link on auth (uses the email field; hint if empty) → `resetPasswordForEmail` with `redirectTo` = current origin; `PASSWORD_RECOVERY` auth event reveals a "Set New Password" panel → `updateUser({password})` → straight into the app. ⚠ Supabase dashboard: the app URL(s) must be whitelisted under Auth → URL Configuration for the email link to return correctly.
- **F2:** rifle switch with a live chat now confirms first; message distinguishes saved chats ("stays under History") from never-replied chats ("will be lost"). Cancel restores the previous selection.
- **F3:** ‹ Back button on steps 2–7; all entered state (image, calibration, fields, POA, impacts) persists both directions; leaving Results clears the overlay + centroid (recalculate rebuilds). Also added the missing step-6 help "?" (impacts entry in HELP_TEXTS) since the header was being edited anyway (borrowed from F12).
- **F4:** zero-rifle Solver → empty state with "Go to Profiles" button (same pattern as the session wizard's); rifle-with-no-loads → "This rifle has no loads — add one in Profiles."
- Decisions: back-into-calibrate keeps the previous scale and status (taps there can restart manual calibration — acceptable; Redo exists). Backing out of Results after a save leaves the saved session as-is (Save stays disabled; "New" starts fresh).
- No migrations needed so far (UX-migrations.sql will be created only if a later wave needs one).

## Wave 2 notes

- **F7:** chrono is rifle-first now — rifle picker, base round count (with the F20 explainer hint, pulled forward since the panel was being rewritten), and barrel checkbox render before any file is chosen and persist across imports. Review mode hides the import section; "← Back to Import" restores it.
- **F9:** auto-jump replaced with an explicit "Assign to loads →" button appended to the import status line.
- **F13:** all-confirmed review state now offers "View Performance Report →" (new `window.ReportNav` bridge in app.js, mirroring ChronoNav).
- **F14:** Performance Report promoted to its own primary-accented card directly under the rifle header (sub-line "Best group · velocity stats · certificate"); removed from the History & Logs list.
- **F6:** one-time dismissible "From ammo box to certificate" 4-step card at the top of the rifle list (dismiss persisted via `workflowCardDismissed` setting).
- **F11/F26:** "Quick / Misc" → "Quick Mode" (matches the empty-state copy); results "New" → "New Session".
- Decision: chrono's old "Assign to rifle (optional)" wording died with F7 — a rifle was already mandatory at import since the lost-work fix, so the panel now says "Rifle for this import".

## Wave 3 notes

- **F15:** all four raw `distanceYards` interpolations in history now go through `formatNum` (— instead of "undefined yds"); load cards build their sub-line from present parts only (no "· 0 fps", no dangling separators); blank BC/MV/bullet-length now store as **null**, not 0.
- **F5:** load form hint under Muzzle Velocity: "BC + muzzle velocity are needed for the Solver — leave blank if unknown."
- **F12:** HELP_TEXTS gained `impacts` (Wave 1), `radialSD`, `clicks`; "?" wired on the Radial SD results row and the Zero Guardian click selector. (Solver info-card BC "?" skipped — display-only card, load form already has the BC help.)
- **F10:** attached AI images now render as real thumbnails in the chat bubble (built from the base64 already in the message — no extra storage); "[Image attached]" tag remains only as a fallback.

## Wave 4 notes

- **F16a:** both `prompt()` INPUT flows replaced — "+ New load…" reveals an inline name field next to the picker; "rounds: N ✎" swaps to an inline number field (Enter/blur saves, Escape cancels). `confirm()` stays for destructive checks by design; the type-DELETE account flow keeps `prompt()` deliberately (friction is the feature there).
- **F17:** 44px hit areas via CSS — help "?" and sunlight button get invisible ::after hit-zones (visual size unchanged); presets/nav/logout/btn-sm/target/chrono buttons bumped to min-height 44.
- **F18 (partial):** "Add Barrel"→"Create Barrel", form "Delete"→"Delete Rifle"/"Delete Load", "+ Add"→"+ Add Load". **Deferred (index.html is yours right now):** weather-button label unification, "Set scale manually" casing.
- **F19:** inline `.form-error` validation (no alerts): cleaning requires rounds > 0; scope adjustment and cold-bore entries require at least one non-zero value.
- **F21:** certificate preview scrolls into view on generate (collapse-to-summary skipped — scroll solves the fold problem without new UI).
- **F22:** review load pickers now show each load's confirmed avg fps.
- **F23 (partial):** "· N of 7" counter injected beside step titles via JS; progress-bar CSS default corrected to 14.3%. (No index.html edits needed after all.)

## ⚠ Concurrent-work guardrail (mid-run)

Your uncommitted crowd-data work appeared in this working tree (modified: index.html, js/admin.js, js/db.js, sw.js; untracked: js/crowd-data.js, CROWD-DATA-migrations.sql). To keep it out of UX commits: waves 3+ stage only their own files, **avoid index.html/db.js/admin.js/sw.js entirely**, defer further CACHE_VERSION bumps (do one bump after your crowd-data work is committed), and defer **F29** (admin dead code — admin.js is yours right now) and **F23's index.html part** (progress-bar CSS default + step counter markup; the CSS half ships in Wave 4).
