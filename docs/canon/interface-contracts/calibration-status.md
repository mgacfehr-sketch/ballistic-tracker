# Interface contract — `js/calibration-status.js`

Gate 0 artifact. **This is the PROVEN TO contract.** Amendment 1 A3:
*"[PROVEN TO's] behavior is defined exclusively by the existing rollup
engine (calibration-status.js), whose contract MUST be frozen with
golden test vectors (scope, evidence minimums, invalidation, reversal)
before any refactor touches its inputs."* `deriveCalibrationStatus` is
that rollup engine, and `rollup.calibratedToYd` / `rollup.word` is the
existing codebase's concrete implementation of the "PROVEN TO ___ YARDS"
mechanic described throughout the canon (Product Definition §3;
Constitution §19). Any future PROVEN TO refactor changes *this*
function's contract, not a new one.

Pure derivation core (`deriveCalibrationStatus`, `calDaysBetween`,
`CALIBRATION_AGING`) — no DOM, no storage, `now` is an explicit input
(not a wall-clock read), so it is fully deterministic and reproducible.
`CalibrationStatusCard` (bottom half of the file, gated behind `typeof
document !== 'undefined'`) is the DOM renderer — out of scope for golden
fixtures, covered only by the hash lock.

## Constants — `CALIBRATION_AGING`

| Key | Value | Meaning |
|---|---|---|
| `zeroStaleDays` | `90` | zero confirmation goes stale after this many days |
| `mvStaleDays` | `180` | MV measurement goes stale after this many days |
| `trackingStaleDays` | `365` | scope-tracking verification goes stale after this many days |
| `zeroThinShots` | `5` | fewer shots than this in the confirming group → `'thin'`, not `'confirmed'` |
| `zeroDriftMOA` | `0.5` | centroid movement between the two most recent zero events beyond this → `'drifted'` |
| `mvMaterialDeltaFps` | `15` | MV re-measurement beyond this delta after a truing event → flags that truing stale |

## `deriveCalibrationStatus(input)` → `{tracking, zero, mv, trued, rollup, hint}`

### Input shape

```
{
  now: ISO string (required — caller supplies wall-clock time, this function never reads it),
  rifle: { zeroRange?, scopeCorrectionFactor?, scopeTrackingTestedAt? },
  load: { muzzleVelocity?, lotNumber?, truedMv?, truedBc? } | null,
  currentLot: string | null,
  zeroVerdict: { state: 'ready'|'adjust'|'unchecked', correction? } | null,
  zeroEvents: [{date, shotCount, distanceYards, groupData: {atzElevationMOA, atzWindageMOA}}],
  scopeAdjustments: [{date}],
  mvMeasurements: [{date, value, sd, shotCount, lotNumber}],
  trackingVerifications: [{date, factor}],
  truingEvents: [{appliedAt, stage: 'mv'|'drag', correctionType, supersonicPct, far: {rangeYds}, newValue}]
}
```

### The four elements

**`tracking`** — from the latest `trackingVerifications` entry, falling
back to `rifle.scopeCorrectionFactor`/`scopeTrackingTestedAt`.
`state: 'never'` (no factor at all) | `'stale'` (age > `trackingStaleDays`)
| `'verified'`.

**`zero`** — evaluated in this exact precedence:
1. No zero events AND no verdict (or verdict `'unchecked'`) → `'never'`.
2. Live `zeroVerdict.state === 'adjust'` → `'adjust'` (overrides
   everything else below, even a technically-confirmed prior event).
3. Otherwise, from the latest zero event: a scope adjustment logged
   *after* that event's date → `'stale'` ("Scope adjusted since").
   Else age > `zeroStaleDays` → `'stale'` (aging). Else centroid moved
   > `zeroDriftMOA` vs. the previous zero event → `'drifted'`. Else
   shot count < `zeroThinShots` → `'thin'`. Else → `'confirmed'`.

