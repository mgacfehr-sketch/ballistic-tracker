# Interface contract — `js/ballistic-solver.js`

Gate 0 artifact. Two unrelated things share this one protected file:

1. **Pure solver section** (lines ~1–509) — G1/G7 drag tables, RK4
   integration, secant-method zero finding, full trajectory computation.
   This is the protected math (CLAUDE.md Architecture Rule 1).
2. **`BallisticSolverManager`** (lines ~516–end) — a DOM-bound UI class
   (renders the solver form, reads `document.getElementById`, calls
   `NetService`, `Icon`, `AppNav`). Not pure, not covered by golden
   fixtures, out of scope for this contract. It is still inside the
   hash-locked file, so any edit to it also trips the byte-identity gate
   — legitimate UI work on this class updates the hash lock without
   touching the golden fixtures below.

## ⚠ Discovered coupling: implicit dependency on `calculations.js`

`computeTrajectory()` calls bare `round4(...)` and `inchesToMOA(...)` —
neither is defined, imported, or destructured anywhere in this file. In
the browser this resolves because `index.html` loads
`<script src="js/calculations.js">` before
`<script src="js/ballistic-solver.js">`, and plain (non-module) scripts
share one global scope, so `calculations.js`'s top-level `function
round4(){}` / `function inchesToMOA(){}` are already live globals by the
time `ballistic-solver.js` runs.

Outside that specific load order — `require('./ballistic-solver.js')`
in isolation, a future bundler, a Capacitor build step that concatenates
differently — `computeTrajectory()` throws `ReferenceError: round4 is
not defined`. `findZeroAngle`, `rk4Step`, `solverDerivatives`, and the
other lower-level functions do NOT have this dependency; only
`computeTrajectory()`'s row-building code does.

This is not fixed here — fixing it would edit the protected engine,
which is out of scope for Gate 0 (new files only). It's recorded as a
finding for the owner-review queue in GATE0-PHASEA-REPORT.md. The golden
fixture harness (`tests/test-golden-ballistic-solver.js`) replicates the
real browser dependency explicitly (`global.round4 = calc.round4` etc.
before requiring the solver) rather than working around it, so the test
exercises the actual shipped behavior.

## Constants

| Name | Value | Meaning |
|---|---|---|
| `GRAVITY` | `32.17405` | ft/s² |
| `STD_TEMP_F` | `59` | standard atmosphere temperature |
| `STD_PRESSURE_INHG` | `29.92` | standard atmosphere pressure |
| `SOLVER_DT` | `0.0005` | RK4 integration time step, seconds |
| `DRAG_CONSTANT` | `0.5 * 0.0764742 * π / (4 * 144)` | drag-force coefficient (standard air density, circular cross-section, in²→ft²) |
| `G1_DRAG_TABLE` | `[mach, Cd][]` | published G1 standard drag curve, 0.00–5.00 Mach |
| `G7_DRAG_TABLE` | `[mach, Cd][]` | published G7 standard (boat-tail) drag curve, 0.00–5.00 Mach |

## Functions

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `interpolateCd` | `(table: [mach,Cd][], mach: number)` | `number` (Cd) | Linear interpolation; clamps to the table's first/last Cd outside its Mach range (no extrapolation). |
| `calculateSpeedOfSound` | `(tempF: number)` | `number` (ft/s) | `49.0223 * sqrt(tempF + 459.67)`. |
| `calculateAirDensityRatio` | `(tempF, pressureInHg, humidity: 0–100)` | `number` (dimensionless, 1.0 = standard atmosphere) | Magnus-formula vapor pressure correction. |
| `estimatePressureAtAltitude` | `(altitudeFt: number)` | `number` (inHg) | Standard-atmosphere barometric lapse-rate formula, anchored at 29.92 inHg / sea level. |
| `windComponentsFromClock` | `(clockPos: 1–12, speedMph: number)` | `{windVxFps, windVzFps}` | 12 = headwind, 6 = tailwind, 3 = full crosswind from the right, 9 = from the left. Returned as *air velocity in the ground frame* (sign convention documented at the call site — negative `windVx` = headwind). |
| `solverDerivatives` | `(state: [x,y,vx,vy,z,vz], windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio)` | `number[6]` derivative vector | Below 1 ft/s total velocity, short-circuits to gravity-only (no drag) to avoid a division-by-near-zero in the drag direction unit vector. |
| `rk4Step` | `(state, dt, windVx, windVz, speedOfSound, bc, dragTable, airDensityRatio)` | `number[6]` next state | Classic 4th-order Runge-Kutta, fixed `dt`. |
| `findZeroAngle` | `(params: {muzzleVelocity, bc, dragTable, zeroRange (yd), scopeHeight (in, default 1.5), speedOfSound, airDensityRatio})` | `number` (bore elevation angle, degrees) | Secant method, ≤20 iterations, converges when `\|error\| < 1e-8` ft or the secant denominator collapses. Zero range internally becomes `zeroRange * 3` ft. |
| `computeTrajectory` | `(params: {muzzleVelocity, bc, dragModel: 'G1'\|'G7', zeroRange, scopeHeight, bulletWeight, maxRange, rangeStep, windSpeedMph, windClockPos, tempF, pressureInHg, humidity})` | `{zeroAngleDeg: number, table: DropTableRow[]}` | See row shape below. Defaults when a param is falsy: `dragModel`→G1, `zeroRange`→100, `scopeHeight`→1.5, `maxRange`→1000, `rangeStep`→100, `windClockPos`→3, `tempF`→`STD_TEMP_F`, `pressureInHg`→`STD_PRESSURE_INHG`, `bulletWeight`→168. **Requires `round4`/`inchesToMOA` as globals — see the coupling note above.** |

### `DropTableRow` shape (one entry per `rangeStep`, plus a muzzle row at 0 yards)

```
{
  rangeYards, dropInches, dropMOA, comeUpMOA,     // comeUpMOA = -dropMOA
  windDriftInches, windDriftMOA,
  velocityFps, energyFtLbs,                       // both Math.round'd (not round4)
  timeOfFlightSec, machNumber
}
```
The muzzle row (`rangeYards: 0`) reports `dropInches = -scopeHeight` (bullet
starts at the bore, `scopeHeight` below the sight line) and
`dropMOA/comeUpMOA/windDrift* = 0` (undefined at zero range).

## Not covered by golden fixtures (DOM-bound, out of scope)

`BallisticSolverManager` and all its prototype methods (`init`, `show`,
`_render`, `_bindEvents`, `_fetchWeather`, `_calculate`, `_renderTable`,
`_esc`) — these read `document`, call `NetService.getConditions()`, and
mutate `innerHTML`. They are exercised (if at all) by UI/integration
tests, not engine golden fixtures.

## Golden fixture coverage

`tests/fixtures/golden-ballistic-solver.json` /
`tests/test-golden-ballistic-solver.js` covers: `interpolateCd` exact
table hit, mid-interval interpolation, and both clamp directions (G1 and
G7); `calculateSpeedOfSound` and `calculateAirDensityRatio` across a
cold/standard/hot and dry/humid/altitude spread; `estimatePressureAtAltitude`
at three altitudes; `windComponentsFromClock` at all four cardinal clock
positions; `solverDerivatives`' normal and sub-1-fps branches; one
`rk4Step`; one `findZeroAngle`; and two full `computeTrajectory` tables —
a short-range G1 .308 load and a long-range G7 6.5 Creedmoor-class load
that crosses from supersonic into the transonic band (Mach 2.45 → 1.29),
which is the input shape `truing-core.js`'s Mach-bracket routing
consumes (see `docs/canon/interface-contracts/truing-core.md`).
