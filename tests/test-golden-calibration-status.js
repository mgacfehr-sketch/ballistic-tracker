/**
 * test-golden-calibration-status.js — Gate 0 golden fixture suite for
 * js/calibration-status.js.
 *
 * Amendment 1 A3: "calibration-status.js's fixtures ARE the PROVEN TO
 * contract... whose contract MUST be frozen with golden test vectors
 * (scope, evidence minimums, invalidation, reversal) before any refactor
 * touches its inputs." This suite is that freeze: a narrative sequence
 * over one rifle's history pinning rises, holds, falls/invalidation, and
 * reversal exactly, plus isolated element-state cases and the pure
 * calDaysBetween helper.
 *
 * Run: node tests/test-golden-calibration-status.js
 */

var fs = require('fs');
var path = require('path');
var C = require('../js/calibration-status.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-calibration-status.json');
var fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

function resolve(value) {
    if (typeof value === 'string' && value.charAt(0) === '$') {
        return JSON.parse(JSON.stringify(fixture.shared[value.slice(1)]));
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

console.log('\nGolden fixtures — js/calibration-status.js (the PROVEN TO contract, A3):');

fixture.cases.forEach(function (c) {
    var input = resolve(c.input);
    var expect = resolve(c.expect);
    var actual;
    try {
        actual = C.deriveCalibrationStatus(input);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\ncalDaysBetween:');
fixture.calDaysBetweenCases.forEach(function (c) {
    var actual = C.calDaysBetween(c.args[0], c.args[1]);
    check(c.name, actual === c.expect, 'expected ' + c.expect + ', got ' + actual);
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
