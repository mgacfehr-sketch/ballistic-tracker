# yorT Interaction Master Plan
### 44 features → 7 outcomes → 1 app that feels effortless
*Designed from the seat of the average (or below-average) technology user. Every decision below answers three questions: what outcome does this person want, how much effort will they tolerate, and what does "easy" mean at that exact moment?*

---

## PART 1 — THE REFRAME THAT MAKES IT SIMPLE

Users don't want 44 features. Every one of the 44 exists to answer one of **seven human questions.** Organize the app around the questions, and 44 features collapse into 7 simple experiences:

| The question in the user's head | Features that answer it | What the user should see |
|---|---|---|
| **"Am I ready?"** | Zero Guardian, travel check, season nudge | A green check or a correction. Nothing else. |
| **"What do I dial?"** | Solver, truing, wind holds, DOPE cards, auto-conditions, offline | One number, huge, instantly. |
| **"Which ammo?"** | Ammo trial, ladder test, clustering, chrono import, lot manager | A declared winner with proof. |
| **"Is my equipment telling the truth?"** | Scope tracking test, zero drift, lot alerts, suppressor configs, fingerprint dedup | An alert only when something's wrong. |
| **"Am I getting better?"** | Handicap, called shot, wind grader, effective range, hit logging, group progress | One trending number and a personal best. |
| **"Where's my stuff / what happened?"** | Profiles, build sheets, round counts, logs, history, sync, cold bore | Everything remembered without being asked. |
| **"Prove it."** | Certificate, Verified badge, Performance Report, printed DOPE card, share cards | A beautiful document in one tap. |

**Law of the reframe:** no screen ever presents a "feature." Every screen answers one of these questions. The user never learns our vocabulary; we speak theirs.

---

## PART 2 — THE THREE EFFORT BUDGETS (non-negotiable)

The below-average-tech user has three modes, each with a hard effort ceiling. Every feature is assigned one budget and may not exceed it:

**BUDGET A — "Glance" (0 taps, 2 seconds).** Answers that must simply BE there: zero status, round count, handicap trend, alerts. If the user has to navigate to it, we failed. These live as cards on the rifle page and states on Home.

**BUDGET B — "Capture" (1 photo or ≤3 taps, under 30 seconds).** The at-the-range actions: photograph a target, import a chrono file, log a steel string, make a wind call, run a travel check. Rule: the camera or one file-pick does the work; typing is forbidden; sensors fill everything else. If any capture flow needs a fourth decision, it gets redesigned.

**BUDGET C — "Session" (guided, 2–10 minutes, at home or bench).** The deliberate rituals: set up a rifle, run an ammo trial, do a tall-target test, build a recipe, print DOPE cards, generate a certificate. These may be longer BUT must be wizard-guided: one question per screen, big Next button, impossible to get lost, resumable if interrupted. The user never faces a form — they face a conversation.

**The meta-rule:** a Budget-C setup buys the user Budget-A answers forever. That's the deal the app makes, and onboarding says it out loud: "Two minutes now, and this rifle answers instantly for life."

---

## PART 3 — EVERY FEATURE: OUTCOME → EFFORT → EASE

*(Grouped by the seven questions. Format: what they want / effort budget / what "easy" looks like at that moment.)*

### "AM I READY?"
- **Zero Guardian** — Outcome: walk away certain. Budget B: photo → giant green "✓ READY" or amber "8 clicks RIGHT." Ease = no numbers unless they scroll. The correction is stated in THEIR scope's clicks, arrows shown as arrows.
- **Travel check** — Outcome: confidence at camp. Budget B: "Travel Check" button → one shot → photo → "Zero survived the trip." Ease = works offline, 15 seconds, phone-flashlight-at-dusk legible.
- **Season nudge** — Outcome: not forgetting. Budget A: one September notification: "Deer opener in 3 weeks — one target confirms you're ready." Never nags twice.

