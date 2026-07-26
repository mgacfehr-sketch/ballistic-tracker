/**
 * test-feed-core.js — WHAT'S HAPPENED feed merging (v3.0 view 1).
 * Run: node tests/test-feed-core.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var F = require('../js/feed-core.js');

console.log('\nSteel + correlated correction merge to ONE item:');
var merged = F.buildFeed({
    steelStrings: [{ id: 'st1', sessionDate: '2026-07-25T08:00:00Z', distanceYd: 600, tier: 'full' }],
    truingEvents: [{
        id: 'te1', appliedAt: '2026-07-25T08:02:00Z', mode: 'simple', correctionType: 'mv',
        oldValue: 2960, newValue: 2923, far: { rangeYds: 600 },
        inputs: { payoff: { rangeYds: 600, oldDial: 4.0, newDial: 3.8, units: 'MOA', moved: true } }
    }]
});
check('one merged item, not two', merged.length, 1);
check('merged item id = the steel string (record view target)', merged[0].id, 'st1');
check('merged type = steel', merged[0].type, 'steel');
check('title names the distance', merged[0].title, 'Steel at 600');
check('sub carries the dial-corrected line', merged[0].sub.indexOf('dial corrected 4.0 → 3.8') !== -1, true);

console.log('\nCorrelation window (10 min) respected:');
var tooLate = F.buildFeed({
    steelStrings: [{ id: 'st2', sessionDate: '2026-07-25T08:00:00Z', distanceYd: 600, tier: 'full' }],
    truingEvents: [{
        id: 'te2', appliedAt: '2026-07-25T08:25:00Z', mode: 'simple', correctionType: 'mv',
        oldValue: 2960, newValue: 2923, far: { rangeYds: 600 }, inputs: {}
    }]
});
check('outside the window → two separate items', tooLate.length, 2);
check('the standalone correction is worded "Rifle trued"',
    tooLate.filter(function (i) { return i.type === 'correction'; })[0].title, 'Rifle trued');

console.log('\nDistance mismatch does not correlate:');
var wrongDist = F.buildFeed({
    steelStrings: [{ id: 'st3', sessionDate: '2026-07-25T08:00:00Z', distanceYd: 600, tier: 'full' }],
    truingEvents: [{
        id: 'te3', appliedAt: '2026-07-25T08:01:00Z', mode: 'simple', correctionType: 'mv',
        oldValue: 2960, newValue: 2923, far: { rangeYds: 800 }, inputs: {}
    }]
});
check('different distance → two separate items', wrongDist.length, 2);

console.log('\nUncorrelated steel string (no correction yet):');
var casual = F.buildFeed({ steelStrings: [{ id: 'st4', sessionDate: '2026-07-24T10:00:00Z', distanceYd: 500, tier: 'casual' }] });
check('logged, no dial line', casual[0].sub.indexOf('dial') === -1, true);
check('title still names distance', casual[0].title, 'Steel at 500');

console.log('\nDetailed-lane (full) truing never merges into a steel line:');
var full = F.buildFeed({
    steelStrings: [{ id: 'st5', sessionDate: '2026-07-25T08:00:00Z', distanceYd: 925, tier: 'full' }],
    truingEvents: [{
        id: 'te5', appliedAt: '2026-07-25T08:01:00Z', mode: 'full', correctionType: 'bc',
        oldValue: 0.315, newValue: 0.299, far: { rangeYds: 925 }, inputs: {}
    }]
});
check('mode=full still correlates by distance/time (owner\'s 925 workflow saves close together)', full.length, 1);
check('BC correction worded in the merged steel line',
    full[0].sub.indexOf('correction applied') !== -1, true);

console.log('\nZero session → "Zero confirmed", the raw session row is folded in:');
var zeroFeed = F.buildFeed({
    sessions: [{ id: 's1', date: '2026-07-23T09:00:00Z', distanceYards: 100, impacts: [1, 2, 3, 4, 5], isZeroSession: true }],
    zeroEvents: [{
        id: 'z1', sessionId: 's1', date: '2026-07-23T09:00:00Z', shotCount: 5,
        groupData: { atzElevationMOA: 0.5, atzWindageMOA: 0.34 }
    }]
});
check('exactly one item (not session + zero both)', zeroFeed.length, 1);
check('worded "Zero confirmed"', zeroFeed[0].title, 'Zero confirmed');
check('shot count shown', zeroFeed[0].sub.indexOf('5 shots') !== -1, true);
check('offset magnitude computed (sqrt(0.5²+0.34²)≈0.60)', zeroFeed[0].sub.indexOf('0.60 MOA') !== -1, true);

console.log('\nNon-zero paper session:');
var paper = F.buildFeed({
    sessions: [{ id: 's2', date: '2026-07-20T09:00:00Z', distanceYards: 100, impacts: [1, 2, 3],
        results: { groupSizeMOA: 0.82 }, isZeroSession: false }]
});
check('worded "Paper session"', paper[0].title, 'Paper session');
check('group size shown', paper[0].sub.indexOf('0.82 MOA') !== -1, true);
check('shot count shown', paper[0].sub.indexOf('3 shots') !== -1, true);

console.log('\nBullet speed:');
var mv = F.buildFeed({ mvMeasurements: [{ id: 'm1', date: '2026-07-23T10:00:00Z', value: 2846.3, sd: 6.2, shotCount: 10, source: 'chrono' }] });
check('worded "measured" for chrono-sourced', mv[0].title, 'Bullet speed measured');
check('fps rounded', mv[0].sub.indexOf('2846 fps') !== -1, true);
check('SD shown', mv[0].sub.indexOf('± 6') !== -1, true);
check('shot count shown', mv[0].sub.indexOf('10 shots') !== -1, true);
var mvManual = F.buildFeed({ mvMeasurements: [{ id: 'm2', date: '2026-07-23T10:00:00Z', value: 2900, source: 'manual' }] });
check('worded "typed in" for manual entries', mvManual[0].title, 'Bullet speed typed in');

console.log('\nCleaning:');
var clean = F.buildFeed({ cleaningLogs: [{ id: 'c1', date: '2026-07-22T10:00:00Z', roundCountAtCleaning: 412 }] });
check('worded "Barrel cleaned"', clean[0].title, 'Barrel cleaned');
check('round count shown', clean[0].sub.indexOf('412 rounds') !== -1, true);

console.log('\nSort order (newest first) across every family:');
var mixed = F.buildFeed({
    sessions: [{ id: 'sA', date: '2026-07-20T00:00:00Z', impacts: [1, 2, 3], results: { groupSizeMOA: 1 } }],
    mvMeasurements: [{ id: 'mA', date: '2026-07-24T00:00:00Z', value: 2900 }],
    cleaningLogs: [{ id: 'cA', date: '2026-07-22T00:00:00Z', roundCountAtCleaning: 100 }]
});
check('3 items', mixed.length, 3);
check('newest first (speed, 07-24)', mixed[0].id, 'mA');
check('then cleaning, 07-22', mixed[1].id, 'cA');
check('then paper, 07-20', mixed[2].id, 'sA');

console.log('\nPending flag (v2.5/v3 §3.3 sync visibility) survives the merge:');
var pending = F.buildFeed({
    steelStrings: [{ id: 'stP', sessionDate: '2026-07-25T08:00:00Z', distanceYd: 700, tier: 'casual', _pending: true }]
});
check('pending flag carried through', pending[0].pending, true);

console.log('\nEmpty input is safe:');
check('no crash, empty array', F.buildFeed({}).length, 0);
check('no crash, undefined', F.buildFeed(undefined).length, 0);

console.log('\npickDropRows (the embedded chart\'s 4 rows):');
check('600 → [300,400,500,600]', F.pickDropRows(600).join(','), '300,400,500,600');
check('925 rounds to 900 → [600,700,800,900]', F.pickDropRows(925).join(','), '600,700,800,900');
check('rounds to nearest 100', F.pickDropRows(583).join(','), '300,400,500,600');
check('small proven-to pads forward, never sparse', F.pickDropRows(100).join(','), '100,200,300,400');
check('zero/none → sensible default', F.pickDropRows(0).join(','), '100,200,300,400');
check('always exactly 4 rows', F.pickDropRows(150).length, 4);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
