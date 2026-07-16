# UX Audit — Implementation Progress

Branch `ux-audit`. Updated after each wave.

| Wave | Findings | Status |
|---|---|---|
| 1 (P0) | F1 password reset · F2 AI chat-wipe guard · F3 wizard Back · F4 solver empty states | ✅ done |
| 2 (P1 flow) | F7 F9 F13 F14 F6 F11 F26 (+F20 hint, pulled forward) | ✅ done |
| 3 (P1 data trust) | F15 F5 F12 F10 | — |
| 4 (P2) | F16a F17 F18 F19 F20 F21 F22 F23 | — |
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
