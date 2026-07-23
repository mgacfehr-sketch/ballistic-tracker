/**
 * test-calibration-status.js — pure derivation core of the
 * Calibration Status card (§2.10). Run: node tests/test-calibration-status.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var C = require('../js/calibration-status.js');
var derive = C.deriveCalibrationStatus;
var AGING = C.CALIBRATION_AGING;

var NOW = '2026-07-22T12:00:00Z';

function base(overrides) {
    var input = {
        now: NOW,
        rifle: { zeroRange: 100 },
        load: null,
        currentLot: null,
        zeroVerdict: null,
        zeroEvents: [],
        scopeAdjustments: [],
        mvMeasurements: [],
        trackingVerifications: [],
        truingEvents: []
    };
    for (var k in overrides) {
        if (overrides.hasOwnProperty(k)) input[k] = overrides[k];
    }
    return input;
}

console.log('\ncalDaysBetween:');
check('whole days', C.calDaysBetween('2026-07-01T00:00:00Z', '2026-07-22T00:00:00Z'), 21);
check('partial day floors', C.calDaysBetween('2026-07-01T00:00:00Z', '2026-07-01T23:00:00Z'), 0);
check('bad input → null', C.calDaysBetween('garbage', NOW), null);

console.log('\nEmpty rifle (nothing known):');
var empty = derive(base({}));
check('tracking never', empty.tracking.state, 'never');
check('zero never', empty.zero.state, 'never');
check('mv none', empty.mv.state, 'none');
check('trued untrued', empty.trued.state, 'untrued');
check('rollup NOT CHECKED', empty.rollup.word, 'NOT CHECKED');
check('rollup chip problem', empty.rollup.chip.kind, 'problem');
check('no calibrated-to distance', empty.rollup.calibratedToYd, null);
check('hint starts with zero', empty.hint, 'Confirm zero — everything starts there.');

console.log('\nZero element:');
var fresh = derive(base({
    zeroEvents: [{ date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
        groupData: { atzElevationMOA: 0.1, atzWindageMOA: 0 } }]
}));
check('fresh 8-shot zero confirmed', fresh.zero.state, 'confirmed');
check('rollup READY', fresh.rollup.word, 'READY');
check('calibrated to zero distance', fresh.rollup.calibratedToYd, 100);

var thin = derive(base({
    zeroEvents: [{ date: '2026-07-20T10:00:00Z', shotCount: 3, distanceYards: 100,
        groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } }]
}));
check('3-shot zero is thin', thin.zero.state, 'thin');
check('thin rollup word THIN', thin.rollup.word, 'THIN');
check('thin still calibrated to distance (honest, softened)', thin.rollup.calibratedToYd, 100);

var stale = derive(base({
    zeroEvents: [{ date: '2026-03-01T10:00:00Z', shotCount: 8, distanceYards: 100,
        groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } }]
}));
check('zero > ' + AGING.zeroStaleDays + 'd is stale', stale.zero.state, 'stale');
check('stale rollup STALE', stale.rollup.word, 'STALE');
check('stale wording softened, not deleted', stale.zero.line.indexOf('confirm before the hunt') !== -1, true);

var adjusted = derive(base({
    zeroEvents: [{ date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
        groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } }],
    scopeAdjustments: [{ date: '2026-07-21T10:00:00Z' }]
}));
check('scope adjustment after zero → immediately stale', adjusted.zero.state, 'stale');
check('adjustment wording says why', adjusted.zero.line.indexOf('Scope adjusted') !== -1, true);

var notAfter = derive(base({
    zeroEvents: [{ date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
        groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } }],
    scopeAdjustments: [{ date: '2026-07-19T10:00:00Z' }]
}));
check('scope adjustment BEFORE zero does not stale it', notAfter.zero.state, 'confirmed');

var drifted = derive(base({
    zeroEvents: [
        { date: '2026-07-10T10:00:00Z', shotCount: 8, distanceYards: 100,
            groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } },
        { date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
            groupData: { atzElevationMOA: 0.6, atzWindageMOA: 0.3 } }
    ]
}));
check('centroid moved > ' + AGING.zeroDriftMOA + ' MOA → drifted', drifted.zero.state, 'drifted');

var smallMove = derive(base({
    zeroEvents: [
        { date: '2026-07-10T10:00:00Z', shotCount: 8, distanceYards: 100,
            groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } },
        { date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
            groupData: { atzElevationMOA: 0.2, atzWindageMOA: 0.1 } }
    ]
}));
check('small centroid move stays confirmed', smallMove.zero.state, 'confirmed');

var adjustVerdict = derive(base({
    zeroVerdict: { state: 'adjust', correction: '3 clicks DOWN' },
    zeroEvents: [{ date: '2026-07-20T10:00:00Z', shotCount: 8, distanceYards: 100,
        groupData: { atzElevationMOA: 0.9, atzWindageMOA: 0 } }]
}));
check('live adjust verdict wins', adjustVerdict.zero.state, 'adjust');
check('adjust line carries the correction', adjustVerdict.zero.line.indexOf('3 clicks DOWN') !== -1, true);
check('adjust rollup ADJUST', adjustVerdict.rollup.word, 'ADJUST');

var legacyReady = derive(base({ zeroVerdict: { state: 'ready' } }));
check('pre-migration: session verdict alone confirms', legacyReady.zero.state, 'confirmed');
check('legacy confirmed calibrates to rifle zeroRange', legacyReady.rollup.calibratedToYd, 100);

console.log('\nMuzzle velocity element:');
var measured = derive(base({
    mvMeasurements: [{ date: '2026-07-15T10:00:00Z', value: 2841.4, sd: 8.2, shotCount: 10, lotNumber: '3120-A' }],
    currentLot: '3120-A'
}));
check('fresh measurement → measured', measured.mv.state, 'measured');
check('mv line carries value + SD + count',
    measured.mv.line.indexOf('2841 fps') !== -1 && measured.mv.line.indexOf('SD 8.2') !== -1 &&
    measured.mv.line.indexOf('10 shots') !== -1, true);

var lotChanged = derive(base({
    mvMeasurements: [{ date: '2026-07-15T10:00:00Z', value: 2841, sd: 8, shotCount: 10, lotNumber: '3120-A' }],
    currentLot: '3244-B'
}));
check('new lot → mv stale (remeasure suggestion)', lotChanged.mv.state, 'stale');
check('lot wording names both lots',
    lotChanged.mv.line.indexOf('3120-A') !== -1 && lotChanged.mv.line.indexOf('3244-B') !== -1, true);

var mvOld = derive(base({
    mvMeasurements: [{ date: '2025-12-01T10:00:00Z', value: 2841, sd: 8, shotCount: 10, lotNumber: null }]
}));
check('measurement > ' + AGING.mvStaleDays + 'd → stale', mvOld.mv.state, 'stale');

var estimated = derive(base({ load: { muzzleVelocity: 2900 } }));
check('load MV only → estimated', estimated.mv.state, 'estimated');
check('estimated line says so', estimated.mv.line.indexOf('estimated') !== -1, true);

var latestWins = derive(base({
    mvMeasurements: [
        { date: '2026-07-01T10:00:00Z', value: 2800, sd: 9, shotCount: 10 },
        { date: '2026-07-15T10:00:00Z', value: 2841, sd: 8, shotCount: 10 }
    ]
}));
check('latest measurement wins', latestWins.mv.value, 2841);

console.log('\nTracking element:');
var tracked = derive(base({
    trackingVerifications: [{ date: '2026-07-02T10:00:00Z', factor: 1.04 }]
}));
check('verification → verified', tracked.tracking.state, 'verified');
check('factor carried', tracked.tracking.factor, 1.04);
check('error wording (4% large)', tracked.tracking.line.indexOf('4.0% large') !== -1, true);

var trueTrack = derive(base({
    trackingVerifications: [{ date: '2026-07-02T10:00:00Z', factor: 1.005 }]
}));
check('within 1% reads Tracks true', trueTrack.tracking.line.indexOf('Tracks true') !== -1, true);

var rifleFallback = derive(base({
    rifle: { zeroRange: 100, scopeCorrectionFactor: 0.96, scopeTrackingTestedAt: '2026-06-01T10:00:00Z' }
}));
check('legacy rifle fields still count as verified', rifleFallback.tracking.state, 'verified');

var oldTrack = derive(base({
    trackingVerifications: [{ date: '2024-01-01T10:00:00Z', factor: 1.04 }]
}));
check('verification > ' + AGING.trackingStaleDays + 'd → stale', oldTrack.tracking.state, 'stale');

console.log('\nTrued element + rollup depth:');
var confirmedZero = { date: '2026-07-10T10:00:00Z', shotCount: 8, distanceYards: 100,
    groupData: { atzElevationMOA: 0, atzWindageMOA: 0 } };
var mvTrued = derive(base({
    zeroEvents: [confirmedZero],
    truingEvents: [{ appliedAt: '2026-07-12T10:00:00Z', stage: 'mv', correctionType: 'mv',
        supersonicPct: 0.62, far: { rangeYds: 900 }, newValue: 2831 }]
}));
check('mv truing → state mv', mvTrued.trued.state, 'mv');
check('mv truing line names distance', mvTrued.trued.line.indexOf('900 yd') !== -1, true);
check('calibrated-to = truing distance', mvTrued.rollup.calibratedToYd, 900);

var dragTrued = derive(base({
    zeroEvents: [confirmedZero],
    truingEvents: [{ appliedAt: '2026-07-12T10:00:00Z', stage: 'drag', correctionType: 'bc',
        supersonicPct: 0.95, far: { rangeYds: 1300 }, newValue: 0.319 }]
}));
check('drag truing → state drag', dragTrued.trued.state, 'drag');
check('drag line carries supersonic pct', dragTrued.trued.line.indexOf('95% of supersonic') !== -1, true);
check('calibrated-to = drag distance', dragTrued.rollup.calibratedToYd, 1300);

var flaggedTruing = derive(base({
    zeroEvents: [confirmedZero],
    mvMeasurements: [{ date: '2026-07-18T10:00:00Z', value: 2860, sd: 8, shotCount: 10 }],
    truingEvents: [{ appliedAt: '2026-07-12T10:00:00Z', stage: 'mv', correctionType: 'mv',
        supersonicPct: 0.62, far: { rangeYds: 900 }, newValue: 2831 }]
}));
check('MV re-measured materially after truing → flagged', flaggedTruing.trued.flagged, true);
check('flag wording explains', flaggedTruing.trued.line.indexOf('re-measured') !== -1, true);

var smallRemeasure = derive(base({
    zeroEvents: [confirmedZero],
    mvMeasurements: [{ date: '2026-07-18T10:00:00Z', value: 2836, sd: 8, shotCount: 10 }],
    truingEvents: [{ appliedAt: '2026-07-12T10:00:00Z', stage: 'mv', correctionType: 'mv',
        supersonicPct: 0.62, far: { rangeYds: 900 }, newValue: 2831 }]
}));
check('immaterial re-measure (< ' + AGING.mvMaterialDeltaFps + ' fps) not flagged',
    smallRemeasure.trued.flagged, false);

var truedButUnzeroed = derive(base({
    truingEvents: [{ appliedAt: '2026-07-12T10:00:00Z', stage: 'mv', correctionType: 'mv',
        supersonicPct: 0.62, far: { rangeYds: 900 }, newValue: 2831 }]
}));
check('trued but zero never confirmed → no calibrated-to (honest)',
    truedButUnzeroed.rollup.calibratedToYd, null);
check('...and rollup stays NOT CHECKED', truedButUnzeroed.rollup.word, 'NOT CHECKED');

console.log('\nHints (one line, prioritized):');
var hintTracking = derive(base({ zeroEvents: [confirmedZero] }));
check('zero good, tracking never → tracking hint',
    hintTracking.hint, 'Verify tracking to raise truing confidence to High.');
var hintMv = derive(base({
    zeroEvents: [confirmedZero],
    trackingVerifications: [{ date: '2026-07-02T10:00:00Z', factor: 1.0 }]
}));
check('tracking done, mv missing → chrono hint', hintMv.hint.indexOf('Chronograph') === 0, true);
var hintTrue = derive(base({
    zeroEvents: [confirmedZero],
    trackingVerifications: [{ date: '2026-07-02T10:00:00Z', factor: 1.0 }],
    mvMeasurements: [{ date: '2026-07-15T10:00:00Z', value: 2841, sd: 8, shotCount: 10 }]
}));
check('all prerequisites done, untrued → truing hint', hintTrue.hint.indexOf('True at distance') === 0, true);
var hintNone = derive(base({
    zeroEvents: [confirmedZero],
    trackingVerifications: [{ date: '2026-07-02T10:00:00Z', factor: 1.0 }],
    mvMeasurements: [{ date: '2026-07-15T10:00:00Z', value: 2841, sd: 8, shotCount: 10 }],
    truingEvents: [{ appliedAt: '2026-07-16T10:00:00Z', stage: 'mv', correctionType: 'mv',
        supersonicPct: 0.62, far: { rangeYds: 900 }, newValue: 2831 }]
}));
check('fully calibrated → silence (no hint)', hintNone.hint, null);

console.log('\nPurity:');
var in1 = base({ zeroEvents: [confirmedZero] });
var a = JSON.stringify(derive(in1));
var b = JSON.stringify(derive(in1));
check('identical inputs → identical outputs', a === b, true);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
