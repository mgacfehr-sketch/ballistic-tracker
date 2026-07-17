# REDESIGN REPORT — ground-up UX/UI rebuild

Branch `redesign` from `develop` (`278d2e5`). The engine (calculations,
velocity-stats, garmin-import, ballistic-solver, wizard-core, db, net,
schema, tests, SW offline strategy) is untouched throughout; everything
visual and structural is rebuilt. Updated per step.

## Step 1 — Design system (CACHE v80)

**What changed:** `css/main.css` replaced wholesale (3,500 lines of
accreted styles → one token-driven system, ~1,100 lines). New spec at
`docs/DESIGN-SYSTEM.md`.

**The language — "Machined Instrument":**
- Graphite dark theme (`#0C0F13` base) as default; Sunlight mode is now a
  TRUE light theme (white/print-like) implemented as a token swap on the
  same `.high-contrast` body class the toggle already uses — the old
  version was a 200-line pile of per-screen overrides; now ~20 token
  values restyle every component at once.
- **The green accent is gone as an action color.** Color is semantic now:
  blue = tappable, green = confirmed, amber = attention, red = destructive.
  The old UI used green for actions AND confirmations, so "READY" and
  "Save" shouted at the same volume. (Canvas marker colors on target
  photos are unchanged — green impacts on paper is a visibility decision,
  kept because it's right.)
- Type: base 14px → 17px; verdicts 22px+; display numbers 42px; tabular
  numerals app-wide so tables never shimmy.
- Touch: everything interactive ≥48px (chips, rows, buttons, nav).
- Cards separate by hairlines, not shadows (shadows die in sunlight); the
  one shadow in the app belongs to overlay sheets.
- Wizard shell became a bottom sheet on phones (thumb reach) and a
  centered card on desktop.

**Judgment calls:**
- Kept every existing class NAME as the component API (`.btn`,
  `.detail-card`, `.zg-banner`, `.field-chip`…) so 40 JS files restyle
  without logic edits — the redesign changes what the classes MEAN, not
  what emits them.
- Legacy CSS variable names referenced by inline styles in JS
  (`--calibration-color`, `--text-muted`, `--border`, `--primary`) kept as
  aliases to new tokens; they'll be cleaned when those screens are touched.
- Dead styles from the old sheet (8 orphan classes) not carried over.
- `prefers-reduced-motion` disables all animation; one motion curve
  app-wide.

**Before/after:** old = 14px text, green-on-dark buttons everywhere,
mixed paddings/radii per era, high-contrast mode as patchwork overrides.
New = one palette, one scale, one grammar; sunlight mode is a real theme.
