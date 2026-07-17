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

// ── Duplicate-import keys ──────────────────────────────────────
console.log('\nstringDedupKey:');

// THE bug that broke the guard: same instant, two serializations —
// JS toISOString (Z) vs PostgREST timestamptz (+00:00 offset)
check('Z and +00:00 forms of the same instant match',
    V.stringDedupKey('Sheet1', '2026-06-26T21:07:00.000Z'),
    V.stringDedupKey('Sheet1', '2026-06-26T21:07:00+00:00'));
check('non-UTC offset of the same instant matches too',
    V.stringDedupKey('Sheet1', '2026-06-26T21:07:00.000Z'),
    V.stringDedupKey('Sheet1', '2026-06-26T16:07:00-05:00'));
check('different instants differ',
    V.stringDedupKey('Sheet1', '2026-06-26T21:07:00Z') !==
    V.stringDedupKey('Sheet1', '2026-06-26T21:08:00Z'), true);
check('different sheet names differ',
    V.stringDedupKey('Sheet1', '2026-06-26T21:07:00Z') !==
    V.stringDedupKey('Sheet2', '2026-06-26T21:07:00Z'), true);
check('null date → name|', V.stringDedupKey('Sheet1', null), 'Sheet1|');
check('null name + null date', V.stringDedupKey(null, null), '|');
check('unparseable date falls back to raw string',
    V.stringDedupKey('S', 'not-a-date'), 'S|not-a-date');

// ── Velocity fingerprints ──────────────────────────────────────
console.log('\nvelocityFingerprint:');

var seqA = [{ fps: 2691.5 }, { fps: 2800.3 }, { fps: 2769.3 }];
var seqAcopy = [{ fps: 2691.5 }, { fps: 2800.3 }, { fps: 2769.3 }];
var seqOneOff = [{ fps: 2691.5 }, { fps: 2800.4 }, { fps: 2769.3 }];
var seqShorter = [{ fps: 2691.5 }, { fps: 2800.3 }];
var seqReversed = [{ fps: 2769.3 }, { fps: 2800.3 }, { fps: 2691.5 }];

check('identical sequences match',
    V.velocityFingerprint(seqA), V.velocityFingerprint(seqAcopy));
check('one differing value = no match',
    V.velocityFingerprint(seqA) !== V.velocityFingerprint(seqOneOff), true);
check('different length = no match',
    V.velocityFingerprint(seqA) !== V.velocityFingerprint(seqShorter), true);
check('order matters (reversed = no match)',
    V.velocityFingerprint(seqA) !== V.velocityFingerprint(seqReversed), true);
check('float noise canonicalized to 0.1 fps',
    V.velocityFingerprint([{ fps: 2691.5 }]), V.velocityFingerprint([{ fps: 2691.5000001 }]));
check('plain number arrays accepted',
    V.velocityFingerprint([2691.5, 2800.3]), V.velocityFingerprint([{ fps: 2691.5 }, { fps: 2800.3 }]));
check('empty → null (no identity)', V.velocityFingerprint([]), null);
check('null → null', V.velocityFingerprint(null), null);
check('two empties never match each other',
    V.velocityFingerprint([]) === V.velocityFingerprint([]) &&
    V.velocityFingerprint([]) === null, true);

// ── Round-count assignment (AFTER semantics) ──────────────────
console.log('\nassignRoundCounts:');

function fakeShots(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push({ shot: i + 1, fps: 2800 });
    return a;
}
var rcSessions = [{ shots: fakeShots(7) }, { shots: fakeShots(11) }, { shots: fakeShots(8) }];

check('fresh barrel, 7/11/8 → 7/18/26 (owner-specified case)',
    V.assignRoundCounts(0, rcSessions).join(','), '7,18,26');
check('base 100 → 107/118/126',
    V.assignRoundCounts(100, rcSessions).join(','), '107,118,126');
check('unknown base → all null, never guessed',
    V.assignRoundCounts(null, rcSessions).every(function (v) { return v === null; }), true);
check('unknown base keeps one slot per session',
    V.assignRoundCounts(null, rcSessions).length, 3);
check('empty sessions → []', V.assignRoundCounts(0, []).length, 0);
check('null sessions → []', V.assignRoundCounts(0, null).length, 0);
check('single string includes its own shots',
    V.assignRoundCounts(50, [{ shots: fakeShots(5) }])[0], 55);
