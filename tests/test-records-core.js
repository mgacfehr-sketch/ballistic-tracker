/**
 * test-records-core.js — computed Data & Records surfaces (§2.7).
 * Run: node tests/test-records-core.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var R = require('../js/records-core.js');

console.log('\nsuppressorShiftByCan (per rifle + can — §1.3b):');

function sess(canId, elev, wind) {
    return { suppressorId: canId, results: { atzElevationMOA: elev, atzWindageMOA: wind } };
}
function str(canId, avg, n) {
    return { suppressorId: canId, avgFps: avg, shots: new Array(n || 5) };
}

var cans = [{ id: 'nomad', name: 'Nomad 30' }, { id: 'ultra', name: 'Ultra 9' }];
var sessions = [
    sess(null, 0, 0), sess(null, 0.1, -0.1),          // bare baseline
    sess('nomad', -0.55, -0.45), sess('nomad', -0.65, -0.35), // nomad low-left
    sess('ultra', 0.65, 0.05)                          // ultra high
];
var strings = [
    str(null, 2850, 10), str(null, 2846, 10),
    str('nomad', 2824, 10),
    str('ultra', 2810, 10)
];

var shifts = R.suppressorShiftByCan(sessions, strings, cans);
check('one entry per can with data', shifts.length, 2);
var nomad = shifts.filter(function (s) { return s.suppressorId === 'nomad'; })[0];
check('nomad POI elev = can minus bare (−0.65)', nomad.poi.elevMOA, -0.65);
check('nomad POI wind (−0.35)', nomad.poi.windMOA, -0.35);
check('nomad velocity delta (−24 fps)', nomad.velocityDelta, -24);
var ultra = shifts.filter(function (s) { return s.suppressorId === 'ultra'; })[0];
check('ultra tracked separately (+0.6 elev)', ultra.poi.elevMOA, 0.6);
check('ultra velocity delta (−38 fps)', ultra.velocityDelta, -38);
check('no bare baseline → nothing honest to report',
    R.suppressorShiftByCan([sess('nomad', 1, 0)], [str('nomad', 2800, 5)], cans).length, 0);
check('can with zero tagged data omitted',
    R.suppressorShiftByCan(sessions.slice(0, 3), strings.slice(0, 3), cans).length, 1);
check('sessions without results ignored',
    R.suppressorShiftByCan([{ suppressorId: null }, sess(null, 0, 0), sess('nomad', -0.5, 0)], [], cans)[0].poi.elevMOA, -0.5);

console.log('\nsuppressorShiftLine:');
check('reads like the contract example', R.suppressorShiftLine(nomad), 'with Nomad 30: 0.65 low · 0.35 L · −24 fps');
check('tiny shift reads honest', R.suppressorShiftLine({ name: 'X', poi: { elevMOA: 0.02, windMOA: 0 }, velocityDelta: 2 }),
    'with X: no meaningful shift');

console.log('\ncsvEncode (RFC-4180):');
var rows = [
    { name: 'TB 6.5 PRC', caliber: '6.5 PRC', notes: 'says "fast", uses, commas' },
    { name: 'Line\nBreak', caliber: null, notes: undefined }
];
var csv = R.csvEncode(rows, ['name', 'caliber', 'notes']);
var lines = csv.split('\r\n');
check('header row first', lines[0], 'name,caliber,notes');
check('quotes escaped by doubling', lines[1].indexOf('"says ""fast"", uses, commas"') !== -1, true);
check('null/undefined → empty cells', lines[2].slice(-3), '",,');
check('embedded newline stays quoted (row spans lines)', csv.indexOf('"Line\nBreak"') !== -1, true);
check('columns inferred when omitted', R.csvEncode([{ a: 1, b: 2 }]).split('\r\n')[0], 'a,b');
check('objects serialize as JSON cells', R.csvEncode([{ w: { clock: 2, mph: 8 } }]).indexOf('""clock""') !== -1, true);
check('empty input → header only', R.csvEncode([], ['a']).split('\r\n').length, 1);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
