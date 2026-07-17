# yorT Design System — "Machined Instrument"

The visual language for the ground-up redesign. Every screen is built ONLY
from the tokens and component classes in this document (implemented in
`css/main.css`). No ad-hoc colors, sizes, or spacing anywhere else.

## Who this is tuned for

Shooters at a range or in hunting country: bright sun, gloves, hurry,
often over 50, often not technical. Every choice below follows from that:

- **Large type by default.** Base 17px; verdicts and dial numbers are huge.
- **≥48px touch targets.** Buttons, chips, list rows, nav — all of them.
- **Contrast that survives sun.** Dark theme is high-contrast; Sunlight
  mode is a true light theme (near-print), not a tweak.
- **One primary action per screen.** Exactly one filled button visible at
  a time; everything else is quiet.
- **Zero decoration.** Color only ever means something: status, action,
  or information hierarchy. If a pixel doesn't inform, it doesn't exist.

The aesthetic model is premium optics: matte graphite metal, engraved
markings, one illuminated element. Purposeful, machined, confident, quiet.

## 1. Color tokens

Color is SEMANTIC. Components never reference raw hex — only tokens.

| Token | Dark (default) | Sunlight (`.high-contrast`) | Role |
|---|---|---|---|
| `--bg` | `#0C0F13` | `#FFFFFF` | App background |
| `--surface` | `#14181E` | `#F4F6F8` | Cards, panels |
| `--surface-2` | `#1C222B` | `#E9EDF1` | Inputs, wells, chips |
| `--surface-3` | `#242C37` | `#DDE3E9` | Pressed/hover, selected chip bg |
| `--line` | `#2A323D` | `#B9C3CC` | Hairline borders |
| `--line-strong` | `#3D4855` | `#7E8B98` | Emphasized borders |
| `--ink` | `#EDF1F5` | `#0B0E11` | Primary text |
| `--ink-2` | `#A2AEBB` | `#39434D` | Secondary text |
| `--ink-3` | `#6C7885` | `#5A6570` | Hints, timestamps |
| `--accent` | `#58A8E8` | `#0A62B0` | THE interactive color (one per app) |
| `--on-accent` | `#06121C` | `#FFFFFF` | Text on accent fills |
| `--ok` | `#46C06B` | `#0E7A34` | Confirmed / ready |
| `--on-ok` | `#04130A` | `#FFFFFF` | Text on ok fills |
| `--warn` | `#E8A33B` | `#7A5000` | Needs attention (never an error) |
| `--on-warn` | `#171004` | `#FFFFFF` | Text on warn fills |
| `--danger` | `#E2594A` | `#B3261E` | Destructive / failure |
| `--on-danger` | `#1A0704` | `#FFFFFF` | Text on danger fills |

Rules:
- **Blue = you can tap it. Green = confirmed. Amber = look at this.
  Red = destructive or broken.** No other meanings, ever.
- Status colors appear as *fills* only in verdict banners; elsewhere they
  tint text/borders (`--warn` text on `--surface`).
- Sunlight mode is applied by adding `.high-contrast` to `<body>` (the
  existing toggle). It swaps tokens — components restyle themselves.

## 2. Typography

