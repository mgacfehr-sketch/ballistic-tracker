# UX Audit — yorT (first-time-user walkthrough)

Branch `ux-audit`, 2026-07-16. Audit-only — no code changed. Method: traced every screen's actual markup and handlers as a new user would hit them (auth → session wizard → profiles → chrono → review → report → certificate → solver → Ask yorT → history → admin), with file:line evidence. Fixes respect the house style: terse, functional, dark, shooter-first. No decorative redesigns proposed.

**Severity:** P0 user is blocked or loses work · P1 user is misled or stranded · P2 inconsistency/friction · P3 polish.

---

## P0 — Blocking / loses work

**F1. No password recovery exists.** Auth screen (index.html:16-33, app.js:100-157) has Log In / Sign Up only — no "Forgot password?" anywhere in the app.
*Hurts:* a user who forgets their password permanently loses access to all their data; support burden lands on you.
*Fix:* "Forgot password?" link → `supabase.auth.resetPasswordForEmail()` + a small reset-completion route. One link, one handler, Supabase does the rest.

**F2. Switching rifles in Ask yorT silently destroys the conversation.** ai-assistant.js:216-223 — changing the "Rifle:" dropdown wipes messages, id, and title with no warning.
*Hurts:* mid-conversation rifle switch (a natural act — "now compare my other rifle") deletes visible work without consent.
*Fix:* confirm before wiping ("Switching rifles starts a new chat — continue?"), or better: keep the thread and inject the new rifle context.

**F3. The 7-step session wizard has no Back.** session-flow.js has `_nextStep` only (:247); no back control on any step; steps 1–2 also lack any explicit forward control (advance is implicit on selection).
*Hurts:* wrong distance? wrong photo? The only recovery is "New" on step 7 or abandoning via the nav — a first-timer redoes the whole session for one mistyped field.
*Fix:* a small "‹ Back" in the step header for steps 2–6 (state for each earlier step already exists; returning to calibrate/POA can reuse the existing Redo logic). Keep step 7 forward-only (results are computed).

**F4. Solver is a dead end for new users, with a misleading label.** ballistic-solver.js — zero rifles: form renders with "Select a rifle..." and disabled Calculate, no pointer to Profiles (:552-579, :699-702). Worse, after selecting a rifle that has no loads, the disabled load dropdown still reads "Select a rifle first" (:579).
*Hurts:* first-timer opens Solver, sees a dead form, has no idea the fix lives in another tab; the wrong message actively gaslights them after they did select a rifle.
*Fix:* empty state with "Create a rifle and load in Profiles first" + a Go to Profiles button (pattern already exists in the session wizard, session-flow.js:296-298); change the no-loads case to "This rifle has no loads — add one in Profiles."

---

## P1 — Misleading / stranding

**F5. Loads can be created that the Solver then rejects.** Load form (profiles.js:797-878) marks BC and Muzzle Velocity optional; Solver requires both (ballistic-solver.js:693-697).
*Hurts:* the app teaches "BC optional" then punishes it two screens later.
*Fix:* keep them optional (chrono-only loads are legitimate) but add an inline note on the form: "BC + muzzle velocity needed for the Solver"; the Solver's existing "edit it in Profiles" hint stays.

**F6. No screen explains the workflow order.** The intended chain — create rifle+load → import chrono → confirm loads → shoot sessions → Performance Report → Certificate — exists only in your head. Each screen's empty state is local; nothing links the chain.
*Hurts:* Workhorse's certificate flow spans four tabs; a new user cannot discover the sequence.
*Fix:* one-time dismissible checklist card on the rifle-list screen (or on rifle detail) with the 4 steps and links; no tour, no modal — one card in house style.

**F7. Chrono import shows its controls in the wrong order.** chrono.js — the rifle picker, base-round-count field, and barrel checkbox only appear AFTER a file parses; the first view is just "Choose ShotView File" + review launcher.
*Hurts:* mental model is "pick rifle, then import for it"; a new user doesn't know the assign panel will appear, and may not scroll to it after parsing.
*Fix:* render the rifle picker above the file button from the start (parse still fills the rest below).

**F8. "Session" means two different things.** Chrono preview cards call each sheet a "session" ("3 sessions, 26 shots parsed", chrono.js) while the whole app's core object is a range *session* (targets); saved chrono objects are called "strings" everywhere else.
*Hurts:* first-timers reading "sessions" in Chrono expect target sessions; the review screen then talks about "strings" for the same items.
*Fix:* use "string" consistently across chrono UI ("3 strings, 26 shots parsed").

