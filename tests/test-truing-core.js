/**
 * test-truing-core.js — the two-stage transonic-aware truing engine
 * (§2.5c) + device compensation (§2.12).
 * Run: node tests/test-truing-core.js
 *
 * The engine proves itself by ROUND-TRIP: perturb a known profile,
 * generate synthetic observations from the real solver, and require
 * the solver to recover the perturbation.
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function approx(label, actual, expected, tol) {
    var ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + expected + ' ± ' + tol + ', got ' + actual); }
}
function ok(label, cond) {
    if (cond) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label); }
}

var BS = require('../js/ballistic-solver.js');
var T = require('../js/truing-core.js');

var ENV = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'manual' };

// Known cartridges
var PRC65 = { muzzleVelocity: 2960, bc: 0.330, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var SMK308 = { muzzleVelocity: 2650, bc: 0.243, dragModel: 'G7', bulletWeight: 175, zeroRange: 100, scopeHeight: 1.5 };

/** Synthetic observation: the come-up the REAL solver says a given
 *  profile needs at a range (what a perfect shooter would observe). */
function synthObs(profile, rangeYds, extras) {
    var t = BS.computeTrajectory({
        muzzleVelocity: profile.muzzleVelocity, bc: profile.bc, dragModel: profile.dragModel,
        zeroRange: profile.zeroRange, scopeHeight: profile.scopeHeight,
        bulletWeight: profile.bulletWeight, maxRange: rangeYds + 100, rangeStep: 25,
        windSpeedMph: 0, windClockPos: 12,
        tempF: ENV.tempF, pressureInHg: ENV.pressureInHg, humidity: ENV.humidity
    }).table;
    var comeUp = null;
    for (var i = 1; i < t.length; i++) {
        if (t[i].rangeYards >= rangeYds) {
            var a = t[i - 1], b = t[i];
            var f = (rangeYds - a.rangeYards) / (b.rangeYards - a.rangeYards);
            comeUp = a.comeUpMOA + (b.comeUpMOA - a.comeUpMOA) * f;
            break;
        }
    }
    var obs = { rangeYds: rangeYds, observedComeUpMOA: comeUp };
    for (var k in (extras || {})) { obs[k] = extras[k]; }
    return obs;
}

console.log('\n1. Mach distances — known-cartridge sanity:');
var mPrc = T.machDistances(PRC65, ENV);
ok('6.5 PRC class stays supersonic past 1400 yd (' + mPrc.supersonicYd + ')', mPrc.supersonicYd > 1400);
ok('6.5 PRC crossing order: mach12 < supersonic < mach09',
    mPrc.mach12Yd < mPrc.supersonicYd && mPrc.supersonicYd < mPrc.mach09Yd);
var m308 = T.machDistances(SMK308, ENV);
ok('.308 175 goes transonic much shorter (' + m308.supersonicYd + ')', m308.supersonicYd < 1200);
ok('.308 supersonic reach in a sane window (850–1200)', m308.supersonicYd >= 850 && m308.supersonicYd <= 1200);
var mHot = T.machDistances({ muzzleVelocity: 3100, bc: 0.330, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 }, ENV);
ok('higher MV pushes every crossing farther', mHot.mach12Yd > mPrc.mach12Yd && mHot.supersonicYd > mPrc.supersonicYd);

console.log('\n2. Interpolation stability:');
var mCold = T.machDistances(PRC65, { tempF: 0, pressureInHg: 29.92, humidity: 50 });
ok('cold dense air shortens supersonic reach', mCold.supersonicYd < mPrc.supersonicYd);

