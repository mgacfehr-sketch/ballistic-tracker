# PROVEN — Build Contract v4.0 "The Card"

## Why v4 exists

The creator of the app cannot operate the app. That is the whole finding.
v2.4/2.5/3.0 rearranged doors but kept the house: 7-step wizards, sessions,
histories, paperwork drawers. v4 is a demolition of the UI, not the engines.
The session dies as a user-facing concept. The app becomes: **a rifle, a
number, a chart, and three sentences.**

The product in one sentence: *Tell the app what happened at the range, in
Roy's words, in under 30 seconds — and the number and the drop chart get
more true.*

---

## The Five Laws (override everything else in this contract)

1. **One screen, one button.** The Card is the app. Everything a user needs
   is on it or exactly one tap from it. If a surface is two taps deep, it
   must justify itself or die.
2. **No flow has steps.** A flow is ONE card with 3–5 fields. No "step 1 of
   7" anywhere in the product. If a flow needs more fields than that, it is
   two facts pretending to be one — split it or cut it.
3. **Ask before work, never after.** All required context (rifle, ammo) is
   resolved BEFORE the user types anything. Missing ammo = inline "＋ New
   ammo" (3 fields: name, bullet+weight, speed-if-known) that saves and
   continues. A validation error after data entry is a build failure.
4. **Nothing typed is ever lost.** Every fact card autosaves as a draft on
   every keystroke (localStorage). Drafts survive app close, crash, and
   offline. If a save can't complete, the draft persists and the Card shows
   a "Finish what you started" line. Permanent test: no flow may discard
   user-entered data on any failure, ever.
5. **Roy words only.** If a 60-year-old expert shooter wouldn't say the
   word out loud at the range, it doesn't appear. (Ballistics words are HIS
   words — "zero," "dial," "drop" are fine. "Session," "calibration,"
   "import," "sync" are not.)

---

## The entire app: 7 surfaces, all one tap from the Card

### 1. THE CARD (the app)
- Rifle name at top with chevron → tap = rifle list (surface 7)
- **PROVEN TO ___ YD** — the score. Tap it → plain-words "why" panel
  (existing view-5 logic: the 4 rows, each tappable to fix its gap)
- **Coach line** — ONE sentence, always tappable, always routes to the
  right fact card with the rifle inherited. Zero states:
  - No zero → "Confirm your zero — shoot a group at 100"
  - No speed → "Clock your bullet speed — or type the box speed"
  - Zeroed+speed, never checked → "Check yourself at distance"
  - Checked, drift detected → "Your 600 dial moved — true it"
- **The drop chart** — always visible, this is what Roy came for. Compact
  on the Card; tap → full-screen chart (surface 5)
- **One gold button: ＋** → surface 2
- Below the fold: the record feed (surface 6 inline) — last few facts,
  "See all" link

### 2. "WHAT HAPPENED?" (the ＋ sheet)
Three big buttons, Roy's sentences, nothing else:
- **"I zeroed"** → fact card 3a
- **"I shot at distance"** → fact card 3b
- **"I clocked my speed"** → fact card 3c
No paper/steel/chrono jargon. No rifle picker — rifle is inherited (Law 3).

### 3a. FACT: "I zeroed" (one card)
Fields: distance (default 100), group size (in), shots (default 5),
optional photo/target-scan link. Save → zero confirmed → back to Card,
number reacts. Ammo resolved before the card opens (Law 3).

### 3b. FACT: "I shot at distance" (one card) — THE CROWN JEWEL
Fields: how far / what I dialed / where it hit (high-low in inches or
clicks). Save → **PAYOFF CARD**: "Your 600-yard dial changes from 4.0 to
3.8 — Keep it / Undo." (existing simple-true.js + keep() path unchanged).
- A quiet "add more shots" link on the same card appends rows for a full
  string — this IS detailed truing now; the 8-shot flow is just this card
  with more rows. No separate truing door. Doctrine (MV vs BC bracket)
  routes silently as today.
- Honesty guard unchanged: nonsense observations say "Couldn't use that
  one" and keep the draft.

