# E-SHADOW-SPEC.md — Per-Shot Residual Engine, Versioned Specification

**Status:** Amendment 1 Phase E, shadow stage. Written BEFORE
implementation per A11: *"Requires its own versioned specification
BEFORE implementation: inputs, uncertainty propagation... estimator,
weighting, minimum sample, outlier policy, synthetic golden cases."*
This document is that specification. `js/residual-engine.js` implements
it exactly; any future change to the math requires a new spec version
in this file first, same discipline as the canon documents themselves.

**Authority boundary (read this first):** this engine is evidence
*preparation*, never a replacement for doctrine. `truing-core.js`'s
Mach-bracket routing (A1) remains the SOLE authority for choosing
velocity vs. drag truing. This engine does not decide truing; it
decomposes dispersion so a human (or, later, the truing engine itself,
only after live promotion) has a better-quality input. Per Validation
Doctrine §8: *"per-shot layer is evidence preparation feeding
truing-core... engines remain the mathematical authority."*

**Version:** 1.1.0 (adversarial hardening, overnight run #2 — extends
§5's eligibility rules to two integrity checks the 1.0.0 shots schema
had no fields for; see §5 "Version 1.1.0 additions" below. No math in
§3/§4 changed. Prior version: 1.0.0, Phase E shadow implementation.
Both versions are shadow-stage; nothing in this revision changes the
promotion gate in §10 or wires the engine anywhere new.)

---

## 1. What this engine computes

For one **clean sequence** of long-range shots (defined in §5) sharing
one rifle, one load, one distance, one dial setting, and one
configuration epoch, the engine reports two numbers, both in MOA, both
carrying an uncertainty:

1. **Explained vertical dispersion** — how much of the shot-to-shot
   vertical spread is accounted for by each shot's own measured muzzle
   velocity deviating from the string's mean (the same "come-up
   normalized by the shot's own speed" idea `truing-core.js`'s
   `normalizeGroups` already applies at the group level — this engine
   applies it per shot and quantifies how much variance it removes).
2. **Unresolved residual** — whatever vertical spread remains after
   velocity is accounted for, with a propagated uncertainty band.

It explicitly does **not** say why the unresolved residual exists. Per
A11: *"it NEVER assigns the residual to scope, shooter, drag, zero, or
hardware without a discriminating test."* The output is a number and an
uncertainty, never a diagnosis.

---

## 2. Inputs

Per shot, in a sequence:

| Field | Type | Required | Notes |
|---|---|---|---|
| `rangeYds` | number | yes | shared across the sequence (§5) |
| `dialedMOA` | number | yes | the elevation actually dialed, shared across the sequence |
| `hitInches` | number | yes | vertical miss from point of aim, + = high |
| `shotMV` | number \| null | no | per-shot measured velocity; null = unmeasured shot |
| `seq` | integer | yes | shot order within the string (association, §5) |
| `atmosphere` | `{tempF, pressureInHg, humidity, source}` \| null | no | shared across the sequence unless noted otherwise |
| `dialResolutionMOA` | number | no | the scope's smallest adjustment (e.g. 0.1 mil ≈ 0.34 MOA); defaults per §3.5 |
| `chronoTimestampMs` | number \| null | no | wall-clock time (epoch ms) the chronograph device logged the velocity reading, if the source records one. **v1.1.0.** |
| `impactTimestampMs` | number \| null | no | wall-clock time (epoch ms) the impact/target observation was logged, if the capture screen records one. **v1.1.0.** |
| `impactGroupId` | string \| null | no | caller-supplied identifier the shooter/scorer used to mark "these shots share one physical hole, cannot be individually distinguished." **v1.1.0.** |

Sequence-level:

| Field | Type | Notes |
|---|---|---|
| `profile` | `{muzzleVelocity, bc, dragModel, bulletWeight, zeroRange, scopeHeight}` | the CURRENT accepted profile — this engine reads it, never writes it |
| `avgMV` | number | the string's own mean measured velocity (or the profile's book value if no shot has a measured MV) |
| `chronographClassPct` | number | the chronograph's own class error, e.g. `0.1` for a ±0.1%-class unit (Garmin Xero-class); defaults to `0.1` when unknown |

---

## 3. Uncertainty propagation

