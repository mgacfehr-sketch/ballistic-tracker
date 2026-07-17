# yorT PRESENTATION REBUILD — DESIGN SPEC
### Written before any UI code. The old presentation layer is dead; nothing below references it.

---

# PART I — THE SHOOTER
*I'm 55. My thumb is my only pointer. I don't like apps; I like my rifle. Here is what the screen must show me in the FIRST SECOND, question by question.*

**"Am I ready?"** — I'm on the tailgate three weeks before opener. I open the app with a gloved thumb. Before I read a single word I need one truth: a light. Green means go hunt. Amber means do something first. I should not have to find it — it should be the biggest, brightest thing on the first screen, attached to the rifle I actually shoot. If it's amber, the very next line tells me what to do in my scope's clicks, with an arrow, not a signed decimal.

**"What do I dial?"** — Wind's up, buck at 425. I need a number the size of my palm. UP 4.2. Nothing else on that screen may compete with it. Conditions were fetched without asking me. If I'm offline in the canyon it still answers and quietly tells me how fresh its weather is.

**"Which ammo?"** — I'm in my kitchen with three boxes on the counter. I want the app to run the experiment for me: tell me what to load, what to shoot, in what order — one instruction at a time, a big Next button, and at the end a winner announced like a scoreboard, not a spreadsheet. If I get interrupted by the phone ringing, it remembers where I was.

**"Is my equipment telling the truth?"** — I never want to think about this. The app watches; it speaks only when something is wrong, in one sentence: "Your zero has walked 0.4 MOA right over five sessions — check your rings." If everything is fine, this question occupies ZERO pixels.

**"Am I getting better?"** — One number that trends. A personal best I can brag about. I will never open a chart screen; the chart has to come to me as a sentence with a small line under it.

**"Where's my stuff?"** — Every rifle is a page that knows itself: round count I never typed, the load it likes, when I last cleaned it. Finding a rifle takes one tap from anywhere. The rifle's name is set in big type like it's engraved.

**"Prove it."** — When my group is verified, give me one tap to make the thing I show my brother-in-law. Paper documents (DOPE card, certificate) must look like they came from a machine shop, not a website.

**The bench test for every screen:** in glare, at arm's length, wearing gloves — can I read the single most important truth in under one second, and is the thing I most likely came to do the biggest touchable object in thumb reach? If either answer is no, the screen is wrong.

---

# PART II — THE DESIGNER
*References: Garmin ShotView/Connect (data-instrument feel), Kestrel (meteorological seriousness), Apple Health (typographic hierarchy), a Nightforce turret (machined confidence). This app is an instrument, not a website.*

## II.1 Visual concept
The screen is a machined graphite panel. Information sits on it the way engraved markings sit on a turret: high-contrast numerals, quiet uppercase micro-labels, hairline rules. Color is meaning, never mood: the app is monochrome graphite until something has a STATE — ready, attention, alert, verified — and then exactly one color appears. The dominant object on any screen is a verdict or a number, never a menu. Depth comes from surface steps and hairlines, not drop shadows (instruments are flat; websites float).

## II.2 Palette (tokens)
Graphite scale (blue-leaning neutral, never brown/warm):

| Token | Hex | Use |
|---|---|---|
| `--g0` | `#0C0E10` | App background (near-black) |
| `--g1` | `#14171A` | Raised panel |
| `--g2` | `#1B1F23` | Second step: tiles, inputs at rest |
| `--g3` | `#242A2F` | Interactive rest / pressed panel |
| `--line` | `#2A3036` | Hairline rule (1px) |
| `--line-strong` | `#3A424A` | Emphasized rule, input focus edge base |
| `--ink` | `#EDF1F4` | Primary text/numerals |
| `--ink-2` | `#9BA6AE` | Secondary text |
| `--ink-3` | `#5F6B74` | Tertiary, disabled, micro-labels at rest |

State color — the ONLY color in the app:

| Token | Hex | Meaning (never decoration) |
|---|---|---|
| `--go` | `#46B268` | Verdict: ready / confirmed / pass |
| `--hold` | `#D9A13B` | Verdict: attention / correction needed. Also the single interactive accent (primary action, focus ring, active nav) — "brass": the one warm note on graphite, like a chambered case |
| `--stop` | `#D64545` | Verdict: alert / fail / destructive |
| `--poa` | `#4D9FD6` | Canvas only: point-of-aim marker (existing convention) |
| `--impact` | `#46B268` | Canvas only: impact markers (existing convention) |

