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

## Step 2 — The shell (CACHE v81)

**Navigation model rethought:** the top button row is gone. New chrome:
- **Bottom nav bar** — three destinations (Home · Rifles · Ask yorT),
  56px targets in thumb reach for one-handed field use. Text labels, no
  icon guessing games for over-50 eyes; active = accent + top indicator.
- **Slim header** — yorT wordmark left; connection dot, sunlight toggle,
  and Log out right. That's the whole top of the screen.
- **Admin and beta Wind Call are header icon buttons now, not tabs** —
  "no feature ever adds a nav tab" is now structurally true. They keep
  the `.nav-tab` class so the shared view-switch binding drives them
  unchanged.
- Flow views (session, solver, chrono, admin, wizards) remain full-screen
  pushes launched from Home actions and cards — no tab, back to leave.

**Auth screen:** re-skinned by the system (big wordmark, 52px inputs, one
primary action). Structure kept — it was already one email + one password
+ two buttons, which is correct.

**Home:** re-dressed by the token system: first action carries the accent
edge (THE thing to do), 68px action rows, quiet uppercase "Recent" label,
tool drawer as a flat details-row list.

**Judgment calls:**
- Home's DOM structure (alerts → actions → recent → drawer) was kept —
  it already implements the Master Plan surface exactly; rebuilding it
  differently would change truth, not presentation.
- Log out stays a text button (not an icon) — accidental-logout risk and
  icon ambiguity beat the space savings.
- View switching stays class-toggle based (`.app-view.active`) — the
  entire manager layer targets it; the new motion lives in CSS.
