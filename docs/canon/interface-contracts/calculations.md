# Interface contract — `js/calculations.js`

Gate 0 artifact. Documents the public surface of the protected engine as
it exists today (locked by `tests/fixtures/protected-engine-hashes.json`
and behaviorally pinned by `tests/test-golden-calculations.js`). This is
a description of reality, not a design proposal — any future change to
this surface is an engine change and must update the hash lock, the
golden fixtures, and this document in the same commit.

**Purity contract (CLAUDE.md Architecture Rule 1):** every export below is
a pure function — no DOM access, no storage, no network, no randomness,
no wall-clock reads. Same input always produces the same output.

**Coordinate system:** pixel coordinates, origin top-left, Y increases
downward (canvas convention). "Up" on the target is negative Y. All
distance outputs are inches unless the name says otherwise.

## Constants

- `MOA_FACTOR` — `1.047`. Inches per MOA at 100 yards.

## Unit conversion

| Function | Signature | Returns | Throws |
|---|---|---|---|
| `inchesToMOA` | `(inches: number, distanceYards: number)` | `number` (MOA) | `distanceYards <= 0` |
| `moaToInches` | `(moa: number, distanceYards: number)` | `number` (inches) | `distanceYards <= 0` |
| `pixelDistance` | `(p1: {x,y}, p2: {x,y})` | `number` (px, Euclidean) | never |
| `pixelsToInches` | `(pxDist: number, pixelsPerInch: number)` | `number` (inches) | `pixelsPerInch <= 0` |
| `centerToCenter` | `(edgeToEdgeInches: number, bulletDiameter: number)` | `number`, clamped `>= 0` | never |

## Group geometry

All take `impacts: {x,y}[]` in pixel coordinates (hole centers — already
center-to-center, per CLAUDE.md Key Formulas) and `pixelsPerInch: number`.

| Function | Extra args | Returns | `< 2` impacts |
|---|---|---|---|
| `calculateCentroid` | — | `{x, y}` (pixel space) | throws `'No impacts provided'` on empty (not `<2`) |
| `calculateGroupSize` | — | `{inches: number, pair: [i, j]}` — the farthest pair | `{inches: 0, pair: [0, 0]}` |
| `calculateMeanRadius` | — | `number` (inches) | `0` |
| `calculateVerticalSpread` | — | `number` (inches, max Y − min Y) | `0` |
| `calculateHorizontalSpread` | — | `number` (inches, max X − min X) | `0` |
| `calculateCEP` | — | `number` (inches; radius containing the closer 50% by sorted radial distance) | `0` |
| `calculateRadialSD` | — | `number` (inches; population SD of radial distances) | `0` |
| `calculateVerticalSD` | — | `number` (inches; population SD of Y/ppi) | `0` |
| `calculateHorizontalSD` | — | `number` (inches; population SD of X/ppi) | `0` |

## Point of aim / correction

| Function | Signature | Returns | Sign convention |
|---|---|---|---|
| `calculatePOAOffset` | `(poa: {x,y}, impacts: {x,y}[], pixelsPerInch)` | `{elevationInches, windageInches}`; `{0,0}` if `impacts.length === 0` | `elevationInches > 0` = impacts high; `windageInches > 0` = impacts right |
| `calculateATZ` | `(offset: {elevationInches, windageInches}, distanceYards)` | `{elevationMOA, windageMOA, elevationDir: 'Up'\|'Down', windageDir: 'Left'\|'Right'}` — magnitudes are `Math.abs`, directions are the *correction* (negated offset) | impacts high → dial `Down`; impacts right → dial `Left` |
| `calculateMeanElevation` | `(impacts, poa, pixelsPerInch)` | `number` (inches); `0` on empty | positive = high (`poa.y - p.y`) |
| `calculateMeanWindage` | `(impacts, poa, pixelsPerInch)` | `number` (inches); `0` on empty | positive = right (`p.x - poa.x`) |
| `calculateShotOffset` | `(shot: {x,y}\|null, poa, pixelsPerInch, distanceYards)` | `{verticalInches, verticalMOA, verticalDir, horizontalInches, horizontalMOA, horizontalDir, radialInches, radialMOA}` (all `round4`'d) | `null` if `shot`, `poa` falsy, `pixelsPerInch <= 0`, or `distanceYards <= 0`. Ties (`0`) report `'High'`/`'Right'`. |

## Zero and scope tracking

| Function | Signature | Returns |
|---|---|---|
| `zeroVerdict` | `(atz: {elevationMOA, windageMOA, elevationDir, windageDir}, clickValueMOA = 0.25, toleranceMOA = 0.25)` | `{confirmed: boolean, elevClicks, elevDir, windClicks, windDir}` — `confirmed` iff both `\|MOA\|` ≤ tolerance; clicks = `Math.round(\|MOA\| / clickValueMOA)` |
| `scopeTrackingAnalysis` | `(dialedMOA, distanceYards, actualTravelInches, horizDriftInches)` | `{expectedInches, actualInches, factor, errorPct, cantWarn}` (first four `round4`'d) — `factor = actual/expected`; `cantWarn` iff `\|horizDriftInches\| > expected * 0.02` |
| `applyScopeCorrection` | `(moa: number, factor: number\|null\|undefined)` | `number` — `moa / factor` if `factor` is a finite number `> 0`, else `moa` unchanged |

## Session rollup

`calculateSession({impacts, poa, pixelsPerInch, bulletDiameter, distanceYards})`
→ one object combining every metric above (`round4`'d), plus `shotCount`,
`distanceYards`, `groupSizePair`, `centroid: {x, y}` (raw pixel space, not
rounded). Throws `'No impacts to calculate'` if `impacts` is empty or
absent. `bulletDiameter` is accepted for interface symmetry but is not
used in any current calculation path (no edge-to-edge measurement is
performed here — impacts are already hole centers).

## Rounding

`round4(n)` — `Math.round(n * 10000) / 10000`. Applied to most outputs in
`calculateSession` and `calculateShotOffset`; NOT applied to the raw
per-function outputs of `calculateGroupSize`, `calculateMeanRadius`,
`calculatePOAOffset`, `calculateCEP`, `calculateRadialSD`,
`calculateVerticalSD`, `calculateHorizontalSD`, `calculateMeanElevation`,
`calculateMeanWindage`, or `calculateCentroid` when called directly
(callers round if they need to).

## Golden fixture coverage

`tests/fixtures/golden-calculations.json` / `tests/test-golden-calculations.js`
covers: every exported function at least once, the `<2`-impact and
empty-impact edge cases, both `throws` paths per function that has one,
the zero-verdict confirmed/not-confirmed boundary, the scope-tracking
cant-warning boundary, and the full `calculateSession` composite output.
