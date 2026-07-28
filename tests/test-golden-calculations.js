/**
 * test-golden-calculations.js — Gate 0 golden fixture suite for
 * js/calculations.js.
 *
 * Distinct from tests/test-calculations.js (which checks the math is
 * CORRECT against known physics). This suite checks the engine's
 * BEHAVIOR hasn't drifted: every case in
 * tests/fixtures/golden-calculations.json records an exact recorded
 * output for a fixed input, captured from the engine as it exists today.
 * A future change to calculations.js — intentional or not — that alters
 * any of these outputs will fail this test. Legitimate changes update the
 * fixture in the same commit with the reason recorded.
 *
 * Run: node tests/test-golden-calculations.js
 */

var fs = require('fs');
var path = require('path');
var calc = require('../js/calculations.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-calculations.json');
var fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

// Resolve "$name" or "$name.index" references against fixture.shared,
// recursively, through arrays and plain objects.
function resolve(value) {
    if (typeof value === 'string' && value.charAt(0) === '$') {
        var parts = value.slice(1).split('.');
        var cur = fixture.shared[parts[0]];
        for (var i = 1; i < parts.length; i++) cur = cur[parts[i]];
        return cur;
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') {
        var out = {};
        Object.keys(value).forEach(function (k) { out[k] = resolve(value[k]); });
        return out;
    }
    return value;
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

console.log('\nGolden fixtures — js/calculations.js:');

fixture.cases.forEach(function (c) {
    var args = c.args.map(resolve);
    if ('throws' in c) {
        var threw = false, message = '';
        try { calc[c.fn].apply(calc, args); }
        catch (e) { threw = true; message = e.message; }
        check(c.name, threw && message.indexOf(c.throws) !== -1,
            threw ? ('threw "' + message + '", expected to contain "' + c.throws + '"') : 'did not throw');
        return;
    }
    var actual;
    try {
        actual = calc[c.fn].apply(calc, args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
