# UX Audit — Implementation Progress

Branch `ux-audit`. Updated after each wave.

| Wave | Findings | Status |
|---|---|---|
| 1 (P0) | F1 password reset · F2 AI chat-wipe guard · F3 wizard Back · F4 solver empty states | ✅ done |
| 2 (P1 flow) | F7 F9 F13 F14 F6 F11 F26 | ⏳ next |
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
