# Interface contract — `js/target-geometry.js`

Gate 0 artifact. Documents the public surface of the protected engine as
it exists today (locked by `tests/fixtures/protected-engine-hashes.json`
and behaviorally pinned by `tests/test-golden-target-geometry.js`). This
is a description of reality, not a design proposal — any future change
to this surface is an engine change and must update the hash lock, the
golden fixture, and this document in the same commit.

**This is THE calibration geometry law (v2.4 Part 3).** Per the file's
own header comment: *"ONE shared constant set: js/aruco-calibration.js
(the homography warp) and js/target-pdf.js (the printed artwork) BOTH
derive from this object, so the printed target and the detector can
never drift apart. Change geometry HERE and nowhere else."*

Unlike the other seven protected engines, this file exports no
functions — it is pure data: one constant object, `TARGET_GEOMETRY`,
plus two derived spacing values computed once at module-load time.
There is nothing to call, only values to read.

**Coordinate system:** inches, in "grid space" — the 6.0" central aim
field's top-left corner is `(0,0)`, x increases right, y increases down.

## Exported shape — `TARGET_GEOMETRY`

| Key | Value | Meaning |
|---|---|---|
| `GRID_INCHES` | `6` | the central aim field (bold outline), inches square |
| `MARKER_SIZE` | `0.6` | printed ArUco marker square, inches |
| `QUIET_ZONE` | `0.22` | solid-white margin required around each marker — "non-negotiable" per the source comment |
| `MARKER_CENTERS.TL` | `{x: -0.5, y: 1}` | top-left marker center |
| `MARKER_CENTERS.TR` | `{x: 6.5, y: 1}` | top-right marker center |
| `MARKER_CENTERS.BL` | `{x: -0.5, y: 5}` | bottom-left marker center |
| `MARKER_CENTERS.BR` | `{x: 6.5, y: 5}` | bottom-right marker center |
| `SPAN_X` | `7` | derived: `MARKER_CENTERS.TR.x - MARKER_CENTERS.TL.x` — horizontal center-to-center spacing |
| `SPAN_Y` | `4` | derived: `MARKER_CENTERS.BL.y - MARKER_CENTERS.TL.y` — vertical center-to-center spacing |

All four markers sit fully in the side margins (outside the 6.0" aim
field horizontally, `MARKER_CENTERS.*.x ± MARKER_SIZE/2` never
overlapping `[0, GRID_INCHES]`), vertically centered within the aim
field's band, and — per `tests/test-target-geometry.js`'s paper-fit
checks — ≥1" from both Letter and A4 paper corners (staple-tear safe)
with the full quiet zone on-page at the `target-pdf.js` layout origin
(`g0y = 2.7`). Those geometric *properties* are covered by the existing
test; this contract's golden fixture instead locks the literal
*values*, so a hand-edit that happens to preserve the properties (e.g.
nudging `QUIET_ZONE` from `0.22` to `0.25`) still fails a test.

## Consumers — shared-global coupling (same pattern as `ballistic-solver.js`)

Neither `js/aruco-calibration.js` nor `js/target-pdf.js` `require()` or
import this module. Both instead check for a bare global:

```js
var G = (typeof TARGET_GEOMETRY !== 'undefined') ? TARGET_GEOMETRY : null;
if (!G) throw new Error('target-geometry.js must load before ...');
```

This resolves only because `index.html` loads
`<script src="js/target-geometry.js">` (line 390) before
`aruco-calibration.js` (line 391) and `target-pdf.js` (line 440) as
plain, non-module `<script>` tags sharing one global scope — the same
architectural pattern documented for `ballistic-solver.js`'s
`round4`/`inchesToMOA` dependency on `calculations.js`
(`docs/canon/interface-contracts/ballistic-solver.md`). It is not a
defect specific to this file; it is how every pure-math file in this
codebase is wired together in the browser. Both consumers also fall
back to `global.TARGET_GEOMETRY` for Node contexts, which is why
`tests/test-target-geometry.js` and this fixture's test can
`require()` the module directly without any shimming.

## Golden fixture coverage

`tests/fixtures/golden-target-geometry.json` /
`tests/test-golden-target-geometry.js` — a full snapshot of the
exported `TARGET_GEOMETRY` object (all 6 top-level keys, including the
nested `MARKER_CENTERS` sub-object and both derived spans), captured by
running the module rather than hand-transcribing the source, plus a
top-level key-count check so an added or removed constant is caught
even before its value is compared.
