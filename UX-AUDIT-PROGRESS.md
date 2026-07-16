# UX Audit — Implementation Progress

Branch `ux-audit`. Updated after each wave.

| Wave | Findings | Status |
|---|---|---|
| 1 (P0) | F1 password reset · F2 AI chat-wipe guard · F3 wizard Back · F4 solver empty states | ✅ done |
| 2 (P1 flow) | F7 F9 F13 F14 F6 F11 F26 (+F20 hint, pulled forward) | ✅ done |
| 3 (P1 data trust) | F15 F5 F12 F10 | ✅ done |
| 4 (P2) | F16a F17 F18(partial) F19 F21 F22 F23(partial) — F20 done in W2 | ✅ done |
| 5 (P3) | F24 F25 F27 F28 F30 F31 — F29 deferred | ✅ done |

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

## Wave 5 notes

- **F24** dashed placeholder for sessions without thumbnails · **F25** duplicate/fingerprint badges moved to their own line under the card title · **F27** cold-bore count tile label no longer repeats the number · **F28** offline state shows a readable "offline" chip instead of an 8px dot · **F30** solver results area says "Drop and wind table appears here after Calculate." · **F31** tiny per-answer cost footer in Ask yorT ("~$0.0042").
- **F29 deferred** (admin.js dead code — file belongs to your crowd-data work right now).

## FINAL — consolidated browser checklist (one sitting)

Setup: after your crowd-data work is committed, do ONE `CACHE_VERSION` bump (deferred from waves 3–5), hard-reload.

**Auth (F1):** 1. Log out → "Forgot password?" with email filled → "reset link sent" → email arrives → link opens app → Set New Password panel → new password ≥6 chars → lands signed in. (⚠ Supabase dashboard → Auth → URL Configuration must whitelist your app URL first.) 2. Empty email → hint appears.
**Wizard (F3, F12, F23):** 3. Every step 2–7 shows ‹ Back; go 4→3→2→3→4: image, calibration, and typed fields all survive; back from Results clears the overlay until you Calculate again. 4. Step titles read "· N of 7". 5. Step 6 has a "?" that explains impact marking; Radial SD row and the Zero Guardian click selector have "?" too.
**Ask yorT (F2, F10, F31):** 6. Mid-chat rifle switch → confirm dialog; Cancel keeps chat + selection; OK starts fresh. 7. Attach a photo → the actual thumbnail shows in your bubble. 8. Each answer gets a small ~$ cost line.
**Solver (F4, F30):** 9. Zero-rifle account → empty state + "Go to Profiles" (works). 10. Rifle with no loads → picker reads "This rifle has no loads — add one in Profiles". 11. Placeholder text sits where the table will render.
**Chrono (F7, F9, F13, F16a, F22, F25):** 12. Rifle picker + base count + explainer visible BEFORE picking a file; they persist after import. 13. Import success shows "Assign to loads →" button — no auto-jump. 14. In review: "+ New load…" reveals an inline name field (no popup); "rounds: ✎" becomes an inline number field (Enter saves, Esc cancels). 15. Load pickers show "(avg N fps)" for loads with confirmed strings. 16. All-confirmed state offers "View Performance Report →". 17. Duplicate warnings render on their own line.
**Profiles (F5, F6, F14, F15, F18):** 18. Rifle list shows the dismissible 4-step workflow card once; dismiss survives reload. 19. Rifle detail: Performance Report is the accented card up top. 20. Load form hint about BC+MV; a load saved with blank MV shows no "0 fps" anywhere. 21. Buttons read Create Barrel / Delete Rifle / Delete Load / + Add Load.
**History/logs (F15, F19, F24):** 22. Session cards never show "undefined yds". 23. Cleaning with 0 rounds and a 0/0 scope adjustment are blocked with inline red text; cold-bore 0/0 likewise. 24. Sessions without images show a dashed placeholder box.
**Certificate (F21):** 25. Generate → page scrolls to the preview.
**Misc (F11, F26, F28):** 26. "Quick Mode" / "New Session" labels. 27. Airplane mode → header shows an "offline" chip.

## Ambiguous decisions made (and why)

1. **Type-DELETE account flow kept as prompt()** — friction is the feature for irreversible deletion; F16 explicitly phased input-prompts only.
2. **Chat-wipe guard = confirm, not auto-preserve** — conversations already persist to History after the first reply; a confirm is honest and cheap, cross-rifle thread-merging would contaminate rifle context.
3. **Back allowed from Results** (not in the audit's minimum) — safe because recalculation is idempotent; post-save back-editing leaves the saved session untouched (Save stays disabled; New Session starts fresh).
4. **Certificate preflight collapse (F21) skipped** — scrollIntoView solves the below-the-fold problem without inventing new UI.
5. **Cold-bore validation requires one non-zero offset** — a real cold shot is never exactly 0.00/0.00; blocking junk beats accepting it.
6. **F31 cost shown per answer, 4 decimals under a cent** — matches the consent screen's transparency promise without a settings toggle.

## Deferred (needs your call / your files)

- **F29** admin dead code (admin.js is in your crowd-data changeset).
- **F18 remainder:** weather-button label unification + "Set scale manually" casing (index.html).
- **One CACHE_VERSION bump** covering waves 3–5, after crowd-data commits.
- **No migrations were needed** — UX-migrations.sql intentionally not created (nothing to run).

## Needs a live phone pass (couldn't verify from code)

- Sunlight-mode contrast of the new amber/red badges, workflow card, and offline chip.
- Small-screen overflow: step header with back-chevron + badge + title + "· N of 7" + help "?" on ~320px width; chrono confirm-rows with the inline name field.
- The 44px ::after hit-zones on help "?" (no visual change — needs finger testing).
- iOS keyboard behavior over the inline round-count editor (blur-commit timing).
- Password-reset email round-trip (needs the deployed URL whitelisted in Supabase).

## ⚠ Concurrent-work guardrail (mid-run)

Your uncommitted crowd-data work appeared in this working tree (modified: index.html, js/admin.js, js/db.js, sw.js; untracked: js/crowd-data.js, CROWD-DATA-migrations.sql). To keep it out of UX commits: waves 3+ stage only their own files, **avoid index.html/db.js/admin.js/sw.js entirely**, defer further CACHE_VERSION bumps (do one bump after your crowd-data work is committed), and defer **F29** (admin dead code — admin.js is yours right now) and **F23's index.html part** (progress-bar CSS default + step counter markup; the CSS half ships in Wave 4).