check('sessions without shots arrays count as 0',
    V.assignRoundCounts(10, [{ shots: null }, { shots: fakeShots(3) }]).join(','), '10,13');

// ── Config shift (suppressed vs bare) ─────────────────────────
console.log('\nconfigShift:');

function cfgSession(config, elev, wind) {
    return { config: config, results: { meanElevationMOA: elev, meanWindageMOA: wind } };
}
function cfgString(config, avg, n) {
    return { config: config, assignmentStatus: 'confirmed', avgFps: avg, shots: new Array(n || 5).fill({ fps: avg }) };
}

var cs1 = V.configShift(
    [cfgSession('bare', 0.1, 0.0), cfgSession('suppressed', -0.5, -0.6), cfgSession('suppressed', -0.5, -0.6)],
    [cfgString('bare', 2700), cfgString('suppressed', 2728)]
);
check('POI shift elev (suppressed − bare)', Math.abs(cs1.poi.elevMOA - (-0.6)) < 1e-9, true);
check('POI shift wind', Math.abs(cs1.poi.windMOA - (-0.6)) < 1e-9, true);
check('velocity delta +28 fps', Math.abs(cs1.velocityDelta - 28) < 1e-9, true);

check('one config only → null', V.configShift([cfgSession('bare', 0, 0)], [cfgString('bare', 2700)]), null);
var cs2 = V.configShift(
    [cfgSession('bare', 0, 0), cfgSession('suppressed', -0.3, 0.2)],
    [cfgString('bare', 2700)] // no suppressed strings
);
check('POI measurable without velocity → velocityDelta null', cs2.velocityDelta, null);
check('…but POI present', !!cs2.poi, true);
check('unconfirmed strings ignored', V.configShift([], [
    { config: 'bare', assignmentStatus: 'suggested', avgFps: 2700, shots: [] },
    { config: 'suppressed', assignmentStatus: 'suggested', avgFps: 2730, shots: [] }
]), null);

// ── Lot drift ─────────────────────────────────────────────────
console.log('\nlotDrift:');

function lotString(loadId, lot, avg, date) {
    return { loadId: loadId, lotNumber: lot, avgFps: avg, date: date,
        assignmentStatus: 'confirmed', shots: new Array(10).fill({ fps: avg }) };
}

var ld1 = V.lotDrift([
    lotString('A', 'LOT-1', 2700, '2026-06-01'),
    lotString('A', 'LOT-2', 2745, '2026-07-01')
]);
check('45 fps drift → one alert', ld1.length, 1);
check('alert names the new lot', ld1[0].newLot, 'LOT-2');
check('alert delta +45', ld1[0].deltaFps, 45);

check('drift under threshold → silent', V.lotDrift([
    lotString('A', 'LOT-1', 2700, '2026-06-01'),
    lotString('A', 'LOT-2', 2720, '2026-07-01')
]).length, 0);
check('single lot → silent', V.lotDrift([lotString('A', 'LOT-1', 2700, '2026-06-01')]).length, 0);
check('strings without lot numbers ignored', V.lotDrift([
    lotString('A', 'LOT-1', 2700, '2026-06-01'),
    { loadId: 'A', lotNumber: null, avgFps: 2760, date: '2026-07-01', assignmentStatus: 'confirmed', shots: [] }
]).length, 0);
check('newest-by-date wins as the "new" lot', V.lotDrift([
    lotString('A', 'LOT-9', 2745, '2026-05-01'),
    lotString('A', 'LOT-2', 2700, '2026-07-01')
])[0].newLot, 'LOT-2');
check('slower drift reported negative', V.lotDrift([
    lotString('A', 'L1', 2745, '2026-06-01'),
    lotString('A', 'L2', 2700, '2026-07-01')
])[0].deltaFps, -45);

// ── Per-rifle aggregation ─────────────────────────────────────
console.log('\naggregateRifle:');