**`mv`** — from the latest `mvMeasurements` entry: lot mismatch
(`currentLot` set, differs from the measurement's `lotNumber`) → `'stale'`.
Else age > `mvStaleDays` → `'stale'`. Else → `'measured'`. With no
measurement at all, `load.muzzleVelocity > 0` → `'estimated'`, else
`'none'`.

**`trued`** — from the latest `truingEvents` entry by `appliedAt`. No
event → `'untrued'`. Otherwise `state`/`stage` mirror `te.stage`
(`'mv'` or `'drag'`), `toYd = te.far.rangeYds`. `flagged: true` when
either (a) a zero event postdates the truing AND the *current* zero
state is `'drifted'` or `'adjust'` (not merely "a new zero exists" —
the new zero has to actually indicate a problem), or (b) an MV
measurement postdates the truing, `te.correctionType === 'mv'`, and the
delta exceeds `mvMaterialDeltaFps`. Flagging is a **soft** signal — it
adds `flagWhy` to the line and can trigger the re-true hint, but does
NOT by itself null out `rollup.calibratedToYd` (contrast with the hard
invalidations below).

### The rollup — `rollup: {word, chip, calibratedToYd, line}`

`word`/`chip.kind` come **only** from `zero.state`:
`'confirmed'`→READY/ready, `'thin'`→THIN/caution, `'adjust'`→ADJUST/caution,
`'stale'`|`'drifted'`→STALE/caution, anything else→NOT CHECKED/problem.

`calibratedToYd` (the PROVEN-TO distance) is `null` **unless**
`zero.state` is `'confirmed'` or `'thin'` — this is the hard-invalidation
gate. When it holds: `trued.toYd` if a truing exists, else the latest
zero event's `distanceYards`, else `rifle.zeroRange`. **A `zero.state`
of `'stale'`, `'drifted'`, or `'adjust'` forces `calibratedToYd` to
`null` regardless of how much truing history exists** — the PROVEN TO
number does not survive a zero-integrity problem even when the drop
data itself hasn't changed. This is the mechanism behind Constitution
§19 ("must not display the maximum distance ever reached... as though
it applies to the rifle in its current state") and Amendment A3
("[PROVEN TO] may rise, hold, fall, or become unavailable").

### `hint` — one line, priority order

`zero.state==='never'` → confirm zero. Else `zero.state==='adjust'` →
dial and re-confirm. Else `tracking.state==='never'` → verify tracking.
Else `mv.state!=='measured'` → chronograph. Else `trued.state==='untrued'`
→ true at distance. Else `zero.state` stale/drifted → quick group. Else
`trued.flagged` → re-true. Else `null` (nothing to say — the rollup is
in good standing and the hint goes silent, per Constitution §24 "if the
answer does not materially improve truth... do not ask").

## `calDaysBetween(aIso, bIso)` → whole days `(b - a)`, or `null` if either fails `Date.parse`

## Golden fixture coverage

`tests/fixtures/golden-calibration-status.json` /
`tests/test-golden-calibration-status.js` — 19 cases. Cases 1–11 are a
single narrative sequence over one rifle (per Amendment A3's explicit
requirement): **rises** (never→100yd on first zero; 100→600yd on MV
truing; 600→900yd on a superseding drag truing), **holds** (adding an
independent MV measurement doesn't move the rollup), **falls/hard
invalidation** (a post-zero scope adjustment nulls `calibratedToYd`
despite 900yd of truing history on record; independently, zero drift
does the same and also flags the truing; independently, a live "adjust"
verdict does the same), **reversal** (a fresh confirming zero after the
invalidating scope adjustment restores READY and the full 900yd —
proving the number is not monotonically decaying), and **soft
invalidation** (a material MV re-measurement flags the truing without
nulling `calibratedToYd`, distinguishing it from the hard-invalidation
cases). Cases 12–16 isolate each element's stale/estimated/mismatch
states independent of the rollup. Cases 17–19 pin `calDaysBetween`.
