/**
 * test-residual-engine.js — Amendment 1 Phase E shadow engine, unit
 * coverage beyond the golden suite (eligibility edge cases, the
 * uncertainty propagation model). Run: node tests/test-residual-engine.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var RE = require('../js/residual-engine.js');

function shot(seq, over) {
    var s = { seq: seq, rangeYds: 700, dialedMOA: 5, shotMV: 2650, hitInches: 0 };
    for (var k in over) { if (over.hasOwnProperty(k)) s[k] = over[k]; }
    return s;
}

console.log('\ncheckEligibility:');
check('empty array is ineligible (below minimum)', RE.checkEligibility([]).eligible, false);
check('exactly MIN_SAMPLE (4) consecutive shots is eligible',
    RE.checkEligibility([shot(1), shot(2), shot(3), shot(4)]).eligible, true);
check('one fewer than MIN_SAMPLE is ineligible',
    RE.checkEligibility([shot(1), shot(2), shot(3)]).eligible, false);
check('sequence numbers need not start at 1, only be consecutive',
    RE.checkEligibility([shot(5), shot(6), shot(7), shot(8)]).eligible, true);
check('duplicate sequence number is ineligible',
    RE.checkEligibility([shot(1), shot(1), shot(2), shot(3)]).eligible, false);
check('shots with no mvSourceId at all never trigger the competing-source check',
    RE.checkEligibility([shot(1), shot(2), shot(3), shot(4)]).eligible, true);
check('identical shotMV values with no mvSourceId are fine (ordinary chronograph coincidence)',
    RE.checkEligibility([shot(1, { shotMV: 2650 }), shot(2, { shotMV: 2650 }), shot(3), shot(4)]).eligible, true);
check('distinct mvSourceId values are fine',
    RE.checkEligibility([shot(1, { mvSourceId: 'a' }), shot(2, { mvSourceId: 'b' }), shot(3), shot(4)]).eligible, true);

console.log('\ncomputeShotUncertaintyMOA:');
var profile = { muzzleVelocity: 2650, bc: 0.505, dragModel: 'G1', bulletWeight: 175, zeroRange: 100, scopeHeight: 1.5 };
var envMeasured = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'measured' };
var envEstimated = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'estimated' };
var ctx = { profile: profile, env: envMeasured, avgMV: 2650, chronographClassPct: 0.1 };

var sigmaMeasured = RE.computeShotUncertaintyMOA(shot(1, { rangeYds: 700 }), { profile: profile, env: envMeasured, avgMV: 2650 });
var sigmaEstimated = RE.computeShotUncertaintyMOA(shot(1, { rangeYds: 700 }), { profile: profile, env: envEstimated, avgMV: 2650 });
check('uncertainty is a finite positive number', sigmaMeasured > 0 && isFinite(sigmaMeasured), true);
check('estimated-atmosphere uncertainty is wider than measured-atmosphere uncertainty (same shot otherwise)',
    sigmaEstimated > sigmaMeasured, true);

var sigmaNoMv = RE.computeShotUncertaintyMOA(shot(1, { rangeYds: 700, shotMV: undefined }), { profile: profile, env: envMeasured, avgMV: 2650 });
check('a shot with no measured velocity still gets a finite uncertainty (falls back to avgMV)',
    isFinite(sigmaNoMv) && sigmaNoMv > 0, true);

var sigmaWithAeroJump = RE.computeShotUncertaintyMOA(shot(1, { rangeYds: 700, windEstimateAeroJumpMOA: 0.2 }), ctx);
var sigmaNoAeroJump = RE.computeShotUncertaintyMOA(shot(1, { rangeYds: 700 }), ctx);
check('a supplied wind-estimate aero-jump term widens uncertainty, never narrows it',
    sigmaWithAeroJump > sigmaNoAeroJump, true);

console.log('\ncomputeResidualEngine edge cases:');
var missingInput = RE.computeResidualEngine({});
check('no shots at all is handled without throwing', missingInput.eligible, false);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