System stack (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial`).
Numbers everywhere use `font-variant-numeric: tabular-nums` so tables and
dials never shimmy.

| Token | Size / weight | Use |
|---|---|---|
| `--fs-xs` | 13px | Timestamps, table captions |
| `--fs-sm` | 15px | Secondary rows, hints |
| `--fs-base` | 17px | Body default |
| `--fs-lg` | 19px | List row titles, card titles |
| `--fs-xl` | 22px | Screen titles, verdict text |
| `--fs-2xl` | 28px | Section verdicts, stat values |
| `--fs-display` | 42px | The dial number, the group size |

Weights: 400 body · 600 titles/labels · 700 verdicts and display numbers.
Line-height 1.45 body, 1.15 display.

## 3. Space, radius, elevation

- Spacing scale (`--sp-1…8`): 4, 8, 12, 16, 20, 24, 32, 40.
- Radius: `--r-sm` 8 (chips, buttons), `--r-md` 12 (cards), `--r-lg` 18
  (sheets/overlays), `--r-pill` for pills/dots.
- Elevation: flat by default. One soft shadow (`--shadow-sheet`) reserved
  for overlays/sheets. Cards separate by `--line` hairlines, not shadows —
  shadows die in sunlight.
- `--touch: 48px` minimum interactive height.

## 4. Component classes (the only building blocks)

### Buttons — strict hierarchy
- `.btn.btn-primary` — accent fill. **Max one visible per screen.**
- `.btn.btn-secondary` — outlined, surface bg. Everything else.
- `.btn.btn-danger` — red OUTLINE (never filled until pressed); destroys.
- `.btn.btn-sm` — compact (40px) for in-card actions only.
- `.btn-icon`, `.utility-btn` — 48px square icon buttons.
- `.btn-back` — chevron + label, top-left of any pushed screen.

### Verdict banner (`.zg-banner`) — the status light
The signature component. Full-width fill in a status color, `--fs-xl`
bold sentence, readable from a meter away:
- `.zg-confirmed` — green fill: "✓ ZERO CONFIRMED".
- `.zg-adjust` — amber fill: "8 clicks RIGHT".
Sub-line (`.zg-sub`) carries the date/context in `--on-*` at 70% opacity.
Every feature verdict reuses this pattern: sentence first, numbers below.

### Cards
- `.detail-card` — content card: surface, hairline, `--r-md`, `--sp-4` pad.
- `.detail-section` — titled card group (`.detail-section-title` is a
  quiet 13px uppercase label — engraved, not shouted).
- `.profile-card` — tappable list row: 56px min, title + sub + chevron.
- Slot rhythm on the rifle hub: cards stack with `--sp-3` gaps; each slot
  (question) separated by `--sp-5`.

### Chips (`.field-chips`, `.field-chip`, `.field-chip-on`)
Glove-first input. 48px tall, `--r-sm`, `--surface-2`; selected state is
accent-bordered `--surface-3` with bold text — obvious in sun, not subtle.
`.field-label` — 13px uppercase micro-label above each chip row.

### Forms (bench-only; never outdoors)
`.form-group`, `.form-row`, `.form-group-half` — 17px inputs, 52px tall,
`--surface-2` with hairline; focus = 2px accent ring. Labels above, 15px/600.

### Wizard shell (`.wizard-overlay`, `.wizard-card`)
One question per screen: bottom sheet on phones (rounded top, full-width
buttons), centered card on desktop. `.wizard-prompt` at `--fs-xl`.
`.wizard-choice` — full-width tappable answer rows (56px+), label + desc.
Progress is a 3px accent bar (`.wizard-progress`), not dots.

### Lists & log rows
`.log-entry`, `.session-card` — flat rows separated by hairlines inside a
card; date right-aligned `--ink-3`; whole row is the touch target.

### Tables (`.solver-table`, `.chrono-table`, `.admin-table`)
13–15px, tabular numerals, right-aligned numbers, hairline row rules,
sticky header on scroll wraps (`.solver-table-wrap`). The zero row
(`.solver-row-zero`) tints accent.

### Stats (`.dashboard-stat`)
Value-first: `--fs-2xl` bold number over a 13px uppercase label.

### Empty states (`.empty-state-sub`)
One sentence (17px, `--ink-2`) + one secondary button. Never a blank table.

### Nav (the shell)
Bottom bar, 3 destinations (Home · Rifles · Ask), 56px targets, active =
accent text + 3px top indicator. Flow views (session, solver, chrono,
admin, wizards) are full-screen pushes with `.btn-back` — they add no tabs.

## 5. Motion

One timing: `--t-fast: 120ms` (state changes) and `--t-view: 200ms`
(view transitions), `ease-out`. Views fade+rise 8px. Nothing bounces,
nothing slides sideways, nothing animates that the user didn't cause.
`prefers-reduced-motion` disables all of it.

## 6. Voice

- Verdict first, plain English, in the shooter's words. Numbers below.
- Empty states teach: one sentence + one button.
- Buttons are verbs ("Check a target", never "Submit").
- Units always stated ("0.2 mil", "4.25 MOA", "yd").
- The app never says "feature", "module", or "error occurred" — it says
  what happened and what to do.
