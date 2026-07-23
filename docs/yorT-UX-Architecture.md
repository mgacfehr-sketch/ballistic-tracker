# yorT UX Architecture — "Does Everything, Feels Simple"
### How 16 features stay out of each other's way

---

## THE CORE PROBLEM, STATED HONESTLY

Most users will use 1–2 features and ignore the rest. The failure mode is an app that shows all 16 to everyone: the zero-checker drowns in reloading menus, the reloader trips over wind graders. The fix is not cramming less in — it's an architecture where **unused features are invisible until wanted.**

Three design laws govern everything below:

**LAW 1 — Actions, not features.** Users don't think "I want the multi-group ladder module." They think "I'm at the range with a target." The app is organized around what the user is DOING, never around our feature list.

**LAW 2 — Dormant until touched.** Every feature ships asleep. It occupies zero screen space until the user activates it or its data exists. An app with 16 capabilities and 2 activated should LOOK like an app with 2 capabilities.

**LAW 3 — One grammar everywhere.** Every feature follows the identical pattern: **Capture → Record → Insight.** Photograph/import/log (capture), it lands on the rifle's record (record), and a plain-English card tells you what it means (insight). Learn one feature, you've learned them all.

---

## THE STRUCTURE: 3 SURFACES, NOT 16 SCREENS

### Surface 1 — HOME: "What do you want to do?"
Not a dashboard. Not a feature grid. A short stack of ACTION buttons, phrased as intentions:

> 📷 **Check a target** (photo → verdict/groups — the front door)
> 📥 **Import chrono data**
> 🎯 **Get a firing solution**
> 🪵 **Log field shots** *(only if Field activated)*
> 🧪 **Run a test** *(ladder / tall-target / ammo trial — only if any activated)*

Below: a "Recent" strip (last rifle, last session) for one-tap resume.

**Adaptive ordering:** the actions the user actually uses float to the top. The zero-check hunter sees "Check a target" first forever; the reloader sees "Run a test." Same app, different face — automatically, no settings.

### Surface 2 — THE RIFLE PAGE: the hub of everything
Every capture lands here. The rifle page is a stack of CARDS, and **cards only render when they have data:**

- Zero status card (always — the universal need)
- Round count / barrel card (always)
- Loads card (always, minimal)
- Cold bore card — appears after first cold-bore data
- Effective range card — appears after hit logs exist
- Scope card w/ tracking correction — appears after a tall-target test
- Suppressor config toggle — appears only if user adds a 2nd configuration
- Performance Report / Certificate — appears when strings+groups exist

A brand-new user's rifle page has 3 cards. A power user's has 10. Both feel complete; neither sees clutter. **The rifle page IS the product** — everything else is a way to feed it.

### Surface 3 — THE TOOL DRAWER: "+ Add a tool"
One place listing dormant capabilities, phrased as user problems, not features:

> "Test which ammo my rifle likes" → Ammo Trial / Ladder
> "Verify my scope dials true" → Tall-target test
> "Track my handloads" → Recipes & lots (activates Bench)
> "Know my ethical range" → Field logging + Effective Range
> "Grade my wind calls" → Wind trainer

Activating a tool = its action appears on Home and its card can appear on rifles. Deactivating hides it again, data preserved. **This is how one app serves the guy who wants one thing and the guy who wants everything.**

---

## STANDALONE WALKTHROUGHS (each persona sees a DIFFERENT simple app)

**The zero-check hunter (uses 1 feature):** Opens app → "Check a target" → photo → "✓ ZERO CONFIRMED — you're ready." Home shows one big relevant button, his rifle page shows 3 cards. He never sees reloading, wind, or ladder anything. To him yorT is a beautifully simple zero app.

**The chrono guy:** Home leads with "Import chrono data" (adaptive). Import → auto-split loads → confirm → rifle page velocity card. Two-minute loop, nothing else in his way.

**The reloader:** Activated Bench once. His Home leads with "Run a test"; his load pages show recipes, lots, and the development timeline. The ladder test is his session flow with a toggle. He may never photograph a hunting zero target in his life — and never sees that flow.

**The everything user (you):** All cards alive, all actions present — but because each follows the same Capture→Record→Insight grammar and lands on the same rifle hub, the 16-feature version reads as ONE coherent instrument, not 16 apps stapled together.

---

## THE RULES THAT KEEP IT FEELING PREMIUM

1. **One primary action per screen.** Every screen has exactly one big obvious next step. Secondary things are visually secondary.
2. **Empty states teach.** A card with no data never shows a blank table — it shows one sentence + one button: "No cold-bore data yet. Mark shot #1 in your next session and yorT tracks it automatically."
3. **Insights in plain English, numbers underneath.** Lead with "Your rifle likes the Hornady lot — 40 fps tighter" — the stats table is below for those who want it. (Zero Guardian's banner pattern, applied everywhere.)
4. **Never ask what a sensor knows.** Weather, location, date, rifle context — silently filled. Data entry is the enemy; 3 taps max for any field log.
5. **No feature may add a nav tab.** Nav stays: Home · Rifles · Ask yorT · (Field, only when activated) · Admin. New capability = new card/action, never new tab.
6. **Onboarding = one question.** "What do you mainly do? Hunt / Compete / Handload / All of it" → pre-activates the right tools. 10 seconds, and the app is already shaped like its owner.
7. **Certificate QR = the perfect first-run.** A Workhorse buyer scans; the rifle page arrives pre-built with cards already alive. The app demonstrates itself.

---

## WHAT THIS MEANS FOR THE BUILD

- Build the **card system + tool-activation registry first** (it's an extension of hasFeature() into user-level toggles). Every Wave 1–3 feature then ships as a dormant card+action, not a screen.
- The existing nav needs ONE restructure: introduce the action-first Home. That's the single biggest UX change and should be its own carefully-tested step before feature waves land on it.
- Every new feature PR must answer: which action does it add, which card does it render, and what's its empty-state sentence. If it can't, it isn't designed yet.

**The test for "wow":** hand the app to a hunter, a reloader, and a PRS shooter. If each one says "it's exactly what I needed and nothing more" — while all three are holding the same app — the architecture worked.
