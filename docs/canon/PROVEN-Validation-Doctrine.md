# PROVEN — The Validation Doctrine
**Status:** Constitutional amendment. Derived from the owner's recorded
validation workflow and the "Rebuild Must Improve the Method" directive.
Sits alongside the Constitution and Product Definition. Where it adds to
them, it governs; where they conflict, the Constitution's honesty and
never-lose rules win.

---

## 1. What the transcript reveals: the product's true unit

The shooter does not go to the range to "log data." Every trip is a
**validation mission** with a purpose fixed before leaving the house.
The product's real unit is therefore not the session, not even the fact —
it is the **validation cycle**, a state machine every rifle is always in:

> CLEANED → SETTLING → ZEROING → SPEED KNOWN → TRUING → **VALIDATED**
> → (time/rounds pass) → SPOT-CHECK DUE → re-confirmed VALIDATED
> → (cleaning / scope / barrel / suppressor / anomaly) → INVALIDATED → repeat

PROVEN TO is the public face of this machine. The coach line is its voice.
Every capture either advances the state, confirms it, or invalidates it.
The app must always know — and be able to say — which state a rifle is in
and what mission would advance it.

## 2. Pre-trip intelligence (currently done in the owner's head)

Before a trip the expert asks: *when was this rifle last cleaned, how many
rounds remain in the cleaning interval, and is that enough to complete
today's mission AND leave margin for the hunt?* A validation costs a
knowable budget (≈15–20 rounds for zero work; more with truing). The
product must answer, per rifle:

- rounds since cleaning vs. the owner's interval (his: 75–100);
- the estimated round cost of the pending mission;
- the verdict in plain words: **"Clean it first — you'd finish validation
  with only 10 rounds left before cleaning, and you don't want to hunt on
  a dirty-margin barrel."**

This is the first feature that makes the app smarter than a notebook, and
it costs no new capture — round counts and cleaning events already exist.

## 3. Cleaning semantics (new to the Constitution)

Cleaning is not merely an event; it opens a **settling window**:

- After cleaning, the first ~10–15 shots are fouling/settling shots.
  Groups fired inside the window are preserved but flagged; the app
  SHOULD NOT treat them as zero-quality evidence, and SHOULD say so.
