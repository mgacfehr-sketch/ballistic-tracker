/**
 * test-golden-garmin-import.js — Gate 0 golden fixture suite for
 * js/garmin-import.js.
 *
 * Complements tests/test-garmin-import.js (per-field checks with a small
 * tolerance against the real ShotView sample) with exact, deep-equality
 * snapshots: every pure helper in isolation, plus full session objects
 * (including `warnings` and `reported`, which the existing suite doesn't
 * cross-check together) for the real sample data and several edge cases.
 *
 * Run: node tests/test-golden-garmin-import.js
 */

var fs = require('fs');
var path = require('path');
var G = require('../js/garmin-import.js');

var FIXTURES = path.join(__dirname, 'fixtures');
var FIXTURE_PATH = path.join(FIXTURES, 'golden-garmin-import.json');
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

// Real sample data, loaded once (not duplicated into the JSON fixture).
var shotviewSheetsData = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'shotview-sheets.json'), 'utf8'));
var shotviewCsvText = fs.readFileSync(path.join(FIXTURES, 'shotview-single.csv'), 'utf8');
var shiftedHeaderRows = [[], [], ['junk'], shotviewSheetsData.sheets[0].rows[1]]
    .concat(shotviewSheetsData.sheets[0].rows.slice(2));
var mixedSheets = [{ name: 'junk', rows: [['a', 'b'], ['1', '2']] }, shotviewSheetsData.sheets[0]];

function resolveArg(value) {
    if (value === '@shotview-sheets') return shotviewSheetsData.sheets;
    if (value === '@shotview-csv') return shotviewCsvText;
    if (value === '@shifted-header') return shiftedHeaderRows;
    if (value === '@mixed-sheets') return mixedSheets;
    return value;
}

console.log('\nGolden fixtures — js/garmin-import.js: pure helpers');

// JSON cannot express `undefined` as a literal, so this one case is
// hardcoded here rather than in the fixture file.
check('cleanCellText: undefined -> empty string', G.cleanCellText(undefined) === '');

fixture.pureFunctionCases.forEach(function (c) {
    var args = c.args;
    var actual;
    try {
        actual = G[c.fn].apply(G, args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nGolden fixtures — js/garmin-import.js: full session snapshots');
fixture.sessionCases.forEach(function (c) {
    var args = c.args.map(resolveArg);
    var actual;
    try {
        actual = G[c.fn].apply(G, args);
    } catch (e) {
        check(c.name, false, 'threw unexpectedly: ' + e.message);
        return;
    }
    if (typeof c.pick === 'number') actual = actual[c.pick];
    var ok = deepEqual(actual, c.expect);
    check(c.name, ok, ok ? undefined : ('expected ' + JSON.stringify(c.expect) + ', got ' + JSON.stringify(actual)));
});

console.log('\nGolden fixtures — js/garmin-import.js: rejection paths');
fixture.throwCases.forEach(function (c) {
    var args = c.args.map(resolveArg);
    var threw = false, message = '';
    try { G[c.fn].apply(G, args); }
    catch (e) { threw = true; message = e.message; }
    check(c.name, threw && message.indexOf(c.throws) !== -1,
        threw ? ('threw "' + message + '", expected to contain "' + c.throws + '"') : 'did not throw');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