Every input uncertainty is carried in MOA at the sequence's range and
combined by root-sum-of-squares (independent-error assumption — stated,
not proven; a documented simplification appropriate to a shadow-stage
estimator, revisited if predeclared validation shows it's wrong).

### 3.1 Chronograph (velocity) uncertainty

A `±chronographClassPct%` class error on `shotMV` (default 0.1%,
A11's own example unit class) propagates to a come-up uncertainty via
the SAME solver the rest of the app already trusts: perturb the
profile's muzzle velocity by `±classPct%`, re-run `computeTrajectory`
at `rangeYds`, and take half the resulting come-up spread as
`sigmaVelocityMOA`. This reuses `ballistic-solver.js` unchanged — no
new physics, just a finite-difference sensitivity read off the existing
tested engine.

### 3.2 Distance uncertainty

Rangefinders in this class are assumed accurate to `±1 yard` at
practical distances (a documented default, not a measured fact per
device — `sigmaDistanceMOA` is computed the same finite-difference way:
perturb `rangeYds` by ±1 yard, re-run the trajectory, half the come-up
spread).

### 3.3 Atmosphere uncertainty

When `atmosphere.source === 'estimated'` (weather-service lookup, per
Constitution §37.2's "estimated is not measured"), apply a wider
perturbation band (`±10°F`, `±0.5 inHg`, `±15%` humidity — the same
finite-difference approach) than when `source === 'measured'`
(`±2°F`, `±0.1 inHg`, `±5%`). Missing atmosphere uses `STD_ENV` from
`truing-core.js` with the WIDE (estimated-class) band, never the narrow
one — an honest default is still a default, per Constitution §37.2.

### 3.4 Impact-observation uncertainty

The shooter's own reported precision. A photo-measured impact on the
Proven calibrated target: `±0.1 MOA` at typical distances (target
calibration's own resolution). A verbally reported "about two tenths
high": `±0.25 MOA` (Constitution §35.2's own example rounds to a
tenth — the uncertainty is at least that coarse). Caller supplies
`impactObservationMOA` directly (already computed by the capture
screen's own provenance — this engine does not re-derive it); defaults
to the coarser `±0.25 MOA` when the caller doesn't supply one, per
Constitution §74 ("do not ask for precision the observation does not
have" — the engine must not assume better precision than was captured).

### 3.5 Dial (turret) uncertainty

Half the scope's own click resolution (`dialResolutionMOA / 2`),
defaulting to `0.125 MOA` (half of a common 0.25-MOA click) when
unknown. `deviceCompensation`'s scope-tracking correction, if the
rifle's tracking has been verified, is NOT re-applied here — the
profile passed in is assumed already tracking-corrected upstream,
consistent with how `truing-core.js` itself treats a verified scope.

### 3.6 Combined per-shot uncertainty

```
sigmaShotMOA = sqrt(sigmaVelocityMOA² + sigmaDistanceMOA² + sigmaAtmosphereMOA²
                     + impactObservationMOA² + dialUncertaintyMOA²)
```

### 3.7 Aerodynamic jump (crosswind-induced vertical)

Per A11: *"Crosswind-induced vertical (aerodynamic jump) enters as an
uncertainty term, not a fitted parameter."* When a per-shot or
string-level crosswind estimate is available, its vertical component
(a small, wind-speed-proportional term, itself uncertain) is added
in-quadrature to `sigmaShotMOA` as `sigmaAeroJumpMOA`, exactly mirroring
`truing-core.js`'s own `aeroJump: 'not modeled'` marker — this engine
also does NOT model aero jump as a correction, only (optionally) as
additional uncertainty budget when a wind estimate exists. No wind
estimate → `sigmaAeroJumpMOA = 0`, never fabricated.

---

## 4. The estimator

For each shot in the sequence:

1. `predictedMOA_stringMV` = the profile's predicted come-up at
   `rangeYds` using the STRING's mean velocity (`avgMV`) — the
   "explained by nothing per-shot" baseline.
2. `predictedMOA_shotMV` = the same prediction using THIS shot's own
   `shotMV` when known, else falls back to `predictedMOA_stringMV`
   (a shot with no measured velocity contributes no per-shot
   explanatory power — it is still used for the residual step, just not
   for narrowing it).
3. `observedMOA` = `dialedMOA - inchesToMOA(hitInches, rangeYds)` — the
   same "true come-up this shot needed" quantity `simple-true.js`
   already computes (reused conceptually, not by calling into the
   frozen engine, to keep this engine fully independent and Node-testable
   on its own).
4. `rawResidualMOA` = `observedMOA - predictedMOA_stringMV` (residual
   BEFORE any per-shot velocity compensation).
5. `velocityCompensatedResidualMOA` = `observedMOA -
   predictedMOA_shotMV` (residual AFTER compensation, when `shotMV`
   is known; equals `rawResidualMOA` otherwise).

**Explained dispersion** across the sequence:

```
explainedMOA² = variance(rawResidualMOA across shots)
                - variance(velocityCompensatedResidualMOA across shots)
```
(clamped to ≥ 0 — a velocity-compensated variance can never legitimately
exceed the raw variance under this model; a negative result before
clamping indicates numerical noise on a thin sample, not a real
negative explanation, and is itself evidence the sample is too small to
trust — surfaced via the confidence word, §7, not hidden).

**Unresolved residual** is the **weighted mean** of
`velocityCompensatedResidualMOA` across eligible shots (§5, §6), with
weight `1 / sigmaShotMOA²` per shot (inverse-variance weighting — the
standard minimum-variance unbiased linear estimator for combining
independent measurements of differing precision). Its uncertainty is
`1 / sqrt(sum(1 / sigmaShotMOA²))`.

---

## 5. Association eligibility (clean one-to-one sequences only)

Per A11: *"Association is analytically eligible only for clean
one-to-one sequences (no unresolved gaps, duplicates, dial changes, or
competing sources); otherwise proposed-only."*

A sequence is **eligible** only when ALL of the following hold:

- every shot has a distinct, consecutive `seq` (no gaps, no duplicate
  sequence numbers within the string);
- every shot shares the same `rangeYds` and `dialedMOA` (a dial change
  mid-string starts a NEW sequence, never blended into the old one);
- no shot's optional `mvSourceId` (a caller-supplied identifier for
  which chronograph reading a shot's velocity came from — e.g. a
  velocity-string row id + index, NOT the numeric fps value itself) is
  claimed by more than one shot record. Checking by the raw `shotMV`
  number would be unsound: two different real shots legitimately
  reading the same rounded fps value is ordinary chronograph data, not
  a duplicate. Shots with no `mvSourceId` skip this check;
- no shot's optional `impactGroupId` (**v1.1.0** — a caller-supplied
  identifier the shooter/scorer used when two or more rounds landed in
  one physically indistinguishable hole) is shared by more than one
  shot record. When two shots cannot be told apart on the target, there
  is no sound way to say which measured velocity produced which
  vertical miss — attributing either shotMV to "the" impact would be a
  guess, not an association. This is the impact-side mirror of the
  `mvSourceId` check above (one checks the velocity source isn't double
  counted, this checks the impact observation isn't double counted).
  Shots with no `impactGroupId` skip this check — the common case of
  ordinary, individually-legible holes;
- **v1.1.0.** no two shots' `chronoTimestampMs`/`impactTimestampMs` pair
  (when BOTH are supplied on a shot) differ by more than
  `MAX_CLOCK_SKEW_MS` (default 5 minutes — generous enough for normal
  device-clock drift and capture lag within one string, tight enough to
  catch a chronograph and a capture screen that are logging two
  different strings of fire under the same session). A shot supplying
  only one of the two timestamps (or neither) skips this check entirely
  — this is a corroboration check for sequences that HAVE both clocks,
  never a requirement to have them;
- the sequence has at least `MIN_SAMPLE` shots (§6).

A sequence failing any check is **proposed-only**: the engine returns
`{eligible: false, reason}` and computes nothing further. Per
Constitution §17 ("capture validity and analytic eligibility are
different"), the underlying shots remain fully preserved regardless —
this engine only judges whether IT may compute on them, never whether
they are valid history.

**Deliberately NOT an eligibility rule, v1.1.0:** a shot with a missing
`shotMV` (an unmeasured or dropped chronograph detection mid-string)
does not, by itself, make the sequence ineligible. §4 point 2 already
defines the honest fallback (no per-shot velocity compensation for that
shot; it still contributes a raw residual observation), §6 already
gates `sufficientSample` on the count of MV-matched shots specifically,
and §7's `capNotes` already flags "not every shot has a measured
velocity" whenever this happens. A hard-ineligible rule here would
throw away a real, partially-informative string over a single dropped
detection; the existing sample-size and confidence gating already
prevents the engine from overstating what a thin-MV string supports.
Confirmed by the golden suite's adversarial case (§11).

---

## 6. Minimum sample and outlier policy

**Minimum sample:** `MIN_SAMPLE = 4` shots with a known `shotMV` (fewer
than 4 velocity-matched shots cannot support a variance-reduction
estimate with any honesty — A10's small-sample honesty applied to a new
context). Below this, the engine still reports `rawResidualMOA`
per-shot data (nothing is hidden) but refuses to report an
`explainedMOA`/`unresolvedResidualMOA` aggregate, returning
`{eligible: true, sufficientSample: false}` instead.

**Outlier policy:** a shot's `velocityCompensatedResidualMOA` more than
`OUTLIER_SIGMA = 3` scaled median-absolute-deviations (MAD × 1.4826, the
standard consistent estimator of σ under normality) from the sequence's
own **median** is **excluded from the weighted aggregate** but **never
discarded from the record** — flagged with its own value and reason,
mirroring Constitution §17's core rule at the per-shot level. Median/MAD
is used deliberately instead of mean/SD: caught during this phase's own
golden-suite construction, a single gross outlier in a small sample
inflates a mean/SD threshold enough to mask itself (the mean is dragged
toward the outlier and the SD it's measured against inflates at the same
time) — median and MAD resist exactly this failure mode, since one bad
point can only nudge either statistic by a little. MAD itself has its
own degenerate case, also caught this phase: it is exactly zero
whenever a majority of shots share an identical compensated residual (a
real, not just synthetic, possibility for a clean string), which would
make any nonzero deviation read as an infinite number of MADs away. A
small absolute scatter floor, `MAD_FLOOR_MOA = 0.05`, guards this — the
scale used for the threshold is `max(MAD * 1.4826, MAD_FLOOR_MOA)`.
`OUTLIER_SIGMA = 3`
is a conservative, wide threshold (not the tighter thresholds
truing-core uses elsewhere) deliberately, because this is a shadow-stage
estimator whose own uncertainty model has not yet been field-validated —
a tighter threshold risks discarding real signal under an imperfectly
calibrated uncertainty band.

---

## 7. Confidence language (Evidence & History Doctrine, Part A)

The engine's output carries an explicit evidence level: **CALCULATED**
(Part A's own definition — "output of a physical model fed by
observations"), never higher. Its confidence word (`Thin` / `Moderate`
/ `Good` — reusing `truing-core.js`'s own `TRUING_CONF_WORDS`
vocabulary for consistency, not by importing the frozen engine) is
driven by: sample size relative to `MIN_SAMPLE`, the fraction of shots
with a known `shotMV`, and whether any shot was excluded as an outlier.
It is never presented as a correction, a diagnosis, or a truing
recommendation — those remain `truing-core.js`'s exclusive domain (A1).

---

## 8. Output shape

```
{
  eligible: boolean,
  reason: string | null,              // populated only when eligible === false
  sufficientSample: boolean,          // false when eligible but < MIN_SAMPLE
  shots: [{ seq, rawResidualMOA, velocityCompensatedResidualMOA, sigmaShotMOA, excluded: boolean, excludeReason: string|null }],
  explainedMOA: number | null,        // sqrt(explainedMOA²), null if !sufficientSample
  unresolvedResidualMOA: number | null,
  unresolvedResidualUncertaintyMOA: number | null,
  confidence: { word: string, capNotes: string[] },
  evidenceLevel: 'CALCULATED'
}
```

---

## 9. Shadow-stage constraints (this phase only)

- The engine is **pure** (no DOM, no storage) — `js/residual-engine.js`.
- A shadow LOGGING call (`js/db.js`'s `logResidualShadow`) records the
  output to a dedicated, additive `residual_shadow_log` table
  (PHASECD-migrations.sql) whenever a compatible steel string is saved
  — best-effort, fire-and-forget, never blocking the save, never read
  back by any other part of the application this phase. Nothing queries
  this table for display, coaching, or truing input. This is the
  literal enforcement of "shadow": the data exists and is computed
  honestly, but the application does not act on it.
- **Explicitly forbidden this phase:** calling this engine from
  `truing-core.js`, `simple-true.js`, `rifle-payoff.js`'s correction
  path, or `next-action.js`'s ladder. No accepted solution, PROVEN TO
  computation, or coach-line suggestion may read this engine's output.

---

## 10. Promotion gate (future work, NOT this phase)

Per A11, this engine may only leave shadow status after, in order:

1. **Synthetic recovery** — given synthetic per-shot data generated
   from a KNOWN velocity/residual relationship, the engine recovers the
   known answer within a stated tolerance. (Covered THIS phase by the
   golden test suite, §11 — required before shadow implementation even
   ships, not deferred.)
2. **Perturbation** — small, realistic changes to inputs (noise on
   `shotMV`, a slightly different `rangeYds`) produce correspondingly
   small changes in output, never a discontinuous jump. (Also covered
   by the golden suite this phase.)
3. **Known-answer validation** — a real, controlled data set with an
   independently established true residual (e.g., a professionally
   verified truing session) reproduced by this engine within tolerance.
   Requires real range data; deferred.
4. **Predeclared real-range validation** — a protocol stated in advance
   (which strings, what tolerance counts as pass) run against live
   future data, not cherry-picked after the fact. Deferred; requires the
   owner's go-ahead per this session's instructions.

Only after all four does Phase F-or-later work wire this engine's
output into the protected routing engine (A1) as an additional input —
and even then, per A11, "always through the protected routing engine,"
never as a side-channel.

---

## 11. Golden test suite (this phase)

`tests/fixtures/golden-residual-engine.json` /
`tests/test-golden-residual-engine.js` cover:

- **Recovery**: a synthetic sequence built from a known "true" velocity
  sensitivity and a known injected constant residual (e.g. 0.3 MOA) —
  the engine's `unresolvedResidualMOA` recovers the injected value
  within the propagated uncertainty band.
- **Perturbation**: the same sequence with small (realistic) per-shot
  velocity noise added — output changes smoothly, uncertainty widens,
  no discontinuity.
- **Zero-signal case**: synthetic shots with NO velocity-explainable
  variance and no injected residual — `explainedMOA` near zero,
  `unresolvedResidualMOA` near zero.
- **Outlier exclusion**: one synthetic shot injected far outside the
  rest of the sequence — confirmed excluded from the weighted estimate,
  confirmed still present in `shots`/`excludedShots`.
- **Minimum sample gate**: fewer than `MIN_SAMPLE` velocity-matched
  shots — confirms `sufficientSample: false` and no aggregate reported.
- **Ineligibility**: a sequence gap, a dial change mid-sequence, and a
  duplicate `shotMV` claim — each confirmed to return
  `eligible: false` with a distinct `reason`, and confirmed to compute
  nothing further.
- **v1.1.0 adversarial suite** (`tests/test-residual-engine-adversarial.js`):
  missing chrono detection mid-string (confirmed NOT ineligible per §5's
  explicit non-rule, confirmed the honest fallback/capNote fires
  instead); duplicate import (two shot records both claiming the same
  `mvSourceId`, confirmed ineligible); re-dial within a string (dial
  changes on a later shot, confirmed ineligible, distinct from a clean
  string at the new dial); clock skew between chrono and impact logs
  (two shots whose `chronoTimestampMs`/`impactTimestampMs` disagree by
  more than `MAX_CLOCK_SKEW_MS`, confirmed ineligible; confirmed a
  sequence supplying no timestamps at all is unaffected); multi-shot
  single impact (two shots sharing one `impactGroupId`, confirmed
  ineligible; confirmed distinct `impactGroupId`s or no `impactGroupId`
  at all are unaffected). Every case in this suite asserts BOTH
  `eligible: false` AND that `computeResidualEngine` returns no
  aggregate (`explainedMOA`/`unresolvedResidualMOA` both `null`) — the
  engine must refuse to guess, not merely warn.