console.log('\n3. Prescribed distances:');
var rx = T.prescribeTruingDistances(PRC65, ENV);
approx('mvTrueYd ≈ 85% of Mach-1.2 distance', rx.mvTrueYd, 0.85 * mPrc.mach12Yd, 25);
check('drag bracket starts at Mach 1.2 (rounded 25)', rx.dragBracket[0], Math.round(mPrc.mach12Yd / 25) * 25);
check('drag bracket ends at Mach 0.9 (rounded 25)', rx.dragBracket[1], Math.round(mPrc.mach09Yd / 25) * 25);
ok('prescription honors the ≥300/3× zero floor',
    T.prescribeTruingDistances({ muzzleVelocity: 2650, bc: 0.243, dragModel: 'G7', bulletWeight: 175, zeroRange: 25, scopeHeight: 1.5 }, ENV).mvTrueYd >= 300);

console.log('\n4. Band routing:');
check('150 yd on a 100-yd zero = zero band', T.classifyDistance(150, m308, 100).band, 'zero');
check('600 yd on the .308 = mv band', T.classifyDistance(600, m308, 100).band, 'mv');
check('inside Mach 1.2→0.9 = drag band', T.classifyDistance(Math.round((m308.mach12Yd + m308.mach09Yd) / 2), m308, 100).band, 'drag');
check('past Mach 0.9 = beyond', T.classifyDistance(m308.mach09Yd + 300, m308, 100).band, 'beyond');
approx('supersonicPct at the supersonic limit ≈ 1', T.classifyDistance(m308.supersonicYd, m308, 100).supersonicPct, 1.0, 0.01);

console.log('\n5. Normalization:');
var machCtx = { profile: PRC65, env: ENV, machDist: mPrc };
// a shot 50 fps fast normalizes back to the string average
var fast = T.normalizeGroups([
    synthObs({ muzzleVelocity: 3010, bc: 0.330, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 }, 800, { shotMV: 3010 }),
    synthObs(PRC65, 800, { shotMV: 2960, groupId: 'b' })
], machCtx);
var fastLedger = fast.ledger[0];
ok('fast shot gets a positive MV adjustment (needed MORE come-up at avg MV)', fastLedger.mvAdjMOA > 0.1);
approx('normalized fast shot ≈ the average-MV shot\'s observation',
    fastLedger.normalizedMOA, fast.ledger[1].normalizedMOA, 0.25);
check('shots without MV get zero MV adjustment',
    T.normalizeGroups([synthObs(PRC65, 600, {})], machCtx).ledger[0].mvAdjMOA, 0);
check('ledger admits aero jump is not modeled', fastLedger.aeroJump, 'not modeled');

// Coriolis: east vs west flips sign; short range = none
var east = T.normalizeGroups([synthObs(PRC65, 900, {})],
    { profile: PRC65, env: ENV, machDist: mPrc, latitudeDeg: 45, azimuthDeg: 90 });
var west = T.normalizeGroups([synthObs(PRC65, 900, {})],
    { profile: PRC65, env: ENV, machDist: mPrc, latitudeDeg: 45, azimuthDeg: 270 });
ok('east vs west Coriolis flips sign',
    east.ledger[0].coriolisAdjMOA * west.ledger[0].coriolisAdjMOA < 0);
ok('Coriolis magnitude sane at 900 (0.05–0.5 MOA)',
    Math.abs(east.ledger[0].coriolisAdjMOA) > 0.05 && Math.abs(east.ledger[0].coriolisAdjMOA) < 0.5);
check('no Coriolis below 800 yd',
    T.normalizeGroups([synthObs(PRC65, 600, {})],
        { profile: PRC65, env: ENV, machDist: mPrc, latitudeDeg: 45, azimuthDeg: 90 }).ledger[0].coriolisAdjMOA, 0);
check('no Coriolis without direction of fire', east !== null &&
    T.normalizeGroups([synthObs(PRC65, 900, {})], machCtx).ledger[0].coriolisAdjMOA, 0);

