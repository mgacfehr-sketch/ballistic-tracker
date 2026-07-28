/**
 * test-golden-truing-core.js — Gate 0 golden fixture suite for
 * js/truing-core.js, with emphasis on Amendment 1 A1: the Mach-bracket
 * routing doctrine (supersonic error -> MV truing, transonic-window
 * error -> drag/BC truing) is THE sole authority for that choice, and
 * must not silently drift.
 *
 * Run: node tests/test-golden-truing-core.js
 */

var fs = require('fs');
var path = require('path');
var T = require('../js/truing-core.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-truing-core.json');
var fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

function resolve(value) {
    if (typeof value === 'string' && value.charAt(0) === '$') {
        return JSON.parse(JSON.stringify(fixture.shared[value.slice(1)])); // deep copy — cases mutate freely
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

console.log('\nGolden fixtures — js/truing-core.js (Mach-bracket routing doctrine, A1):');

fixture.cases.forEach(function (c) {
    var args = c.args.map(resolve);
    var expect = resolve(c.expect);
    var actual;
    try {
        actual = T[c.fn].apply(T, args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
