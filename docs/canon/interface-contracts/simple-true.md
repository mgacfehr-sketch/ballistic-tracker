# Interface contract — `js/simple-true.js`

Gate 0 artifact. The "WHERE DID IT HIT?" one-observation truing path
(Contract v2.5 §2.3) — a thin, honest wrapper around `truing-core.js`'s
`solveTruing` in single-observation mode, plus the payoff copy shown to
the shooter. No fork is ever shown to the user here: the doctrine
(`truing-core.js`'s `recommended` field) picks silently.

Split module (calibration-status pattern):
- **Pure core** (top of file, exported): `simpleToMOA`, `simpleFromMOA`,
  `simpleComeUpAt`, `simpleTrueObservation`, `simpleTruePayoffCopy`.
  Node-tested, no DOM.
- **`SimpleTrue`** (bottom, gated on `typeof document !== 'undefined'`):
  the ask → payoff → Keep/Undo DOM flow, and `_keep`'s append-only
  truing-event write. Out of scope for golden fixtures.

**Dependency resolution:** the file's own top-of-file guard (lines
21–37) requires `truing-core.js` under Node and pulls `TRUING`,
`solveTruing`, `machDistances`, `truingConfidence` from it, plus
`inchesToMOA`/`moaToInches` (from `calculations.js`) and
`computeTrajectory` (from `ballistic-solver.js`) if `truing-core.js`'s
own guard hasn't already provided them. Net effect: **`require('./js/simple-true.js')`
works standalone under Node with no manual global wiring** — unlike
`ballistic-solver.js` alone, this file (like `truing-core.js`) fully
self-wires its dependency chain. No coupling finding here.

## Unit conversion

| Function | Signature | Returns | Branches |
|---|---|---|---|
| `simpleToMOA` | `(value, units: 'MIL'\|'IN'\|other, rangeYds)` | `number` (MOA) | `'MIL'` → `value * TRUING.MIL_TO_MOA`; `'IN'` → `inchesToMOA(value, rangeYds)`; anything else (including `'MOA'` or an unrecognized string) → passthrough unchanged |
| `simpleFromMOA` | `(valueMOA, units: 'MIL'\|'IN'\|other, rangeYds)` | `number` (display units) | mirror of the above, `moaToInches` for `'IN'` |

Note: neither function validates `units` — an unrecognized string
silently behaves like `'MOA'` (passthrough). This is existing behavior,
not validated input.

## `simpleComeUpAt(profile, env, rangeYds)` → `number|null` (MOA)

Runs `computeTrajectory` with `rangeStep: 10`, `maxRange: rangeYds + 50`,
no wind (`windSpeedMph: 0`), then linearly interpolates `comeUpMOA` at
the exact `rangeYds` from the resulting table. `env` may be `null`/
partial — each of `tempF`/`pressureInHg`/`humidity` falls back
independently to std atmosphere (59°F/29.92inHg/50%) when not a number;
`tempF === 0` becomes `0.001` (same falsy-zero survival trick documented
in `truing-core.js`'s contract) so an honest 0°F doesn't silently become
standard temperature. Returns `null` only if the computed table is
empty (not reachable through the normal params shape). No special
handling at `rangeYds` at or near 0 — this is a real, unguarded near-muzzle
value, not a documented low-range cutoff.

## `simpleTrueObservation(input)` → `null | {picked, option, result, confidence, corrected, observedComeUpMOA, payoff}`

```
input = {
  profile, env, rangeYds,
  dialed: number,          // elevation dialed, in `units`
  hitInches: number,       // vertical miss, + = HIGH, − = LOW
  units: 'MIL'|'IN'|'MOA',
  shotMV?: number,         // one typed velocity, optional
  mvMeasured: boolean,     // is the profile's MV chronographed?
  zeroConfirmed?, trackingVerified?: boolean   // confidence inputs only
}
```

1. Converts `dialed` to MOA, converts `hitInches` to MOA
   (`inchesToMOA`), computes `observedComeUpMOA = dialedMOA - hitMOA`
   ("hit HIGH → it took LESS than you dialed").
2. Builds a single-observation `obs` array (`groupId: 'simple'`) and
   calls `truing-core.js`'s `solveTruing` with
   `machDist: machDistances(profile, env)`.
3. **Two honesty guards, both return `null` (never a fabricated
   correction):**
   - `result.farBand === 'zero'` — the observation is inside the zero
     band (routing doctrine, `classifyDistance`); "teaches nothing."
   - `option.capped === true` on the picked correction — the required
     correction pins the solver's search bracket; the miss is too big
     to be honestly explained by a speed or drag error alone.
4. Otherwise builds `confidence` via `truingConfidence` with
   `shotCount: 1, groupCount: 1, mode: 'quick'` always (a single
   observation is always evaluated as quick/thin — this is not
   caller-configurable), and `mvMeasuredPct` derived from whether
   `shotMV` or `mvMeasured` was supplied.
5. Computes the payoff by running `simpleComeUpAt` twice (before/after
   the correction) and converting both to the caller's display `units`,
   each independently rounded to 1 decimal place via `Math.round(x*10)/10`.
   `payoff.moved` is `Math.abs(oldDial - newDial) >= 0.05` **in display
   units, post-rounding** — see the note below.
   `payoff.pastYd = max(100, round25(rangeYds * 2/3))`.

### ⚠ Note: `moved` can read `false` even when a real correction was applied

Because `oldDial`/`newDial` are each rounded to 1 decimal in the
*caller's display unit* before the `moved` comparison, a real,
non-trivial BC or MV correction can still show `moved: false` if its
effect on the dial at *this specific range* rounds away — most visibly
in MIL (a coarser unit than MOA at the 1-decimal display precision used
here). This is real, verified engine behavior (see golden fixture case
6: a BC correction from 0.315 → 0.304, doctrine-correct and flagged
"extrapolated," still reports `moved: false` in MIL at 600 yd) — not a
bug fixed in this Gate 0 pass, since fixing it would edit a protected
engine. Flagged for the owner-review queue: the payoff copy path
(`simpleTruePayoffCopy`) will tell the shooter "your dial barely
moves" in this situation even though a correction was, in fact, kept.

## `simpleTruePayoffCopy(payoff)` → `string`

`!payoff.moved` → `"Got it. Your {rangeYds}-yard dial barely moves — your numbers were already close."`
Otherwise → `"Got it. Your {rangeYds}-yard dial changes from {oldDial.toFixed(1)} to {newDial.toFixed(1)}. Everything past ~{pastYd} just got more accurate."`

## Golden fixture coverage

`tests/fixtures/golden-simple-true.json` / `tests/test-golden-simple-true.js`
— 24 checks. Unit conversion (both directions, all three unit branches,
including the unrecognized-units passthrough). `simpleComeUpAt` across
an exact table step, an interpolated step, the null-env default, the
0°F falsy-zero survival, a range requiring table auto-extension, and
both near-muzzle edges (0yd, 10yd). `simpleTrueObservation` across: the
full round-trip (mirrors `test-simple-true.js`'s planted-error scenario
but pins the complete output shape and payoff copy verbatim), a
dead-center no-op hit, both honesty-guard `null` paths (zero-band,
capped), a typed-MV case, and the MIL-display `moved:false`-despite-a-
real-correction nuance documented above.