**F9. Post-import auto-jump is jarring.** chrono.js — 900 ms after "Imported 3 strings…", the screen replaces itself with the assignment review while the user is reading the status.
*Hurts:* unexplained context switch; user may not realize what screen they're now on or why.
*Fix:* replace the timer with a button: "Imported 3 strings (26 shots). → Assign to loads" (primary). Zero surprise, same flow.

**F10. Attached AI images vanish into "[Image attached]".** ai-assistant.js:145,1115 — after sending, the user's photo renders only as that text tag.
*Hurts:* user can't verify which photo the model is discussing (target A vs target B).
*Fix:* render a small thumbnail of the sent image in the message bubble (blob URL already exists at staging time).

**F11. Empty-state mismatch: "use Quick Mode below" vs button "Quick / Misc".** session-flow.js:297 vs index.html:77.
*Hurts:* the only instruction on the new user's very first screen names a button that doesn't exist.
*Fix:* rename the button "Quick Mode" (and F26 covers the third variant "New").

**F12. Advanced jargon has no help where it's needed most.** Step 6 "Mark Impacts" lacks the "?" its sibling steps have (index.html:218); results rows "Radial SD", "Vertical/Horizontal SD", "Mean Elevation/Windage" have no help; a `bc` help text exists in utils.js:99 but no "?" is wired to it anywhere; calibration status uses "yorT target / markers / px/in" unexplained.
*Hurts:* the audience is shooters, but new shooters are exactly who Zero Guardian targets; unexplained stats erode trust in the numbers.
*Fix:* wire the existing help system: add HELP_TEXTS entries (radialSD, sd, impacts, clicks) and "?" buttons; reuse `bc` on the load form and solver.

**F13. Review screen dead-ends after the last confirmation.** chrono.js — once everything is confirmed the screen says "No strings waiting for assignment." and stops.
*Hurts:* the natural next step (Performance Report → Certificate) is two taps away in another tab, undiscoverable from here.
*Fix:* add "→ View Performance Report" button to that state (ChronoNav-style bridge already exists in reverse).

**F14. The flagship is buried.** Performance Report is one row inside "History & Logs" on rifle detail (profiles.js), visually identical to Cleaning Log.
*Hurts:* the entire Workhorse value proposition hides behind a generic list row.
*Fix:* promote it to its own card directly under the rifle header (keep style, just position + a one-line sub "Best group · velocity stats · certificate").

**F15. Raw/unguarded values leak into UI.** `distanceYards` interpolated raw ("undefined yds" if missing — history.js:66,121,613,669); load card sub shows "· 0 fps" for blank MV and a dangling "· " for blank bullet name (profiles.js:513, MV stored as 0 at :923).
*Hurts:* looks broken; "0 fps" reads as data corruption to a shooter.
*Fix:* guard with the existing `formatNum`/"—" pattern; store blank MV as null not 0; build the sub-line by joining only present parts.

---

## P2 — Inconsistent / friction

**F16. Native browser dialogs everywhere.** 30+ `alert()/confirm()/prompt()` calls (full list gathered: profiles, history, chrono, session-flow, solver, AI, cold-bore, admin). Two are *input* flows: new-load-via-prompt and round-count-edit (chrono.js:828, :732), plus type-DELETE account deletion (profiles.js:113).
*Hurts:* system dialogs ignore the dark theme, look alien on iOS, and `prompt()` is hostile on mobile keyboards; inconsistent with the app's form patterns.
*Fix:* phased — (a) replace the two prompt()-input flows with small inline forms now (new load especially: it currently creates half-empty loads that trip F5); (b) keep confirm() for destructive checks until a shared modal exists; don't boil the ocean.

**F17. Touch targets below the app's own 44 px rule.** help "?" 18×18 (css/main.css:568), sunlight 32×32 (:79), presets 32 (:458), nav tabs 40 (:126), logout 38→34 (:2344,2364), btn-sm 34 (:726), chrono rounds-✎/rejoin 32, delete 36.
*Hurts:* the app's core promise is thumb-use at the range (CLAUDE.md rule 4); the help buttons — aimed at beginners — are the least tappable thing in the app.
*Fix:* min-height/width 44px via padding or invisible hit-area (`::after` inset) — visual size can stay.

