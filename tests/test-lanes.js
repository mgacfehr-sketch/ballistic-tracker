/**
 * test-lanes.js — lane resolution + the copy map (v2.5 Part 1).
 * Run: node tests/test-lanes.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var L = require('../js/lanes.js');
var Core = L.LanesCore;
var MAP = L.LANE_COPY;

console.log('\nThe copy map (one place, two vocabularies):');
check('mv simple = Roy words', Core.copy(MAP, 'mv', false), 'bullet speed');
check('mv detailed = precise', Core.copy(MAP, 'mv', true), 'muzzle velocity');
check('dope simple', Core.copy(MAP, 'dope', false), 'drop chart');
check('dope detailed', Core.copy(MAP, 'dope', true), 'DOPE card');
check('impact question simple', Core.copy(MAP, 'impactOffset', false), 'where did it hit?');
check('profile simple', Core.copy(MAP, 'profile', false), 'your rifle\'s numbers');
check('verified simple = checked', Core.copy(MAP, 'verified', false), 'checked');
check('unknown key returns itself (loud in QA)', Core.copy(MAP, 'nope', false), 'nope');
check('every entry has both lanes', Object.keys(MAP).every(function (k) {
    return typeof MAP[k].simple === 'string' && typeof MAP[k].detailed === 'string';
}), true);
check('title-case helper', Core.title('bullet speed'), 'Bullet speed');

console.log('\nLane resolution (default Simple; one-time inference):');
check('no setting, no strings → simple', Core.resolve(null, false).detailed, false);
check('no setting, no strings → no persist', Core.resolve(null, false).persist, false);
check('no setting + full strings → detailed (inferred)', Core.resolve(null, true).detailed, true);
check('inference persists exactly once', Core.resolve(null, true).persist, true);
check('explicit OFF wins over strings', Core.resolve({ v: 1, detailed: false }, true).detailed, false);
check('explicit OFF never re-persists', Core.resolve({ v: 1, detailed: false }, true).persist, false);
check('explicit ON honored', Core.resolve({ v: 1, detailed: true }, false).detailed, true);
check('garbage setting → fresh default', Core.resolve({ v: 9 }, false).detailed, false);
check('serialize shape', JSON.stringify(Core.serialize(true, 'inferred')),
    '{"v":1,"detailed":true,"source":"inferred"}');
check('serialize defaults to user source', Core.serialize(false).source, 'user');

console.log('\nroyify (§1.4 — Roy\'s words on display, ordered + case-kept):');
check('muzzle velocity → bullet speed', Core.royify('Measure your muzzle velocity'),
    'Measure your bullet speed');
check('leading capital kept', Core.royify('Muzzle velocity beats guessing'),
    'Bullet speed beats guessing');
check('MV → speed (word-bounded)', Core.royify('MV not measured'), 'speed not measured');
check('DOPE card → drop chart', Core.royify('Print a DOPE card'), 'Print a drop chart');
check('chrono file → speed meter file', Core.royify('Type in an average, or import a chrono file.'),
    'Type in an average, or import a speed meter file.');
check('plain chrono → speed meter', Core.royify('chrono data'), 'speed meter data');
check('untouched words pass through', Core.royify('Confirm your zero'), 'Confirm your zero');
check('null-safe', Core.royify(null), '');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