// group centers, never single shots
var grouped = T.normalizeGroups([
    { rangeYds: 700, observedComeUpMOA: 12.0, groupId: 'a' },
    { rangeYds: 700, observedComeUpMOA: 12.5, groupId: 'a' },
    { rangeYds: 700, observedComeUpMOA: 13.0, groupId: 'a' }
], machCtx);
check('one group from three shots', grouped.groups.length, 1);
approx('group mean is the truing target', grouped.groups[0].meanNormalizedMOA, 12.5, 0.001);

console.log('\n6. Round-trip MV recovery:');
var truthFast = { muzzleVelocity: 3000, bc: 0.330, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var obsMv = [synthObs(truthFast, 300, { groupId: 'a' }), synthObs(truthFast, 450, { groupId: 'b' }), synthObs(truthFast, 600, { groupId: 'c' })];
var normMv = T.normalizeGroups(obsMv, machCtx);
var mvFix = T.solveMvCorrection(normMv.groups, PRC65, ENV);
approx('MV +40 recovered from 300/450/600 observations', mvFix.value, 3000, 6);
ok('secant converges quickly (< 15 iterations)', mvFix.iterations < 15);
var truthSlow = { muzzleVelocity: 2920, bc: 0.330, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var mvFix2 = T.solveMvCorrection(
    T.normalizeGroups([synthObs(truthSlow, 300), synthObs(truthSlow, 450), synthObs(truthSlow, 600)], machCtx).groups,
    PRC65, ENV);
approx('MV −40 recovered too', mvFix2.value, 2920, 6);

console.log('\n7. Round-trip BC recovery (drag band):');
var truthDraggy = { muzzleVelocity: 2960, bc: 0.310, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var dragRanges = [rx.dragBracket[0], Math.round((rx.dragBracket[0] + rx.dragBracket[1]) / 2 / 25) * 25, rx.dragBracket[1]];
var obsBc = dragRanges.map(function (r, i) { return synthObs(truthDraggy, r, { groupId: 'g' + i }); });
var bcFix = T.solveBcCorrection(T.normalizeGroups(obsBc, machCtx).groups, PRC65, ENV);
approx('BC 0.330→0.310 recovered in the transonic bracket', bcFix.value, 0.310, 0.004);
ok('recovery beats the legacy 0.005 grid resolution', Math.abs(bcFix.value - 0.310) < 0.005);

console.log('\n8. Combined fork (solveTruing):');
var full = T.solveTruing(obsMv, machCtx, { mvMeasured: false });
ok('both options auto-calculated', typeof full.mvOption.value === 'number' && typeof full.bcOption.value === 'number');
check('short-range data + unmeasured MV → recommends MV', full.recommended, 'mv');
ok('guidance mentions the chronograph', full.guidance.indexOf('chronograph') !== -1);
var fullMeasured = T.solveTruing(obsMv, machCtx, { mvMeasured: true });
check('measured MV → the honest fix is BC', fullMeasured.recommended, 'bc');
ok('…with the distance-honesty label', fullMeasured.guidance.indexOf('%') !== -1);
var fullDrag = T.solveTruing(obsBc, machCtx, { mvMeasured: true });
check('transonic data routes to drag', fullDrag.farBand, 'drag');
check('…and recommends BC', fullDrag.recommended, 'bc');
ok('ledger travels with the result', fullDrag.ledger.length === 3);

console.log('\n9. Wind-flagged strings down-weighted:');
var clean = [synthObs(truthFast, 450, { groupId: 'a' }), synthObs(truthFast, 600, { groupId: 'b' })];
var polluted = clean.concat([
    { rangeYds: 600, observedComeUpMOA: clean[1].observedComeUpMOA + 2.0, groupId: 'gusty', flagged: true }
]);
var fixPolluted = T.solveMvCorrection(T.normalizeGroups(polluted, machCtx).groups, PRC65, ENV);
var fixNaive = T.solveMvCorrection(T.normalizeGroups(clean.concat([
    { rangeYds: 600, observedComeUpMOA: clean[1].observedComeUpMOA + 2.0, groupId: 'gusty' }
]), machCtx).groups, PRC65, ENV);
ok('flagged group pulls the answer less than an unflagged one',
    Math.abs(fixPolluted.value - 3000) < Math.abs(fixNaive.value - 3000));

console.log('\n10. Confidence matrix:');
function conf(over) {
    var base = { shotCount: 12, groupCount: 3, mvMeasuredPct: 1, windLoggedPct: 1,
        groupSpreadMOA: 0.2, envSource: 'manual', zeroConfirmed: true,
        trackingVerified: true, supersonicPct: 0.95, correctionType: 'bc', mode: 'full' };
    for (var k in over) { base[k] = over[k]; }
    return T.truingConfidence(base);
}
ok('strong full true reaches 4–5 segments', conf({}).segments >= 4);
check('quick mode capped at Moderate', conf({ mode: 'quick' }).segments <= 3, true);
check('drag correction short of transonic capped at 3', conf({ supersonicPct: 0.62 }).segments, 3);
ok('…with the honesty note', conf({ supersonicPct: 0.62 }).capNotes.join(' ').indexOf('62%') !== -1);
check('default environment caps at 3', conf({ envSource: 'default' }).segments, 3);
check('unconfirmed zero caps at 2', conf({ zeroConfirmed: false }).segments, 2);
check('unverified tracking caps at 3', conf({ trackingVerified: false }).segments, 3);
check('wild group spread caps at 2', conf({ groupSpreadMOA: 1.4 }).segments, 2);
check('thin shots floor', conf({ shotCount: 3, groupCount: 1 }).segments, 2);
check('words map to segments (3 = Moderate)', conf({ supersonicPct: 0.62 }).word, 'Moderate');
check('MV correction without chrono capped', conf({ correctionType: 'mv', mvMeasuredPct: 0 }).segments, 3);

console.log('\n11. Device compensation (§2.12):');
var ident = T.deviceCompensation(PRC65, ENV, 1.0, { fromYd: 300, toYd: 900 });
check('factor 1.0 → identity BC', ident.bcOut, PRC65.bc);
check('factor 1.0 → identity MV', ident.mvOut, PRC65.muzzleVelocity);
check('identity flagged', ident.identity, true);

var comp = T.deviceCompensation(PRC65, ENV, 0.96, { fromYd: 300, toYd: 900 });
ok('clicks-4%-small device profile needs MORE apparent drop (lower BC or MV)',
    comp.bcOut < PRC65.bc || comp.mvOut < PRC65.muzzleVelocity);
ok('sweet spot exists', !!comp.sweetSpot);
ok('sweet spot covers most of the 300–900 working range',
    comp.sweetSpot && (comp.sweetSpot.toYd - comp.sweetSpot.fromYd) >= 0.7 * 600);
// simulate: dial the compensated solution through the faulty scope
var compProfile = { muzzleVelocity: comp.mvOut, bc: comp.bcOut, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var worstErr = 0;
[300, 500, 700, 900].forEach(function (r) {
    var deviceSays = synthObs(compProfile, r).observedComeUpMOA;
    var trueNeed = synthObs(PRC65, r).observedComeUpMOA;
    var actualMove = deviceSays * 0.96; // dialing through the faulty scope
    worstErr = Math.max(worstErr, Math.abs(actualMove - trueNeed));
});
ok('dialing the device numbers through the bad scope lands within 0.15 MOA everywhere (worst ' +
    Math.round(worstErr * 1000) / 1000 + ')', worstErr <= 0.15);

console.log('\n12. Purity / determinism:');
var r1 = JSON.stringify(T.solveTruing(obsMv, machCtx, { mvMeasured: false }));
var r2 = JSON.stringify(T.solveTruing(obsMv, machCtx, { mvMeasured: false }));
check('identical inputs → identical outputs', r1 === r2, true);
ok('ledger JSON round-trips', JSON.parse(r1).ledger.length === 3);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