### "WHAT DO I DIAL?"
- **Solver + truing + wind** — Outcome: a number they trust NOW. Budget A/B: open app → last rifle assumed → type or speak a distance → **the dial, huge** (e.g "UP 4.2 / L 0.6"), conditions auto-filled, trued corrections applied silently. Ease = zero setup questions at the moment of need; every refinement (truing, scope correction, cold bore) happens invisibly upstream. If they got a first-round hit, one thumbs-up teaches the model ("that worked").
- **DOPE card printing** — Outcome: laminated paper on the stock. Budget C (2 min): pick rifle+load → pick format (stock-pack / wrist-coach / full page — shown as pictures, not words) → increments preset by use (hunt 25yd / comp even-drop) → PDF sized to cut. Ease = the header auto-prints load + DA + date so future-them knows what card this is; a "travel pack" prints 3 cards for 3 elevations in one tap.
- **Offline** — Outcome: it works in the canyon. Budget A: invisible. The only visible artifact: a tiny "offline — solutions current as of 6:14 AM" chip so trust survives signal loss.

### "WHICH AMMO?"
- **Chrono import + clustering** — Outcome: the day's shooting organized without notes. Budget B: pick file → app proposes groupings → user confirms with checkboxes → done. Ease = proposals in plain words ("These 2 strings look like the same ammo — Federal?"), nothing merged without a tap.
- **Ammo Trial** — Outcome: "buy THIS one." Budget C at range: wizard — "Which 2–3 ammos?" → "Shoot 5–10 of each at the marked bulls" → photo(s) + chrono import → **winner card**: "Federal 175: 0.76 MOA, SD 22 — your rifle's load," one tap sets it as the rifle's default. Ease = the wizard tells them exactly what to shoot next; they never design the experiment.
- **Ladder test (reloaders)** — Outcome: find the node without Excel. Budget C: same wizard skeleton, charges instead of brands; one photo of the multi-bull target; app overlays POI-shift + velocity flat-spot and highlights the stable window. Ease = the chart marks the answer ("41.8–42.2 is your window"), not just data.
- **Lot manager** — Outcome: never surprised by a new lot. Budget A/B: lot captured from box photo (OCR) at load creation; from then on automatic — alert only when it matters: "This lot runs 45 fps faster than the one you zeroed with — confirm zero."

### "IS MY EQUIPMENT TELLING THE TRUTH?"
- **Scope tracking (tall-target)** — Outcome: know the turret is honest — once per scope, ever. Budget C (10 min at range, wizard): "Tape the tall target plumb at 100 → shoot bottom dot → dial UP 30 clicks → shoot again → photograph." App measures true travel, announces plainly: "Your clicks are 4% small. Fixed — every solution now corrected automatically." Ease = the user never sees the correction factor again; trust is the deliverable.
- **Zero drift** — Outcome: catch loose rings before the hunt. Budget A: silent trend watching; speaks only when sure: "Your zero has moved 0.4 MOA right over 5 sessions — check your rings." 
- **Suppressor configs** — Outcome: right dope with or without the can. Budget A after one-time setup: a two-state toggle on the rifle (🔇/🔊) that every session and solution respects; the app measures the shift itself from tagged sessions and reports it once: "Can ON shifts POI 0.6 left — accounted for."
- **Fingerprint dedup** — Outcome: numbers stay true. Budget A: fully invisible; surfaces only as the amber "these shots are already imported" guard.

### "AM I GETTING BETTER?"
- **Hit logging** — Outcome: practice that counts. Budget B, hard 3-tap law: distance (defaults to last) → hits/shots ("7 of 10") → position chip. Conditions auto. Ease = enterable with gloves between strings; a session totals itself.
- **Wind grader** — Outcome: learn the hardest skill. Budget B: before shot — one slider ("my call: 8 mph full left"); after — tap where it hit. Over time: "You under-call left winds by 0.2 mil." Ease = it's optional per shot; any logged call is a gift, not homework.
- **Effective range** — Outcome: an ethical answer. Budget A: computed card — "90% on vitals: prone 540 yd / seated 320." Updates itself from hit logs; the hunter checks it like a fuel gauge before season.
- **Called Shot** — Outcome: practice with stakes. Budget B/C: "Predict" button before a string → app states the expected group → shoot → photo → graded. Ease = one score ("You beat your rifle's prediction"), gamified, never shaming.
- **Handicap** — Outcome: one honest number for "how good am I." Budget A: a card. Verified sessions feed it automatically; personal-best framing; share button makes the badge. The user does nothing but shoot.

