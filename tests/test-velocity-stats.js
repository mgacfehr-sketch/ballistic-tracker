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

// ── Time-of-day parsing ───────────────────────────────────────
console.log('\nTime-of-day parsing:');
check('3:09:32 PM', V.parseTimeOfDay('3:09:32 PM'), 15 * 3600 + 9 * 60 + 32);
check('12:00:00 AM = midnight', V.parseTimeOfDay('12:00:00 AM'), 0);
check('12:30:00 PM = 12h30', V.parseTimeOfDay('12:30:00 PM'), 12 * 3600 + 30 * 60);
check('24h format 14:05', V.parseTimeOfDay('14:05'), 14 * 3600 + 5 * 60);
check('garbage → null', V.parseTimeOfDay('yesterday'), null);
check('null → null', V.parseTimeOfDay(null), null);

// ── Time-gap splitting ────────────────────────────────────────
console.log('\nTime-gap splitting:');
function shotAt(n, fps, h, m) {
    return { shot: n, fps: fps, time: h + ':' + (m < 10 ? '0' : '') + m + ':00 PM' };
}
// 20 shots with two 45-minute gaps → 3 strings (plan test case)
var gapped = [];
var idx = 1;
for (var a = 0; a < 7; a++) gapped.push(shotAt(idx++, 2800, 1, a));      // 1:00–1:06 PM
for (var b = 0; b < 7; b++) gapped.push(shotAt(idx++, 2805, 1, 52 + b)); // 1:52–1:58 PM (45-min gap)
for (var c = 0; c < 6; c++) gapped.push(shotAt(idx++, 2810, 2, 44 + c)); // 2:44–2:49 PM (45-min gap)
var groups = V.splitByTimeGap(gapped, 30);
check('two 45-min gaps → 3 strings', groups.length, 3);
check('group sizes 7/7/6', groups.map(function (g) { return g.length; }).join(','), '7,7,6');
check('order preserved', groups[2][5].shot, 20);

check('no gaps → 1 string', V.splitByTimeGap(gapped.slice(0, 7), 30).length, 1);
var missingTime = [{ shot: 1, fps: 2800, time: '1:00:00 PM' }, { shot: 2, fps: 2801, time: null }];
check('unparseable time → single string, never guesses', V.splitByTimeGap(missingTime, 30).length, 1);
check('empty → []', V.splitByTimeGap([], 30).length, 0);

// ── Velocity clustering (plan test cases) ─────────────────────
console.log('\nVelocity clustering:');
function str(avg, sd, n, tag) {
    return { avgFps: avg, sdFps: sd, n: n, tag: tag };
}

// (a) clearly different ammo → 2 clusters, nothing ambiguous
var rA = V.clusterStringsByVelocity([str(2650, 12, 10, 'slow'), str(2820, 12, 10, 'fast')]);
check('(a) 2650 vs 2820 → 2 clusters', rA.clusters.length, 2);
check('(a) nothing ambiguous', rA.ambiguous.length, 0);

// (b) same ammo, normal drift → 1 cluster
var rB = V.clusterStringsByVelocity([str(2800, 10, 10, 'x'), str(2810, 10, 10, 'y')]);
check('(b) 2800 & 2810 → 1 cluster', rB.clusters.length, 1);
check('(b) nothing ambiguous', rB.ambiguous.length, 0);
check('(b) weighted mean', rB.clusters[0].meanFps, 2805);

// (c) in-between string → flagged ambiguous, NOT force-merged into one cluster
var rC = V.clusterStringsByVelocity([str(2790, 8, 10, 'low'), str(2805, 8, 10, 'mid'), str(2820, 8, 10, 'high')]);
check('(c) not force-merged into one cluster', rC.clusters.length >= 2, true);
var midFlagged = rC.ambiguous.some(function (x) { return x.string.tag === 'mid'; });
check('(c) the 2805 string is flagged ambiguous', midFlagged, true);

// Real fixture: session 1 (2743.4) is different ammo from sessions 2+3 (2977.0 / 2959.3)
var realStrings = sessions.map(function (s, i) {
    var st = V.velocityStats(s.shots);
    return { avgFps: st.avg, sdFps: st.sd, n: st.n, tag: 'session' + (i + 1) };
});
var rReal = V.clusterStringsByVelocity(realStrings);
check('real fixture → 2 ammo clusters', rReal.clusters.length, 2);
check('real fixture → nothing ambiguous', rReal.ambiguous.length, 0);
var loneCluster = rReal.clusters.filter(function (c) { return c.members.length === 1; })[0];
check('session 1 (2743 avg) is its own cluster', loneCluster.members[0].tag, 'session1');

// Degenerate inputs
console.log('\nClustering edge cases:');
check('empty input → no clusters', V.clusterStringsByVelocity([]).clusters.length, 0);
check('null input → no clusters', V.clusterStringsByVelocity(null).clusters.length, 0);
var rOne = V.clusterStringsByVelocity([str(2800, 10, 5, 'solo')]);
check('single string → 1 cluster', rOne.clusters.length, 1);
check('strings without avgFps excluded', V.clusterStringsByVelocity([{ sdFps: 5 }, str(2800, 10, 5)]).clusters.length, 1);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
