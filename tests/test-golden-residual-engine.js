/**
 * test-golden-residual-engine.js — Amendment 1 Phase E synthetic golden
 * suite (E-SHADOW-SPEC.md §11). Every case is built from a KNOWN,
 * deterministic synthetic relationship (a chosen velocity sensitivity
 * plus a chosen injected residual) — the test proves the engine
 * RECOVERS the known answer, not merely that it reproduces whatever it
 * last computed. No Math.random()/Date.now() — fully reproducible.
 * Run: node tests/test-golden-residual-engine.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function within(label, actual, expected, tol) {
    var ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + expected + ' +/- ' + tol + ', got ' + actual); }
}

var RE = require('../js/residual-engine.js');

var PROFILE = { muzzleVelocity: 2650, bc: 0.505, dragModel: 'G1', bulletWeight: 175, zeroRange: 100, scopeHeight: 1.5 };
var ENV = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'measured' };
var RANGE_YDS = 700;

/** Build a sequence with a KNOWN injected residual (constant across
 *  shots) riding on top of real per-shot velocity variation, so the
 *  velocity effect is fully present but the engine must still recover
 *  exactly `injectedResidual` once it compensates for it. Optional
 *  per-shot hit noise (inches) simulates realistic scatter. */
function buildSequence(mvs, injectedResidual, hitNoiseInches) {
    var avgMV = mvs.reduce(function (a, b) { return a + b; }, 0) / mvs.length;
    var predictedStringMV = RE.predictedComeUpMOA(Object.assign({}, PROFILE, { muzzleVelocity: avgMV }), ENV, RANGE_YDS);
    var dialedMOA = predictedStringMV;
    return mvs.map(function (mv, i) {
        var predictedShotMV = RE.predictedComeUpMOA(Object.assign({}, PROFILE, { muzzleVelocity: mv }), ENV, RANGE_YDS);
        var observedMOA = predictedShotMV + injectedResidual;
        var hitMOA = dialedMOA - observedMOA;
        var hitInches = hitMOA * RANGE_YDS * 1.047 / 100;
        if (hitNoiseInches && typeof hitNoiseInches[i] === 'number') hitInches += hitNoiseInches[i];
        return { seq: i + 1, rangeYds: RANGE_YDS, dialedMOA: dialedMOA, hitInches: hitInches, shotMV: mv };
    });
}

console.log('\nCase 1 — synthetic recovery (known 0.3 MOA injected residual):');
var recoveryShots = buildSequence([2650, 2680, 2620, 2665, 2635, 2650], 0.3);
var recovery = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: recoveryShots });
check('eligible', recovery.eligible, true);
check('sufficient sample', recovery.sufficientSample, true);
within('recovers the injected residual within 0.01 MOA', recovery.unresolvedResidualMOA, 0.3, 0.01);
check('non-null uncertainty reported', typeof recovery.unresolvedResidualUncertaintyMOA === 'number' && recovery.unresolvedResidualUncertaintyMOA > 0, true);
check('explains a real amount of dispersion (velocity variance was genuinely present)', recovery.explainedMOA > 0.1, true);
check('evidence level is CALCULATED, never higher', recovery.evidenceLevel, 'CALCULATED');
check('no shots excluded in the clean case', recovery.shots.every(function (s) { return !s.excluded; }), true);

console.log('\nCase 2 — perturbation (same known residual + small realistic hit noise):');
var perturbedShots = buildSequence([2650, 2680, 2620, 2665, 2635, 2650], 0.3, [0.05, -0.03, 0.02, -0.04, 0.01, 0.03]);
var perturbed = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: perturbedShots });
within('still recovers close to the injected residual under small noise', perturbed.unresolvedResidualMOA, 0.3, 0.05);
within('perturbation moves the result smoothly, not discontinuously, vs. the noiseless case', perturbed.unresolvedResidualMOA, recovery.unresolvedResidualMOA, 0.05);
check('uncertainty is still reported and finite', isFinite(perturbed.unresolvedResidualUncertaintyMOA), true);

console.log('\nCase 3 — zero signal (no velocity variance, no injected residual):');
var zeroShots = buildSequence([2650, 2650, 2650, 2650, 2650, 2650], 0);
var zero = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: zeroShots });
within('explained dispersion is ~0 (nothing to explain)', zero.explainedMOA, 0, 0.001);
within('unresolved residual is ~0', zero.unresolvedResidualMOA, 0, 0.001);

console.log('\nCase 4 — outlier exclusion (one shot injected far outside the rest):');
var outlierShots = buildSequence([2650, 2680, 2620, 2665, 2635, 2650], 0.3);
outlierShots[5] = Object.assign({}, outlierShots[5], { hitInches: outlierShots[5].hitInches + 30 });
var outlier = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: outlierShots });
check('the wild shot is flagged excluded', outlier.shots[5].excluded, true);
check('the wild shot still appears in the record with its own value (never discarded)', typeof outlier.shots[5].velocityCompensatedResidualMOA === 'number', true);
check('every other shot remains included', outlier.shots.slice(0, 5).every(function (s) { return !s.excluded; }), true);
within('the aggregate still recovers the true residual once the outlier is excluded', outlier.unresolvedResidualMOA, 0.3, 0.01);
check('confidence notes the exclusion', outlier.confidence.capNotes.indexOf('one or more shots excluded as outliers') !== -1, true);

console.log('\nCase 5 — minimum sample gate (only 3 velocity-matched shots):');
var thinShots = buildSequence([2650, 2680, 2620], 0.2);
var thin = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: thinShots });
check('below MIN_SAMPLE is treated as ineligible for this aggregate', thin.eligible, false);
check('reason cites the minimum sample', thin.reason, 'fewer than the minimum sample size');
check('no aggregate reported below the gate', thin.explainedMOA, null);

console.log('\nCase 6 — ineligibility (proposed-only, never computed):');
var gapShots = buildSequence([2650, 2680, 2620, 2665, 2635], 0.2);
gapShots[2].seq = 10;
var gap = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: gapShots });
check('a sequence gap is ineligible', gap.eligible, false);
check('gap reason names the gap', gap.reason.indexOf('gap in shot sequence') !== -1, true);
check('nothing computed for an ineligible sequence', gap.shots.length, 0);

var dialChangeShots = buildSequence([2650, 2680, 2620, 2665, 2635], 0.2);
dialChangeShots[3] = Object.assign({}, dialChangeShots[3], { dialedMOA: dialChangeShots[3].dialedMOA + 1 });
var dialChange = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: dialChangeShots });
check('a mid-sequence dial change is ineligible', dialChange.eligible, false);
check('dial-change reason', dialChange.reason, 'dial changed mid-sequence');

var competingShots = buildSequence([2650, 2680, 2620, 2665, 2635], 0.2).map(function (s, i) {
    return Object.assign({}, s, { mvSourceId: i < 2 ? 'vstr-1' : 'vstr-2' });
});
var competing = RE.computeResidualEngine({ profile: PROFILE, env: ENV, shots: competingShots });
check('a competing mvSourceId claim is ineligible', competing.eligible, false);
check('competing-source reason names the source id', competing.reason.indexOf('vstr-1') !== -1, true);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
