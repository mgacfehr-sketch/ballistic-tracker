/**
 * test-golden-ballistic-solver.js — Gate 0 golden fixture suite for the
 * pure solver section of js/ballistic-solver.js (interpolateCd through
 * computeTrajectory). The BallisticSolverManager UI class in the same
 * file is DOM-dependent and out of scope here.
 *
 * DISCOVERED COUPLING (see docs/canon/interface-contracts/ballistic-solver.md):
 * computeTrajectory() calls bare `round4(...)` and `inchesToMOA(...)`
 * without importing them. In the browser this works because index.html
 * loads js/calculations.js before js/ballistic-solver.js as plain
 * <script> tags sharing one global scope. Under Node's module system
 * that sharing doesn't happen automatically, so this harness replicates
 * it explicitly by attaching calculations.js's exports to `global`
 * before requiring the solver — the same runtime shape the browser
 * actually provides, not a synthetic substitute.
 *
 * Run: node tests/test-golden-ballistic-solver.js
 */

var fs = require('fs');
var path = require('path');

var calc = require('../js/calculations.js');
global.round4 = calc.round4;
global.inchesToMOA = calc.inchesToMOA;
var solver = require('../js/ballistic-solver.js');

var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden-ballistic-solver.json');
var fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

var speedOfSoundStd = solver.calculateSpeedOfSound(59); // used to resolve "$speedOfSoundStd"

function resolve(value) {
    if (typeof value === 'string' && value.charAt(0) === '$') {
        var name = value.slice(1);
        if (name === 'G1_DRAG_TABLE') return solver.G1_DRAG_TABLE;
        if (name === 'G7_DRAG_TABLE') return solver.G7_DRAG_TABLE;
        if (name === 'speedOfSoundStd') return speedOfSoundStd;
        throw new Error('Unknown fixture reference: ' + value);
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

console.log('\nGolden fixtures — js/ballistic-solver.js (pure solver section):');

fixture.cases.forEach(function (c) {
    var args = c.args.map(resolve);
    var actual;
    try {
        actual = solver[c.fn].apply(solver, args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
