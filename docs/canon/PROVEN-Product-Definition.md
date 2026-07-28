# PROVEN — Product Definition (UI-free)

This document defines WHAT the product is and must do. It deliberately
contains NO user-interface design — no screens, buttons, navigation, or
layout. Any UI proposal must be derived fresh from this document.

---

## 1. The product in one sentence

A shooter tells the app what happened at the range; the app turns those
facts into a trued ballistic solution and an honest statement of how far
that rifle's data can be trusted.

## 2. The problem it solves

A precision rifle's drop chart is only as good as its inputs (muzzle
velocity, ballistic coefficient, zero). Most shooters run on box-flap
numbers and never verify. The few who "true" their data do it with
expert-level protocol most people don't know. Proven encodes that expert
protocol so any shooter's data converges toward the truth with minimal
effort — the "Precision Planting for the rifle" idea: decompose the
expert, productize the steps, and every user performs at expert level.

## 3. The one central mechanic

**"PROVEN TO ___ YARDS"** — a single number per rifle, computed from the
verified state of its data. It is the score, the progress bar, and the
honesty statement all at once. It only rises when the underlying data
actually improves. It must never flatter.

The number is a rollup of four verifiable states:
1. **Zero confirmed** — a measured group at a known distance.
2. **Muzzle velocity measured** — chronograph data (or a typed value,
   honestly labeled as typed/unverified).
3. **Trued** — predictions corrected against observed impacts at distance.
4. **Scope tracking verified** — the scope dials what it claims
   (tall-target test). Optional/advanced; contributes confidence.

## 4. The core loop (the whole product)

1. User states a fact from the range. There are only three kinds:
   - **"I zeroed"** — group at a distance (size, distance, shot count).
   - **"I measured my bullet speed"** — chrono series (imported or typed).
   - **"I shot at distance and here's where it hit"** — one or more
     observed impacts (distance, dial used, miss distance high/low).
2. The engine updates the rifle's solution:
   - Impact observations inside the supersonic bracket true MUZZLE
     VELOCITY; observations in the transonic bracket (Mach 1.2–0.9) true
     DRAG (BC/DSF). This routing is doctrine and happens silently.
   - A single observation yields a rough correction (explicitly low
     confidence); accumulating observations raise confidence. One
     observed hit is worth vastly more than never truing (80/20 rule).
   - Nonsense observations (inside zero band, outside brackets,
     physically impossible) are rejected with an honest "couldn't use
     that" — never silently absorbed.
3. The user sees the payoff immediately in their own terms: "your
   600-yard dial changes from 4.0 to 3.8," and the PROVEN-TO number
   moves if warranted. Every accepted correction is reversible (undo).
4. Output: a drop chart (the artifact shooters actually use), plus the
   trued velocity/BC values formatted for entry into rangefinders and
   other solvers.

Everything else in the product exists to support this loop.

## 5. Supporting functions (required, but subordinate)

- **Rifle profiles**: many per account (collectors have 50+). Build data
  (barrel, twist, scope height), round counts / barrel life, cleaning log.
- **Ammo/loads**: per rifle. Factory ammo must be first-class: name,
  bullet, weight, advertised speed — creatable in seconds at the moment
  it's first needed, never a prerequisite chore.
- **The record**: every fact ever logged, per rifle; editable and
  deletable with undo. Corrections follow append-and-supersede (history
  is never silently rewritten).
- **Certificate of Performance**: printable/scannable proof of a rifle's
  verified state (ties to Workhorse Rifles' "proof instead of promises"
  business). States exactly what was measured vs typed. Never overstates.
- **Target system**: printable target with machine-readable corner
  markers (ArUco; geometry in a shared calibration constant) so a phone
  photo of a group can be measured automatically. Photo measurement is a
  convenience path, never the only path — manual entry always works.
- **Data export**: everything the user owns, exportable (spreadsheet).
- **Environment**: pressure/temperature affect the solution; sensible
  defaults, overridable.

## 6. Doctrine constraints (non-negotiable physics/protocol)

- Two-stage truing: velocity first (while comfortably supersonic), drag
  only in the transonic window. Never conflate the two.
- Prefer measured over typed, typed over absent; label provenance
  honestly everywhere (e.g., certificates print "(typed)").
- Zero is the foundation; nothing trues without a confirmed zero.
- Statistical honesty: velocity SD/ES from real series; confidence
  language scales with sample size; never present a guess as a measurement.
- Direction-of-fire (Coriolis) capture matters ≥800 yd.

## 7. Users

- **Primary ("Roy")**: 60-year-old expert shooter. Deep ballistics
  vocabulary, low tech patience, one-finger typist. Ballistics terms are
  his native language; software terms are not. He must succeed on first
  contact with zero instruction.
- **Secondary**: the data-driven enthusiast (wants full strings, SD/ES,
  detailed truing, exports).
- **Tertiary**: Workhorse Rifles itself (ships rifles pre-verified with
  a certificate; the app is how customers keep them true).

## 8. Hard constraints (environment & operations)

- Works fully OFFLINE at the range: every function usable with no
  signal; work queues and syncs honestly when connectivity returns.
- **Nothing a user enters is ever lost** — not by validation, crash,
  offline, or navigation. Ever.
- Required context is resolved BEFORE effort is spent, never after.
- Multi-device; data lives server-side (Supabase/Postgres), owned and
  exportable by the user; account deletion complete.
- PWA on phones (used with gloves, in glare, at a bench).
- Existing tested engines are the source of truth for all math
  (solver, truing, velocity stats, import, calibration rollup); any new
  design reuses them unchanged.

## 9. Success criteria

1. A brand-new user with a rifle and a box of factory ammo gets from
   nothing → confirmed zero → typed speed → first trued correction in
   under 3 minutes of app interaction, unaided.
2. An expert can run an 8-shot string at 900+ yards through truing and
   read trued velocity/BC formatted for a rangefinder.
3. The PROVEN-TO number never overstates; every claim traceable to a
   logged fact.
4. The app's creator can operate every core function without notes.

## 10. Explicitly out of scope (v1)

AI chat assistant, crowd/aggregate data, load development (ladder
tests/recipes), hardware integrations beyond chrono file import, social
features, admin tooling on mobile.
