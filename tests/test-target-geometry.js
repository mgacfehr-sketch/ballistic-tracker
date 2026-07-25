/**
 * test-target-geometry.js — THE calibration geometry law (v2.4 Part 3).
 * Locks the shared constants both aruco-calibration.js and
 * target-pdf.js derive from, plus the paper-fit / staple-safety math.
 * Run: node tests/test-target-geometry.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = typeof expected === 'number' && typeof actual === 'number'
        ? Math.abs(actual - expected) < 1e-9
        : actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var G = require('../js/target-geometry.js');

console.log('\nThe law:');
check('aim field is 6.0 in', G.GRID_INCHES, 6.0);
check('marker size unchanged (0.6 in)', G.MARKER_SIZE, 0.6);
check('quiet zone present (≥0.2 in)', G.QUIET_ZONE >= 0.2, true);
check('horizontal center spacing 7.00 in', G.SPAN_X, 7.0);
check('vertical center spacing 4.00 in', G.SPAN_Y, 4.0);

console.log('\nMarker relocation (owner-directed, §Part 3):');
check('TL center (-0.5, 1.0)', G.MARKER_CENTERS.TL.x === -0.5 && G.MARKER_CENTERS.TL.y === 1.0, true);
check('TR center (6.5, 1.0)', G.MARKER_CENTERS.TR.x === 6.5 && G.MARKER_CENTERS.TR.y === 1.0, true);
check('BL center (-0.5, 5.0)', G.MARKER_CENTERS.BL.x === -0.5 && G.MARKER_CENTERS.BL.y === 5.0, true);
check('BR center (6.5, 5.0)', G.MARKER_CENTERS.BR.x === 6.5 && G.MARKER_CENTERS.BR.y === 5.0, true);
check('rectangle: TL/TR level', G.MARKER_CENTERS.TL.y, G.MARKER_CENTERS.TR.y);
check('rectangle: TL/BL aligned', G.MARKER_CENTERS.TL.x, G.MARKER_CENTERS.BL.x);

console.log('\nFully outside the aim field (side margins):');
['TL', 'BL'].forEach(function (k) {
    check(k + ' right edge left of the field', G.MARKER_CENTERS[k].x + G.MARKER_SIZE / 2 <= 0, true);
});
['TR', 'BR'].forEach(function (k) {
    check(k + ' left edge right of the field', G.MARKER_CENTERS[k].x - G.MARKER_SIZE / 2 >= G.GRID_INCHES, true);
});
['TL', 'TR', 'BL', 'BR'].forEach(function (k) {
    var c = G.MARKER_CENTERS[k];
    check(k + ' vertically inside the field band', c.y - G.MARKER_SIZE / 2 > 0 && c.y + G.MARKER_SIZE / 2 < G.GRID_INCHES, true);
});

console.log('\nPaper fit + staple-tear safety (target-pdf layout: g0y=2.7):');
var PAGES = { letter: { w: 8.5, h: 11 }, a4: { w: 8.2677, h: 11.6929 } };
Object.keys(PAGES).forEach(function (fmt) {
    var page = PAGES[fmt];
    var g0x = page.w / 2 - G.GRID_INCHES / 2;
    var g0y = 2.7;
    ['TL', 'TR', 'BL', 'BR'].forEach(function (k) {
        var c = G.MARKER_CENTERS[k];
        var px = g0x + c.x, py = g0y + c.y;
        var half = G.MARKER_SIZE / 2 + G.QUIET_ZONE;
        check(fmt + ' ' + k + ' quiet zone on the paper',
            px - half >= 0 && px + half <= page.w && py - half >= 0 && py + half <= page.h, true);
        // nearest paper corner ≥ 1" away from the marker edge
        var cornerX = px < page.w / 2 ? 0 : page.w;
        var cornerY = py < page.h / 2 ? 0 : page.h;
        var dist = Math.hypot(px - cornerX, py - cornerY) - G.MARKER_SIZE / 2;
        check(fmt + ' ' + k + ' ≥1 in from the paper corner', dist >= 1.0, true);
    });
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
