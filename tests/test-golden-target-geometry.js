/**
 * test-golden-target-geometry.js — Gate 0 golden fixture for
 * js/target-geometry.js.
 *
 * Distinct from tests/test-target-geometry.js (which checks geometric
 * PROPERTIES hold — paper fit, staple-tear safety, marker placement).
 * This suite checks the exported constant object hasn't drifted at all:
 * tests/fixtures/golden-target-geometry.json records the exact object
 * this module exports today. A future edit that changes any value —
 * even one that still happens to satisfy the geometric properties —
 * will fail this test. Legitimate changes update the fixture in the
 * same commit with the reason recorded.
 *
 * Run: node tests/test-golden-target-geometry.js
 */

var fs = require('fs');
var path = require('path');
var G = require('../js/target-geometry.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-target-geometry.json');
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

console.log('\nGolden fixture — js/target-geometry.js:');

check('top-level key count matches (no added/removed constants)',
    Object.keys(G).length === Object.keys(fixture.expect).length,
    'expected ' + Object.keys(fixture.expect).length + ' keys, got ' + Object.keys(G).length);

Object.keys(fixture.expect).forEach(function (key) {
    var ok = deepEqual(G[key], fixture.expect[key]);
    check('TARGET_GEOMETRY.' + key + ' matches locked value', ok,
        ok ? undefined : ('expected ' + JSON.stringify(fixture.expect[key]) + ', got ' + JSON.stringify(G[key])));
});

check('whole-object exact match (belt and suspenders)', deepEqual(G, fixture.expect),
    deepEqual(G, fixture.expect) ? undefined : ('expected ' + JSON.stringify(fixture.expect) + ', got ' + JSON.stringify(G)));

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