Rules: brass appears on at most ONE object per screen at rest (the primary action) plus transient focus/active states. Verdict colors appear only inside verdict components (lamp, verdict text, status chip). Large fills of state color are forbidden except the verdict lamp; state is shown by coloring the *mark*, not the *panel*. No gradients. No pure white; no pure black.

Sunlight mode (`body.high-contrast`): same tokens re-mapped — `--g0:#F4F5F6, --g1:#FFFFFF, --g2:#E9EBED, --g3:#DDE1E4, --line:#C3C9CE, --ink:#0B0D0E, --ink-2:#3D464D, --ink-3:#6A737A`; state colors darken one step for contrast (`--go:#1E7A40`, `--hold:#8A6114`, `--stop:#B22B2B`). Everything must pass 4.5:1 in both themes.

## II.3 Elevation system
Flat instrument, three physical levels — expressed by surface step + hairline, not shadow:

- **E0 — panel ground** (`--g0`): the chassis. Content never sits directly on it except the shell chrome.
- **E1 — plate** (`--g1` + 1px `--line`, radius 14px): every card/panel. The workhorse.
- **E2 — tile/control** (`--g2` + 1px `--line`, radius 10px): tiles inside plates, inputs, secondary buttons.
- **E3 — overlay** (`--g3` + 1px `--line-strong`, radius 16px + `0 16px 48px rgba(0,0,0,.5)`): the ONLY shadow in the app — sheets, dialogs, menus, because they physically float.

Pressed state = surface darkens one step + hairline brightens. Never scale-transform on press (feels like a toy).

## II.4 Type scale (the hierarchy IS the design)
Stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Data/tables mono stack: `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Consolas, monospace`. **`font-variant-numeric: tabular-nums` on every element that can ever contain a number.** No font downloads (offline-first PWA).

| Token | Size/line | Weight | Use |
|---|---|---|---|
| `--t-verdict` | 64/1.0 | 750, -2% tracking | THE number or verdict word. One per screen max. Dominates from arm's length |
| `--t-display` | 40/1.05 | 700, -1.5% | Hero stats (group size, dial), wizard question numerals |
| `--t-title` | 24/1.15 | 675, -1% | Screen titles, rifle names (the "engraved" size) |
| `--t-head` | 17/1.3 | 625 | Card headings, list item primary |
| `--t-body` | 15/1.45 | 420 | Sentences, verdict sub-lines |
| `--t-label` | 12.5/1.2 | 550, +6% tracking, UPPERCASE | Instrument labels above numbers, card kickers |
| `--t-micro` | 11/1.2 | 500, +4% tracking | Units, timestamps, table headers |

Grammar: a number NEVER appears without its `--t-label` above or `--t-micro` unit beside it. Verdict sentence first (`--t-head`/`--t-body`), numbers under — everywhere, no exceptions.

## II.5 Iconography
One inline SVG family, `js/icons.js`, Lucide-style geometry: 24×24 viewBox, stroke `currentColor`, `stroke-width: 1.75`, round caps/joins, no fills (exception: the verdict lamp dot). Icons are labels, not decoration: an icon never appears without a text label except in the bottom nav (where the label sits under it) and the header utilities (aria-labeled). Sizes: 18 inline, 22 nav/actions, 28 hero. **Zero emoji anywhere in the product — including JS-generated strings, placeholders, and titles.**

## II.6 Spacing, radius, touch
4px base grid. Space steps: 4/8/12/16/20/28/40. Screen gutter 16px. Card padding 16px. Section gap 20px. Radius: 10 (tile) / 14 (plate) / 16 (overlay) / 999 (chip, lamp). Touch targets ≥48px (spec floor is 44; we build to 48). Primary action height 56px. Bottom nav 64px + safe-area. The bottom 25% of the screen belongs to actions (thumb law); destructive actions live at the top where the thumb has to *mean it*.

## II.7 Motion
Utilitarian: 140ms ease-out on state, 220ms ease-out on view/sheet entry (slide-up 8px + fade). Verdict lamp may pulse once (600ms) on first render — an instrument settling on a reading. Nothing loops. `prefers-reduced-motion` kills everything.

## II.8 Composition grammar (anti-uniform-list law)
Every screen is composed of exactly three zones, and NO screen may render as a uniform stack of identical rectangles:

