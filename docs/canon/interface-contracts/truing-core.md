# Interface contract — `js/truing-core.js`

Gate 0 artifact. **This is the engine Amendment 1 A1 governs directly:**
*"The protected engine's Mach-bracket doctrine is the SOLE authority for
choosing velocity vs. drag truing: supersonic trajectory error trues
muzzle velocity; transonic-window error trues drag. Measured per-shot
velocity is evidence INPUT — it reduces uncertainty and improves
residuals — and is never a routing instruction."* `classifyDistance` is
that authority. Nothing else in the codebase may re-decide this routing.

Pure, no DOM/storage. Depends on `calculations.js` (`round4`,
`inchesToMOA`, `moaToInches`) and `ballistic-solver.js`
(`computeTrajectory`, `calculateSpeedOfSound`) — but unlike
`ballistic-solver.js`, this file's own top-of-file guard (lines 28–41)
requires and wires those under Node itself, so it has no hidden
browser-global-scope dependency when tested standalone.

## Constants — `TRUING`

| Key | Value | Meaning |
|---|---|---|
| `MIL_TO_MOA` | `3.43775` | caller-side unit conversion; not used internally |
| `MV_PRESCRIBE_FACTOR` | `0.85` | prescribed MV-truing distance = 85% of the Mach-1.2 crossing |
| `MV_BAND_EDGE` | `0.9` | routing boundary: below `0.9 × mach12Yd` = MV territory |
| `ZERO_BAND_FACTOR` | `1.5` | within `1.5 × zeroRange` = too close to true anything |
| `CORIOLIS_MIN_YD` | `800` | vertical Coriolis normalization only applies at/beyond this range |
| `SOLVE_TOL_MOA` | `0.02` | secant/bisection convergence tolerance |
| `SOLVE_MAX_ITER` | `25` | secant iteration cap before bisection fallback |
| `MV_BRACKET` | `[0.85, 1.15]` | solver search bracket, ×current MV |
| `BC_BRACKET` | `[0.70, 1.30]` | solver search bracket, ×current BC |
| `STD_ENV` | `{tempF:59, pressureInHg:29.92, humidity:50}` | default environment when none supplied |

## The routing doctrine (A1) — `classifyDistance`

`classifyDistance(rangeYds, machDist: {mach12Yd, supersonicYd, mach09Yd}, zeroRange)`
→ `{band: 'zero'|'mv'|'drag'|'beyond', supersonicPct: number|null}`

Evaluated in this exact order — **this order IS the doctrine**:

1. `rangeYds <= 1.5 × (zeroRange || 100)` → **`'zero'`** (too close to true anything).
2. else if `!mach12Yd || rangeYds < 0.9 × mach12Yd` → **`'mv'`** (comfortably supersonic; a load never modeled to Mach 1.2 is always `'mv'`, never `'drag'`).
3. else if `!mach09Yd || rangeYds <= mach09Yd + 30` → **`'drag'`** (transonic window, +30yd tolerance for the 25-yard rounding in prescribed distances; a load whose Mach-0.9 floor was never reached stays `'drag'` at any distance beyond the MV edge — there is no far wall).
4. else → **`'beyond'`** (past the transonic window; not usable for either truing path).

`supersonicPct = machDist.supersonicYd ? rangeYds / machDist.supersonicYd : null` —
informational only, does not affect the band decision.

**Nothing else routes.** `solveTruing` reads `band` off the *farthest*
group only (`normalizeGroups` groups shots first) to decide which
correction (`mv` vs `bc`) to recommend — it never re-derives the routing
itself, and per-shot measured velocity (`shotMV`) only feeds
`_mvSensitivity` normalization (removing the come-up a shot's own speed
explains), never the band decision. This matches A1's "measured
per-shot velocity is evidence INPUT... never a routing instruction."

## Mach geometry

| Function | Signature | Returns |
|---|---|---|
| `machDistances` | `(profile: {muzzleVelocity, bc, dragModel, zeroRange, scopeHeight, bulletWeight}, env)` | `{mach12Yd, supersonicYd (Mach 1.0), mach09Yd}` — each `null` if not reached within 3000 yd. Runs `computeTrajectory` at 2200yd/10yd-step first, re-runs at 3000yd/10yd-step only if Mach 0.9 wasn't reached (avoids the expensive long run for typical loads). |
| `prescribeTruingDistances` | `(profile, env)` | `{mvTrueYd, dragBracket: [from,to]\|null, machDist}` — `mvTrueYd = round25(0.85 × mach12Yd)`, floored at `max(300, 3×zeroRange)`; `dragBracket = [round25(mach12Yd), round25(mach09Yd)]` when both known. |

## Normalization — `normalizeGroups(obs, ctx)`

`obs: {rangeYds, observedComeUpMOA, shotMV?, groupId?, flagged?}[]`,
`ctx: {profile, env, latitudeDeg?, azimuthDeg?, machDist}` →
`{groups: GroupSummary[], ledger: LedgerEntry[], avgMV}`.