- Settling length is rifle-specific and learnable from history.
- Barrel break-in drift is real and learnable: MV commonly rises
  25–100 fps over the first ~100 rounds, then plateaus. The product
  should track each barrel's MV-vs-round-count curve and surface drift
  ("this barrel has sped up 40 fps since the certificate — your chart
  reflects the current speed").
- Cleaning triggers re-validation. The state machine handles this; the
  user is never lectured, the coach line simply routes.

## 4. The zero protocol as actually practiced

The expert's zero work has structure the app must recognize, not impose:

1. **Rough dial-in shots** (first ~2–4): large scope adjustments between
   shots. These are *sighting shots* — excluded from group statistics,
   kept for MV and round count.
2. **Adjustment groups**: 3-shot (sometimes 5-shot) groups, one aim point
   each, a small correction between groups.
3. **Convergence**: a final group centered within tolerance = zero
   confirmed. Typical total: 16–20 rounds, several aim points on one
   target sheet.

Implications: multiple groups per target sheet with shot-order labels are
the *norm* (the printed target and photo measurement should support
several bulls and sequence). The app should distinguish sighting shots
from group shots automatically where it can (adjustment-between-groups
pattern, shot timing) and by one-tap confirmation where it can't. Chrono
runs concurrently through all of it — every shot has an MV even during
sighting.

## 5. The long-range doctrine as actually practiced

- **The safety ladder:** true at a mid distance (≈600) before attempting
  the far target (≈900+) so a bad prediction can't miss steel entirely.
  The coach line should propose the ladder, not just "go true."
- **The stop-after-two rule:** two consistent misses ≈1 MOA off → stop,
  re-dial by the observed error, continue. The *dial that finally worked*
  is the datum of record — the Constitution's "preserve actual dial, not
  predicted dial" made concrete.
- **Success criterion:** ~3 consecutive impacts within tolerance,
  centered. That, not shot count, ends the string.
- **MV is measured at the truing distance too** (the chrono is running);
  therefore the engine trues DRAG with measured-velocity inputs — the
  two-stage doctrine exactly as built, now confirmed as the expert's own
  manual method. Proven's job is to delete the Revic-app-plus-paper-notes
  step, not to change the math.

## 6. The spot-check is a first-class fact (new)

Weeks later, before a hunt: one or two shots at known distances, and one
of three outcomes. The "I shot at distance" card must support all three
without the user classifying anything:

1. **Confirmed** — within tolerance: validation is refreshed (dated), the
   number holds, the payoff says "Still true at 700 — good to go."
2. **Drift** — small systematic error: normal truing path, payoff shows
   the dial change.
3. **Alarm** — gross error (≥1 MOA class): do NOT true. Invalidate,
   route to the troubleshooting ladder (§7). Tuning math around a
   hardware problem is already forbidden (Anti-pattern 100); this is its
   trigger condition.

Pre-hunt travel check is a special spot-check: 100 yards only, one shot,
on/off verdict. The app should *discourage* field re-truing (the expert
never does it — no time, no controlled conditions) and say plainly:
"Confirm zero; trust your trued data."

## 7. The troubleshooting ladder (new)

When a rifle won't group or a spot-check alarms, the expert's order is:
re-check zero → scope/mount screws → muzzle velocity change → back to
builder. The product should walk this ladder in coach language,
recording each check as a fact, and must never propose a ballistic
correction while the ladder is unresolved. (A rifle that "needed a new
barrel" is a warranty story the record should be able to tell.)

## 8. Shot-level evidence (adopting the rebuild directive)

Averaging is the current method's ceiling. The rebuild must go per-shot:

- Every long-range shot is associated, where evidence allows, with its
  own measured MV, order, dial, aim point, impact, conditions, and
  rounds-since-cleaning.
- **Velocity-compensated residuals:** before any drag correction, each
  shot's predicted drop is computed with ITS measured velocity. A slow
  shot that lands low *as predicted* is explained — it must not push a
  BC correction. Only stable residual error across velocity-compensated
  shots supports truing drag.
- This lets the product decompose vertical dispersion into: velocity
  spread (explained), zero error, drag error, tracking error, and
  ordinary rifle/shooter dispersion — and to say honestly when the
  evidence cannot distinguish them.
- **Called shots:** a shooter-called flyer is excluded from analysis by
  an append-only exclusion event, never deleted (C13, Test K).
- **Association method, in order:** timestamps + shot order first (this
  alone solves most strings — both Garmin and impacts are sequential);
  target-photo sequencing second; quick one-tap confirmation third;
  computer vision last and optional. Propose, never invent (directive's
  rule, and AP96).
- Engines remain the mathematical authority. The per-shot layer is
  evidence *preparation* feeding truing-core — but it includes real new
  computation (per-shot solver runs, residual aggregation, weighting)
  and MUST be built as a tested engine of its own: synthetic-data test
  suite, round-trip verification, strongest-model build run, same
  protected status afterward.

## 9. Outputs are part of validation (confirmed by transcript)

The trued solution's destination is never the app — it is the Revic
rangefinder, the ballistic app, or a custom turret tape. Required
outputs, all one tap from a validated rifle:

- the rangefinder block (trued MV, trued BC/model) — already built;
- **turret-tape values**: the trued solution translated to a declared
  destination environment (elevation, temperature) for tape ordering;
- a printable/exportable dope card for the same;
- environment translation stated honestly ("computed for 8,000 ft /
  30 °F — verify on arrival with a zero check").

## 10. Configuration memory pays for itself (transcript proof)

The 300 Norma story — suppressor removed, everything redone, both
histories lost to memory — is the epoch model's justification from the
owner's own life. Requirement: suppressor on/off are two configuration
epochs, BOTH retained; re-attaching the suppressor restores its epoch's
validated solution and PROVEN TO instead of starting over. Same for
scope swaps (zero re-validation required; tracking difference is the
one variable — which is why tall-target evidence attaches to the scope,
not the rifle) and barrels (everything re-validates; MV belongs to the
barrel).

## 11. The Workhorse factory protocol (transcript addition)

Factory validation = the same state machine plus an **ammo selection
trial**: settle the barrel (~15 rounds), then 2–3 candidate ammos in
alternating 3-shot groups, pick the performer, then zero + true with the
winner. Constitutional additions:

- The factory record includes the REJECTED candidates' groups — "you
  wondered about that ammo; Workhorse tried it; here's the group" is the
  record teaching (§50) and a sales asset.
- **Matched-lot sale:** the certificate names the exact winning lot, and
  the customer can buy N hundred rounds of that same lot with the rifle.
  The product should carry "certificate lot" as the rifle's current lot
  until the customer changes it — zero data entry for the best case.
- The break-in MV curve ships with the rifle: the customer watches the
  plateau arrive rather than being surprised by a 50 fps drift.

## 12. What this doctrine changes about build priority

1. The validation state machine + pre-trip round budgeting are cheap
   (existing data) and are the coach line's real brain — Phase 2 work.
2. Spot-check three-outcome handling is a small addition to the existing
   "I shot at distance" card — Phase 2.
3. Cleaning/settling semantics ride on existing barrel events — Phase 2–3.
4. Per-shot evidence association + velocity-compensated residual engine
   is the flagship differentiator and real new math — its own contract,
   strongest model, synthetic test gate, after the fact-spine (Phase 1)
   exists to carry per-shot events.
5. Turret-tape/destination-environment outputs — Phase 3, small.
6. Factory ammo-trial support — Phase 5 with the Workhorse package.