1. **HERO ZONE** (top ~35%): one dominant truth — a verdict, a number, or the object being worked on. Asymmetric: big element left/center, quiet metadata right/under.
2. **PRIMARY ACTION**: exactly one visually loudest control (brass), full width, in thumb reach or directly under the hero. There is never a second brass object.
3. **SECONDARY ZONE**: everything else, at least one visual register quieter — smaller tiles, denser type, mixed shapes (a 2-across tile row here, a full-width sentence card there, a data strip elsewhere). If three sibling elements in this zone have identical geometry, vary the rhythm.

---

# PART III — SCREEN COMPOSITION SPECS

## III.1 HOME — the status instrument
Not a menu. A pilot's glance: situation, then the one lever.

```
┌──────────────────────────────────────┐
│ yorT                    ☼  ⛭  ⏻      │  slim chrome, 44px
│                                      │
│ ┌──────────────────────────────────┐ │  HERO: last-used rifle
│ │ RIFLE                            │ │  (t-label kicker)
│ │ Tikka .308 Workhorse             │ │  (t-title, engraved)
│ │                                  │ │
│ │   ●  READY                       │ │  ← lamp Ø18 + verdict word
│ │      Zero confirmed 6 days ago   │ │    (t-verdict scale word,
│ │      1,412 rds · H4350 42.1gr    │ │     go-green; sub in ink-2)
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │  PRIMARY ACTION (brass,
│ │  [camera]  CHECK A TARGET        │ │  56px, the one loud thing;
│ └──────────────────────────────────┘ │  chosen by usage data)
│                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐   │  SECONDARY: quiet tile row,
│  │[gauge] │ │[import]│ │[test]  │   │  E2, icon + short verb,
│  │ Dial   │ │ Chrono │ │ Run a  │   │  visibly subordinate
│  │        │ │        │ │ test   │   │
│  └────────┘ └────────┘ └────────┘   │
│ ─────────────────────────────────── │  hairline; below fold ↓
│  RECENT                              │  t-label
│  · 5-shot group, 0.82 MOA — Tue      │  whisper list, ink-2
│  + Add a tool                        │  ghost row, ink-3
├──────────────────────────────────────┤
│  [home]      [rifles]      [ask]     │  bottom nav 64px
└──────────────────────────────────────┘
```

- Hero card = most-recently-used rifle; verdict from Zero Guardian data (READY / CHECK ZERO / NO DATA — "no data" renders lamp hollow, teaches in one sentence). Tapping hero opens that rifle's hub.
- Primary action = highest usage-count action (existing adaptive data); remaining core actions render as the quiet tile row. Alerts (lot change, drift) appear as a single amber-marked sentence strip between hero and primary action — only when one exists.
- Failure test: if this screen could be mistaken for a settings menu, it failed.

## III.2 RIFLE HUB (rifle detail)
The rifle page IS the product: identity engraved, verdict dominant, seven questions as a prioritized, mixed-rhythm card stack.

```
┌──────────────────────────────────────┐
│ ‹ Rifles          Tikka .308         │  toolbar: back + engraved name
│   6.5 CM · 1:8 · Proof 24"           │  build line, ink-3 micro
│                                      │
│ ┌────────────┬─────────────────────┐ │  HERO: verdict panel,
│ │    ●       │ READY               │ │  lamp dominates left cell;
│ │   Ø28      │ zero confirmed      │ │  right: verdict word t-display
│ │            │ May 12 · 100 yd     │ │  + evidence line
│ ├────────────┴─────────────────────┤ │
│ │ ROUNDS   LAST MV    GROUP AVG    │ │  instrument strip: 3 stats,
│ │ 1,412    2,688 fps  0.91 MOA     │ │  t-display numerals,
│ │                                  │ │  t-label over each
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │  PRIMARY ACTION (brass):
│ │  [camera]  CHECK ZERO            │ │  contextual — amber verdict
│ └──────────────────────────────────┘ │  makes this "FIX ZERO"
│                                      │
│  WHAT DO I DIAL                      │  question sections, t-label
│ ┌──────────────────────────────────┐ │  kickers; cards render ONLY
│ │ 400 yd → UP 3.1 · L 0.4    [›]   │ │  with data (dormant law).
│ └──────────────────────────────────┘ │  Mixed rhythm: dial strip,
│  WHICH AMMO                          │  sentence card, 2-across
│ ┌──────────────────────────────────┐ │  tiles for logs — never
│ │ Federal 175 SMK — your load      │ │  identical rectangles.
│ │ 0.76 MOA · SD 9 over 4 sessions  │ │
│ └──────────────────────────────────┘ │
│  RECORDS                             │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Sessions  41 │ │ Cold bore  ● │  │
│  └──────────────┘ └──────────────┘  │
│  PROVE IT                            │
│  · Performance report   · Certificate│  quiet text row, bottom
└──────────────────────────────────────┘
```

