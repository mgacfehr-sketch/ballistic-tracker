/**
 * test-golden-velocity-stats.js — Gate 0 golden fixture suite for
 * js/velocity-stats.js.
 *
 * Distinct from tests/test-velocity-stats.js (which checks the math is
 * CORRECT against known values and real Garmin ShotView exports). This
 * suite pins exact recorded outputs for fixed inputs across every
 * exported function, so future behavioral drift is caught even where
 * the existing test's assertions don't happen to cover the exact shape.
 *
 * Run: node tests/test-golden-velocity-stats.js
 */

var fs = require('fs');
var path = require('path');
var V = require('../js/velocity-stats.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-velocity-stats.json');
var fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;
    if (typeof a !== 'object') return false;
    var ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(function (k) { return deepEqual(a[k], b[k]); });
}

console.log('\nGolden fixtures — js/velocity-stats.js:');

fixture.cases.forEach(function (c) {
    var actual;
    try {
        actual = V[c.fn].apply(V, c.args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