**F18. Verb soup on buttons.** "Create Rifle"/"Create Load" vs "Add Barrel" vs "+ Log Shot"; "Save Changes" vs "Save"; "Delete" vs "Delete Load"/"Delete Session"; wizard advance is "Continue" ×3 then "Calculate"; tap-fixing is "Redo" (POA/calibrate) vs "Undo Last" (impacts); "Get Current Weather" vs "Weather" for the identical action.
*Hurts:* each inconsistency is small; together they make the app feel unpredictable and increase reading effort.
*Fix:* one pass to a mini style guide: Create X / Save / Delete X / Continue / Redo / Get Weather. (Keep "Calculate" — it genuinely differs.)

**F19. Zero-value log entries save silently.** Cleaning, scope-adjustment, and cold-bore forms have no validation (`parseFloat || 0`) — an accidental empty submit logs a 0/0 MOA adjustment or 0-round cleaning (history.js:497-567, :341-397; cold-bore.js:320-386).
*Hurts:* junk rows pollute trends the AI and cold-bore stats consume.
*Fix:* require at least one non-zero field (scope adj), require rounds > 0 (cleaning); inline hint, not alert.

**F20. Import panel's paired round-count labels are dense.** "Barrel round count BEFORE this import" + per-string "…AFTER this string" (chrono.js) with no hint linking them.
*Hurts:* the before/after odometer model is right but unexplained; users second-guess the prefilled numbers.
*Fix:* one hint line under the base field: "We compute each string's AFTER-count as base + shots so far."

**F21. Certificate preflight stays parked above the preview.** certificate.js — after Generate, the controls remain at top; preview + Export require a long scroll; the status line is small.
*Hurts:* on a phone, the "money moment" (preview) renders below the fold with no scroll cue.
*Fix:* scroll to the preview on generate; collapse the confirm panel into a one-line summary with "Change" link.

**F22. Load dropdowns show different detail levels.** Certificate preflight options show full stats ("avg 2977, SD 21.8…"); assignment-review options show name only.
*Hurts:* in the review — where the user decides which load velocity data belongs to — they get the least information.
*Fix:* add "(avg X fps)" to review load options when the load already has confirmed strings.

**F23. Progress bar lies before JS runs, and carries no step labels.** CSS default width 16.67% = 1/6 for a 7-step flow (css/main.css:295); bar has no step count ("Step 3 of 7").
*Fix:* set default to 14.3%; add "N of 7" text beside the step title.

---

## P3 — Polish

**F24. Empty thumbnails render as blank/broken img.** history.js:64 — sessions without stored images keep an empty `<img>`. *Fix:* CSS placeholder (crosshair glyph) until `.loaded`.

**F25. Fingerprint duplicate warning wraps awkwardly inside the card title.** chrono.js dup badge is long text inside an h3. *Fix:* move badge to its own line under the title (style exists: `.chrono-fp-warn`).

**F26. Three names for "start fresh": "Quick / Misc", "Quick Mode", "New".** Pick "Quick Mode" and "New Session".

**F27. Cold-bore count tile repeats its number in value and label** ("N" over "Based on N cold bore shot(s)", cold-bore.js:184-281). *Fix:* label "cold bore shots".

**F28. Connection dot is 8 px, unlabeled, and looks dead.** css/main.css:1854. *Fix:* pair with the sunlight button sizing; tooltip "Online/Offline" already exists — make the offline state show a tiny "offline" text chip instead.

**F29. Admin dead code.** Beta-toggle handlers bind to elements from a fully commented-out section (admin.js:121-138 vs :162-167). *Fix:* delete the handler block when next touching admin (needs your file-deletion-adjacent approval per standing rules — it's only code lines, but flagging).

**F30. Solver results area is empty pre-calculation.** ballistic-solver.js:708 — nothing indicates where results will appear. *Fix:* placeholder row "Drop table appears here after Calculate."

**F31. AI shows no cost feedback.** Usage is logged (ai-assistant.js:427-440) but users never see it; consent promises logging. *Fix (optional):* tiny per-answer footer "~$0.01" — builds trust and prices future premium tiers.

---

## Suggested build order (if approved)

1. **Wave 1 (P0):** F1 password reset · F2 chat-wipe guard · F3 wizard Back · F4 solver empty states
2. **Wave 2 (P1 flow):** F7+F9+F13 chrono flow order/hand-offs · F14 report promotion · F6 workflow checklist card · F11+F26 naming
3. **Wave 3 (P1 data trust):** F15 raw values · F5 load/solver contradiction · F12 help wiring · F10 image thumbnails
4. **Wave 4 (P2):** F16a prompt()-input replacements · F17 touch targets · F18 verb pass · F19 validation · F20–F23
5. **Wave 5 (P3):** F24–F31 as touched

Every fix above is a clarity change inside the existing visual system — no redesigns, no new dependencies.