### 3c. FACT: "I clocked my speed" (one card)
Two ways on one card: type the number (primary, top) OR "load a Garmin
file" (secondary link → existing garmin-import). Saves through sync-queue
(F6 fix stands). Typed speed prints "(typed)" on certificates, unchanged.

### 4. PAYOFF CARD
Already built (v3 view 4). Keep/Undo, plain English, shares keep() write
path. Unchanged except it returns to the Card.

### 5. FULL CHART
Tap the compact chart → full-screen drop chart + "For your rangefinder"
block (BC/speed). Print/share link here. Unchanged logic from v3 view 6.

### 6. THE RECORD (one list)
Every fact, newest first, each row tappable → edit/delete with confirm +
undo (v3 view-7 logic, including supersede/undo-correction rules). This is
the ONLY history in the product.

### 7. RIFLE LIST + DETAILS
Tap rifle name → full scrollable list, search box always visible (not
gated at 8), "＋ Add a rifle" last row. Tap a rifle's ⓘ (or "Rifle
details" row on the Card below the chart) → ONE plain drawer:
- Build sheet (twist etc.) / Ammo list (＋ New ammo) / Barrel & rounds /
  Certificate & report (one row) / Export everything / Scope tracking /
  Print a target / Settings & sign-out
Flat list, no sub-hierarchy. This drawer replaces Paperwork/view 8.

---

## Kill / demote list

**KILLED as user-facing concepts** (code seams stay, doors removed):
- Sessions, session pages, "start a session," all step-wizards
- Separate truing doors (simple AND detailed — both are now card 3b)
- Lanes remnants, modes, onboarding beyond ONE question (name the rifle;
  suppressor question stays deferred to first save as built)
- Admin UI on mobile — becomes a URL-only page (/admin), no header icon
- All histories except The Record
- Bottom-of-funnel nags, any second gold button anywhere

**DEMOTED into the Rifle details drawer** (kept, one tap, no prominence):
- Certificate/report, exports, device export, barrel/cleaning, scope
  tracking, target print/scan, suppressors & lots (fold into ammo detail)

**UNTOUCHED engines** (decorate, don't edit): calculations.js,
velocity-stats.js, garmin-import.js, ballistic-solver.js, truing-core.js,
calibration-status.js, simple-true.js, db.js, net.js, sync-queue.js,
target-geometry.js. No schema changes. No migrations this build.

---

## Build discipline

- **Fresh shell.** Do not remodel the v3 8-view shell again — build a new
  thin shell (the Card + 6 satellite surfaces) that calls the same engines
  and js/rifle-payoff.js / next-action.js where they fit. Old shell stays
  in the tree until QA passes, then retire in the final step.
- Per-step commits; bump CACHE_VERSION; branch `redesign`.
- v3 color law stands: one gold button per screen, text links secondary,
  green=confirmed, red=destructive, orange=targets only, no blue.
- Mockup-is-tiebreaker rule: this contract is the tiebreaker; where silent,
  match v3 tokens/fonts.

## QA gate (must all pass before the run reports done)

1. **Roy cold walk, empty-handed:** fresh account → 1-question onboard →
   add rifle → Card says confirm zero → "I zeroed" → typed box speed →
   "I shot at distance" 600 → payoff → Keep → number moves → chart. At
   EVERY card, attempt to proceed with missing ammo/fields — must offer
   inline creation, must never discard input. Target: under 3 minutes.
2. **The 8-shot string:** card 3b + "add more shots" ×8 at 925 → Apply →
   true numbers + rangefinder block. Kill the app mid-entry at shot 5 —
   relaunch must restore the draft.
3. **Offline everything:** airplane mode, full cold start → add rifle →
   all three fact cards → drafts + queued saves honest ("Saved — will
   sync") → reconnect flush.
4. **Navigation sweep test** (keep from v3): every surface has a way back
   to the Card. Plus the new permanent test from Law 4: no flow discards
   entered data on validation failure.
5. All existing 916 tests stay green; engines byte-identical (hash check).

## Owner calls encoded in this contract
- Certificates stay (Workhorse tie-in) but live in the drawer, not the Card.
- Scope tracking demoted to drawer; coach line may surface it once per
  rifle, never nags.
- Ask yorT, crowd-data, Tier-3 stay dormant. Target artwork unchanged.
