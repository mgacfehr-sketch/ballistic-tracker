/**
 * test-velocity-stats.js — Unit tests for pure velocity statistics.
 *
 * Run: node tests/test-velocity-stats.js
 *
 * Cross-validates against Garmin ShotView's own reported summary stats
 * from the real export fixture (population SD convention, ±0.11 fps
 * tolerance because exported shot values are rounded to 0.1 fps).
 */

var fs = require('fs');
var path = require('path');
var V = require('../js/velocity-stats.js');
var G = require('../js/garmin-import.js');

var passed = 0;
var failed = 0;

function check(label, actual, expected, tolerance) {
    var ok;
    if (typeof expected === 'number' && typeof actual === 'number') {
        ok = Math.abs(actual - expected) <= (tolerance || 1e-9);
    } else {
        ok = actual === expected;
    }
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

// ── Hand-computed cases ───────────────────────────────────────
console.log('\nHand-computed stats (population SD):');
var s1 = V.velocityStats([2800, 2810, 2790]);
check('n', s1.n, 3);
check('avg', s1.avg, 2800);
check('ES = max − min', s1.es, 20);
// population SD: sqrt((0² + 10² + 10²)/3) = sqrt(200/3) ≈ 8.16497
check('population SD (NOT sample SD 10)', s1.sd, Math.sqrt(200 / 3), 1e-9);

var s2 = V.velocityStats([{ fps: 3000.5 }, { fps: 3001.5 }]);
check('shot objects accepted: avg', s2.avg, 3001);
check('shot objects accepted: es', s2.es, 1);
check('two-shot population SD', s2.sd, 0.5);

console.log('\nEdge cases:');
var empty = V.velocityStats([]);
check('empty: n', empty.n, 0);
check('empty: avg null', empty.avg, null);
check('empty: sd null', empty.sd, null);
check('empty: es null', empty.es, null);
check('null input: n', V.velocityStats(null).n, 0);

var single = V.velocityStats([2750.3]);
check('single shot: n', single.n, 1);
check('single shot: avg', single.avg, 2750.3);
check('single shot: sd 0', single.sd, 0);
check('single shot: es 0', single.es, 0);

var mixed = V.velocityStats([{ fps: 2800 }, { fps: NaN }, { fps: 2810 }, {}, null]);
check('non-finite/malformed shots ignored: n', mixed.n, 2);
check('non-finite/malformed shots ignored: avg', mixed.avg, 2805);

// ── Cross-check against Garmin's own summary (real fixture) ──
console.log('\nGarmin ShotView cross-validation (real export):');
var FIXTURES = path.join(__dirname, 'fixtures');
var sheetsFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'shotview-sheets.json'), 'utf8'));
var sessions = G.parseShotViewSheets(sheetsFixture.sheets);

sessions.forEach(function (s, i) {
    var stats = V.velocityStats(s.shots);
    check('session ' + (i + 1) + ' n matches shot count', stats.n, s.shots.length);
    check('session ' + (i + 1) + ' avg matches Garmin', stats.avg, s.reported.avg, 0.11);
    check('session ' + (i + 1) + ' SD matches Garmin (population)', stats.sd, s.reported.sd, 0.11);
    check('session ' + (i + 1) + ' ES matches Garmin', stats.es, s.reported.es, 0.11);
});

var csvText = fs.readFileSync(path.join(FIXTURES, 'shotview-single.csv'), 'utf8');
var csvSession = G.parseShotViewCSV(csvText, 'shotview-single.csv');
var csvStats = V.velocityStats(csvSession.shots);
check('CSV avg matches Garmin', csvStats.avg, csvSession.reported.avg, 0.11);
check('CSV SD matches Garmin', csvStats.sd, csvSession.reported.sd, 0.11);
check('CSV ES matches Garmin', csvStats.es, csvSession.reported.es, 0.11);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