- Groups by `groupId` (defaults to `String(rangeYds)` when absent) —
  **truing never runs on single shots' raw values**, only group means.
- Per shot: `mvAdj` removes the come-up explained by that shot's own
  velocity deviating from the string average (central-difference
  sensitivity, ±10 fps); `corAdj` adds vertical Coriolis (Eötvös) when
  `rangeYds >= CORIOLIS_MIN_YD` and both `latitudeDeg`/`azimuthDeg` are
  supplied, else `0`. `aeroJump` is always the literal string
  `'not modeled'` — crosswind-induced vertical is not yet a correction
  term (Amendment A11 requires it enter only as an uncertainty term once
  the per-shot residual engine ships).
- Each group's `band`/`supersonicPct` come from `classifyDistance`
  applied to the group's `rangeYds` against `ctx.machDist`.

## The solve

| Function | Notes |
|---|---|
| `solveMvCorrection(groups, profile, env)` | `_solve1D(..., 'muzzleVelocity', MV_BRACKET)` |
| `solveBcCorrection(groups, profile, env)` | `_solve1D(..., 'bc', BC_BRACKET)` |
| `_solve1D` (internal) | Excludes `'zero'`/`'beyond'` groups when any non-excluded group exists. Secant method with bisection fallback inside the bracket; `capped: true` when the root lies outside the bracket (result clamped to the nearer wall) — a real signal that the data pushed past what the doctrine considers a trustworthy correction range. |
| `solveTruing(obs, ctx, opts: {mvMeasured})` | Runs both `solveMvCorrection` and `solveBcCorrection` unconditionally (the user always sees both options — §2.5's explicit fork), then applies the **routing doctrine** to the farthest group only to set `recommended` (`'mv'`\|`'bc'`) and a `guidance` string. Four branches, all golden-fixture-covered: far group in `'drag'` → always `'bc'` (wording differs by `mvMeasured`); far group not `'drag'` and `mvMeasured` → `'bc'` with an explicit "extrapolated" warning; far group not `'drag'` and MV unmeasured → `'mv'`. |

## Confidence — `truingConfidence(inputs)`

`{shotCount, groupCount, mvMeasuredPct, windLoggedPct, groupSpreadMOA,
envSource, zeroConfirmed, trackingVerified, supersonicPct,
correctionType, mode}` → `{segments: 1-5, word, capNotes: string[]}`.

Base segment from `shotCount`/`groupCount` (5 needs ≥20 shots/≥3
groups down to 1 for <3 shots), then a sequence of one-way caps
(`cap(n, note)` only ever lowers `base`, never raises it) for: quick
mode (≤3), BC correction under 85% of supersonic range (≤3), assumed
environment (≤3) or looked-up environment (≤4), group disagreement
>1.0 MOA (≤2) or >0.5 MOA (≤3), unconfirmed zero (≤2 — "nothing trues
without a confirmed zero" per Constitution C22), unverified tracking
(≤3), and MV correction with zero chronograph data (≤3). Low
wind-logging is a note only, not a cap, outside quick mode.
`TRUING_CONF_WORDS = ['Thin','Thin','Moderate','Good','High']`.

## Device compensation — `deviceCompensation(profile, env, scopeFactor, workingRange?)`

Returns `{bcOut, mvOut, sweetSpot: {fromYd,toYd,maxErrMOA}|null,
errorCurve: {rangeYds,errMOA}[], identity: boolean}`. When
`scopeFactor` is falsy or within `0.0005` of `1`, returns an identity
passthrough (`profile.bc`/`profile.muzzleVelocity` unchanged, empty
error curve). Otherwise golden-section search on BC (outer loop) with
an inner MV fit finds the `(bc, mv)` pair whose predicted come-up,
divided by the scope's true tracking factor, best matches the profile's
real trajectory across `workingRange` (default `{200, 1000}` bounded
below by `max(200, 2×zeroRange)`) — i.e., what the shooter should dial
through a scope that doesn't track true so the impact still lands
correctly. `sweetSpot` is the longest contiguous yardage run where the
residual error stays under `max(0.35in, 0.1 MOA)` at that range.

## Golden fixture coverage

`tests/fixtures/golden-truing-core.json` /
`tests/test-golden-truing-core.js` — 24 cases. `classifyDistance` is
exercised at every boundary yard (zero-band edge, MV_BAND_EDGE both
sides, transonic+30 tolerance both sides, beyond) plus both "unknown
Mach threshold" edge cases, using a synthetic `machDist` so the routing
itself is pinned independent of any one rifle's numbers. `machDistances`
/`prescribeTruingDistances` are pinned for two real cartridge profiles.
`solveTruing` covers all four `recommended` branches described above.
`truingConfidence` covers the 5/1 segment extremes and four distinct
cap triggers. `deviceCompensation` covers the identity passthrough and
one real 4%-short-tracking correction.