Card priority order is fixed: Ready? → Dial → Ammo → Truth-alerts → Progress → Records → Prove. Truth-alert cards render only when a monitor has something to say (amber mark + one sentence).

## III.3 RIFLE LIST
Hero zone: none — the list itself is the content, but each row is an instrument row, not a menu row: lamp (Ø10) + rifle name (t-head) + build micro-line, round count right-aligned in tabular numerals. Primary action: brass "+ New rifle" pinned bottom. Empty state: one sentence + that button, centered in upper third.

## III.4 SESSION FLOW (target photo → verdict)
Canvas is the hero, always ≥60% of viewport. The step panel is a bottom sheet (E3) that never covers the canvas' center: step kicker (`STEP 3 OF 7 · SET SCALE`, t-label), one instruction sentence (t-head), controls in a single row, primary on the right thumb edge. Progress = 7 tick marks (machined, not a fluid bar). Results step: verdict sentence first ("0.82 MOA — your best with this load"), group size at t-verdict scale, stats table (mono, tabular) below fold, save = primary brass, share/export quiet.

## III.5 WIZARD SHELL (all Budget-C flows: onboarding, ammo trial, ladder, tall-target, DOPE cards)
One question per screen, conversation not form:

```
┌──────────────────────────────────────┐
│ ‹                        ▮▮▮▯▯       │  back + 5 machined ticks
│                                      │
│  QUESTION 3 OF 5                     │  t-label kicker
│  Which loads are you                 │  HERO: the question,
│  comparing today?                    │  t-display, top third
│                                      │
│  ┌──────────────────────────────┐    │  choice plates (E2, 56px),
│  │  Federal 175 SMK        [✓]  │    │  full width, generous gap —
│  ├──────────────────────────────┤    │  tappable with gloves
│  │  Hornady ELD-M 178           │    │
│  ├──────────────────────────────┤    │
│  │  Black Hills 175             │    │
│  └──────────────────────────────┘    │
│                                      │
│                                      │
│ ┌──────────────────────────────────┐ │  PRIMARY: brass Next,
│ │            NEXT →                │ │  fixed in thumb zone
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

Resumable (wizard-core state, untouched). Validation errors are one plain sentence above Next, `--stop` mark, never a shake.

## III.6 SOLVER (view chrome only — ballistic-solver.js markup is frozen)
The solver's emitted classes are styled via the compat layer to match: form controls as E2 tiles, the drop table in mono/tabular with the zero row marked by a brass hairline, come-up column emphasized. Its container gets the standard toolbar.

## III.7 CHRONO IMPORT
Hero: drop target plate — "Import chrono data" + one sentence ("ShotView file, straight from Garmin"). After parse: proposal cards, each a sentence ("These 12 shots look like one load — avg 2,681, SD 8") with confirm checkbox; primary brass "Assign to rifle" after confirmation. Numbers always mono/tabular.

## III.8 HISTORY / LOGS
Sessions as instrument rows grouped by month (t-label dividers): date, rifle, group size right-aligned (t-head, tabular), verified lamp dot when fiducial. Detail = verdict-first like results step.

## III.9 FIELD / HIT LOGGING
Three-tap law: distance chip row (last distance pre-selected), giant HIT/MISS split buttons (the screen's hero, 50/50), position chips. Running tally as instrument strip on top.

## III.10 ASK yorT
Chat, but instrument-flavored: user bubbles E2 right, yorT answers as flat text on ground with a hairline left rule (a readout, not a bubble). Context chips (rifle, session) above the composer. Composer pinned bottom, brass send.

## III.11 ADMIN / CROWD DATA
Dense by design (desktop bench seat): stat strip (t-display numerals), mono tables, filters as chip row. Same tokens, tighter spacing (8px grid). No brass except true actions (export, apply).

## III.12 AUTH
The machined front plate: logo + wordmark centered upper third, two E2 fields, brass LOG IN, ghost Sign up. Nothing else. Errors in one sentence, `--stop`.

## III.13 REPORTS / CERTIFICATE
On-screen previews use the same tokens; the printed artifacts remain their own print CSS (machine-shop documents: hairline tables, tabular numerals — already consistent with this system's philosophy).

---

# PART IV — COMPONENT CATALOG (the only vocabulary rewritten modules may emit)

Layout/shell: `.shell-header`, `.shell-brand`, `.shell-utils`, `.util-btn`, `.navbar`, `.nav-item` (+`.is-active`), `.view-toolbar`, `.toolbar-back`, `.toolbar-title`, `.toolbar-sub`, `.screen` (gutter wrapper), `.zone-hero`, `.zone-secondary`.
Surfaces: `.plate` (E1), `.tile` (E2), `.sheet` (E3), `.strip` (full-width hairline-bounded row), `.divider`.
Verdict/status: `.verdict`, `.verdict-lamp` (+`.is-go/.is-hold/.is-stop/.is-off`), `.verdict-word`, `.verdict-sub`, `.alert-strip` (+state), `.chip` (+`.is-state`), `.lamp-dot`.
Instrument data: `.instrument` (label+number unit), `.instrument-label`, `.instrument-value`, `.instrument-unit`, `.stat-strip` (n-across instruments), `.datatable` (mono), `.datatable-hero-row`, `.trendline` (inline svg spark).
Actions: `.action-primary` (brass, one per screen), `.action` (E2 quiet), `.action-ghost` (text), `.action-danger`, `.action-row`, `.tile-action` (icon+verb tile), `.fab-zone` (bottom pinned action area).
Forms: `.field`, `.field-label`, `.field-input`, `.field-row`, `.field-unit`, `.seg` (segmented control), `.chip-row`, `.choice-plate` (+`.is-selected`), `.stepper`.
Wizard: `.wiz`, `.wiz-ticks`, `.wiz-tick` (+`.is-done`), `.wiz-kicker`, `.wiz-question`, `.wiz-error`, `.wiz-next`.
Cards/content: `.qcard` (question-section card), `.qcard-kicker`, `.row-item` (instrument row), `.row-main`, `.row-aside`, `.empty-teach` (sentence + one button), `.icon` (+`.icon-18/.icon-22/.icon-28`).
Utilities: `.u-mono`, `.u-tabular`, `.u-quiet`, `.u-micro`, `.u-label`, `.u-hidden`, `.u-below-fold`.

Rules for module rewrites: only this vocabulary + these utilities; new needs are added HERE first. All icons via `Icon('name', size)` from js/icons.js. No inline `style=` except canvas-computed geometry. No emoji. Verdict sentence before numbers. One `.action-primary` per screen.

# PART V — CONTRACTS & CONSTRAINTS

- **Untouched engine files:** calculations.js, velocity-stats.js, garmin-import.js, ballistic-solver.js, wizard-core.js, db.js, net.js, schema, tests, SW offline strategy. 385 tests stay green.
- **Frozen-markup compat:** ballistic-solver.js emits legacy classes (`.btn`, `.form-group`, `.detail-card`, `.solver-table`, `.profile-toolbar`, `.empty-state`, `.session-details`, `.validation-hint`, `.chrono-hint`, `.btn-row`, `.toolbar-spacer`, `.th-unit`, `.solver-*`). css/ui.css ends with a clearly-marked COMPAT section styling exactly these, in the new visual language. No rewritten module may use compat classes.
- **Kept functional contract:** view container IDs (`view-auth`, `view-home`, `view-session`, `view-profiles`, `view-ai`, `view-solver`, `view-wind`, `view-chrono`, `view-admin`), `data-view` switching, `AppNav`, session step-panel element IDs bound by session-flow.js, `body.high-contrast`, canvas marker colors (blue POA / green impacts).
- **Laws that survive from the master plan:** no new nav tabs; three effort budgets; dormant-until-touched; empty states teach in one sentence + one button; silence is a feature.
- **Acceptance (self-graded in REDESIGN-REPORT.md):** structural screenshot-diff, Sig/Garmin stranger test, glove test, one-second glance test on Home + Rifle Hub, zero-emoji + one-icon-family test.