function makeSession(id, loadId, nShots, moa, dist) {
    var impacts = [];
    for (var i = 0; i < nShots; i++) impacts.push({ id: 'i' + i, x: i, y: i });
    return {
        id: id, loadId: loadId, distanceYards: dist || 100, date: '2026-07-01',
        impacts: impacts,
        results: { groupSizeMOA: moa, groupSizeInches: moa * 1.047 }
    };
}
function makeString(loadId, status, fpsArr) {
    return {
        id: 'vs-' + loadId + '-' + status + '-' + fpsArr[0],
        loadId: loadId, assignmentStatus: status,
        avgFps: null, sdFps: null,
        shots: fpsArr.map(function (v, i) { return { shot: i + 1, fps: v }; })
    };
}

var loadA = { id: 'A', name: 'Load A' };
var loadB = { id: 'B', name: 'Load B' };
var loadC = { id: 'C', name: 'Load C (velocity only)' };

var agg = V.aggregateRifle({
    loads: [loadA, loadB, loadC],
    sessions: [
        makeSession('s1', 'A', 5, 0.8),
        makeSession('s2', 'B', 5, 0.6),
        makeSession('s3', 'B', 3, 0.4),   // tiny 3-shot group must NOT outrank 5-shot
        makeSession('s4', 'A', 2, 0.1)    // 2 shots — not an eligible group at all
    ],
    strings: [
        makeString('A', 'confirmed', [2800, 2810, 2790]),
        makeString('B', 'confirmed', [2900, 2910, 2890, 2905, 2895]),
        makeString('C', 'confirmed', [3000, 3001, 2999]),
        makeString('A', 'suggested', [2805, 2815]),
        { id: 'vs-x', loadId: null, assignmentStatus: 'unassigned', avgFps: 2700, shots: [{ shot: 1, fps: 2700 }] },
        { id: 'vs-y', loadId: null, assignmentStatus: 'ambiguous', avgFps: 2805, shots: [{ shot: 1, fps: 2805 }] }
    ]
});

check('recommended load = B (best 5-shot group wins)', agg.recommendedLoadId, 'B');
check('best group session = s2 (5-shot 0.6 beats 3-shot 0.4)', agg.bestGroup.sessionId, 's2');
check('best group shots', agg.bestGroup.shots, 5);
check('best group MOA', agg.bestGroup.moa, 0.6);
var rowA = agg.loads.filter(function (r) { return r.loadId === 'A'; })[0];
var rowB = agg.loads.filter(function (r) { return r.loadId === 'B'; })[0];
var rowC = agg.loads.filter(function (r) { return r.loadId === 'C'; })[0];
check('load A: only confirmed strings counted', rowA.stringCount, 1);
check('load A: shots from confirmed strings only', rowA.shotCount, 3);
check('load A: stats avg', rowA.stats.avg, 2800);
check('load A: 2-shot session still listed in sessionCount', rowA.sessionCount, 2);
check('load A: bestGroup ignores 2-shot session', rowA.bestGroupMOA, 0.8);
check('load B: bestGroup prefers 5-shot (0.6) over 3-shot (0.4)', rowB.bestGroupMOA, 0.6);
check('load C (no groups) has stats but no bestGroup', rowC.bestGroupMOA, null);
check('pending: unassigned', agg.pendingStrings.unassigned, 1);
check('pending: suggested', agg.pendingStrings.suggested, 1);
check('pending: ambiguous', agg.pendingStrings.ambiguous, 1);
check('pending: confirmed', agg.pendingStrings.confirmed, 3);

// Tie-break: equal groups → lower SD wins
var aggTie = V.aggregateRifle({
    loads: [loadA, loadB],
    sessions: [makeSession('t1', 'A', 5, 0.7), makeSession('t2', 'B', 5, 0.7)],
    strings: [
        makeString('A', 'confirmed', [2800, 2830, 2770]),          // SD ~24.5
        makeString('B', 'confirmed', [2900, 2905, 2895])           // SD ~4.1
    ]
});
check('tie on group MOA → lower velocity SD recommended', aggTie.recommendedLoadId, 'B');

// No group data at all → no recommendation (never guess for the certificate)
var aggNone = V.aggregateRifle({
    loads: [loadC],
    sessions: [makeSession('n1', 'C', 2, 0.2)],
    strings: [makeString('C', 'confirmed', [3000, 3001])]
});
check('no eligible groups → recommendedLoadId null', aggNone.recommendedLoadId, null);
check('no eligible groups → bestGroup null', aggNone.bestGroup, null);
check('empty input safe', V.aggregateRifle({}).loads.length, 0);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