### "WHERE'S MY STUFF?"
- **Profiles/build sheets** — Budget C once (or Budget A via certificate QR / box OCR: the rifle builds itself). Ease = every field optional; the app works with just a name and caliber and gets smarter as data arrives.
- **Round count/barrel life** — Budget A: maintains itself from sessions + chrono; the card quietly notes "2,140 rounds — 6.5 CM barrels typically go 2,500–3,000."
- **Cold bore** — Budget A: automatic if they mark shot #1 (the only ask, taught once by the empty-state card); output is a hold, not a chart: "First cold shot: hold 0.2 low-left."
- **Logs/history/sync** — Budget A: byproducts. Search speaks plain English ("last fall's 143 sessions").
- **Recipes/lots (reloaders)** — Budget C at the bench (where typing is acceptable and expected): structured recipe form with component pickers that remember their inventory; brass firing counts auto-increment when sessions reference the recipe. The load-development logbook view then assembles itself — the binder they always meant to keep, kept for them.

### "PROVE IT."
- **Certificate / Performance Report** — Budget C, Workhorse-side wizard (built). Buyer-side: Budget A — scan QR, rifle arrives knowing itself. 
- **Verified/share cards** — Budget B: every verified result offers one share tap; the badge does the talking.
- **Crowd insight (later)** — Budget A: a card — "Rifles like yours shoot best with…" — reading is the only interaction.

---

## PART 4 — THE ONE PACKAGE: HOW IT ASSEMBLES

**The three surfaces** (from the UX Architecture, now with the outcome layer):
1. **HOME asks "what are you doing?"** — 3–5 action buttons in the user's own words, adaptively ordered, plus any Budget-A alert that needs eyes ("New ammo lot detected"). A one-feature user sees a one-feature app.
2. **THE RIFLE PAGE answers the seven questions** — as cards, in a fixed priority order (Ready? → Dial → Ammo → Truth alerts → Progress → Records → Prove), each card rendering only when it has data. This ordering IS the outcome hierarchy: confidence first, documents last.
3. **THE TOOL DRAWER wakes dormant abilities** — phrased as the seven questions' sub-wants ("Know my ethical range," "Verify my scope dials true"), one tap to activate, which adds its action to Home and its card to rifles.

**The interaction grammar (applies to all 44, no exceptions):**
1. **Verdict first, numbers under.** Every result leads with a plain-English sentence sized for a glance; stats live below the fold for those who want them.
2. **The camera and the sensors do the typing.** Photo, file, GPS, weather, OCR, QR. A keyboard appearing at the range is a design failure (the bench is the one exception).
3. **Three-tap law for anything done outdoors.** Wizard law for anything done at home. Nothing in between.
4. **Ask once, remember forever.** Click value, units, positions, formats — every preference is asked at most once, at the moment it's first relevant, never in a settings screen up front.
5. **Silence is a feature.** Truth-monitors (drift, lots, dedup, tracking correction) say nothing while things are fine. An app that only speaks when it matters is an app people believe.
6. **Empty states teach in one sentence + one button.** No blank tables, ever.
7. **Every capture lands on the rifle, every insight derives from it.** One spine; the user never files anything.

**Why both extremes are served by the same design:** the single-feature hunter experiences: one button on Home, one photo, one green check — an app that appears to have been built solely for him. The everything-user experiences the same grammar 44 times, so the full instrument feels like ONE tool with depth rather than a menu maze. The dormant-card system means these are literally the same app — no modes, no editions.

---

## PART 5 — WHAT THIS CHANGES IN THE BUILD PLAN

1. **Build the outcome layer before the feature waves:** Home (action-first, adaptive), the rifle-page card system with the fixed question-order, and the tool drawer/activation registry. Everything else ships as a card + an action into that frame.
2. **Every feature PR must declare:** its question (of the seven), its budget (A/B/C), its verdict sentence, its empty-state sentence, and its tap count. Over budget = redesign, not exception.
3. **Wizardize every Budget-C flow** with the same wizard component (one question per screen, resumable) — build that component once, early.
4. **The two review gates before merge to main:** (a) the tap-count audit against budgets, (b) the "hand it to a stranger" test — one hunter-minded person completes "check my zero" with zero instruction.

**The test of the whole plan** stays the one you set: three different shooters, three different needs, one app — and each of them says "this is the easiest thing I own, and it's exactly right."
