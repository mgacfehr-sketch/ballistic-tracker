/**
 * test-golden-simple-true.js — Gate 0 golden fixture suite for
 * js/simple-true.js (the one-observation "where did it hit?" path,
 * Contract v2.5 §2.3).
 *
 * Complements tests/test-simple-true.js (round-trip CORRECTNESS) by
 * pinning exact recorded outputs — payoff wording, confidence, ledger
 * shape, and the honesty-guard null cases — so future drift is caught
 * even when the recovered ballistic value stays numerically close.
 *
 * Run: node tests/test-golden-simple-true.js
 */

var fs = require('fs');
var path = require('path');
var ST = require('../js/simple-true.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-simple-true.json');
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

console.log('\nGolden fixtures — js/simple-true.js:');

console.log('\nUnit conversion:');
fixture.unitConversionCases.forEach(function (c) {
    var args = c.args.map(resolve);
    var actual = ST[c.fn].apply(ST, args);
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nsimpleComeUpAt:');
fixture.comeUpAtCases.forEach(function (c) {
    var args = c.args.map(resolve);
    var actual = ST.simpleComeUpAt.apply(ST, args);
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nsimpleTrueObservation + simpleTruePayoffCopy:');
fixture.observationCases.forEach(function (c) {
    var input = resolve(c.input);
    var expect = resolve(c.expect);
    var actual;
    try {
        actual = ST.simpleTrueObservation(input);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(expect) + ', got ' + JSON.stringify(actual)));

    if ('expectPayoffCopy' in c) {
        var copy = actual ? ST.simpleTruePayoffCopy(actual.payoff) : null;
        check(c.name + ' — payoff copy', copy === c.expectPayoffCopy,
            copy === c.expectPayoffCopy ? undefined : ('expected ' + JSON.stringify(c.expectPayoffCopy) + ', got ' + JSON.stringify(copy)));
    }
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
