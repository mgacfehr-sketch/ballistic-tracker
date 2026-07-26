/**
 * test-simple-true.js — the one-observation "where did it hit?" path
 * (v2.5 §2.3). The contract round-trip: a planted 15 fps error must be
 * recovered from ONE 600-yd observation; confidence is honest (rough);
 * accumulation raises it.
 * Run: node tests/test-simple-true.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function checkClose(label, actual, expected, tol) {
    var ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
    if (ok) { passed++; console.log('  ✓ ' + label + ' (' + actual + ' ≈ ' + expected + ' ±' + tol + ')'); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + expected + ' ±' + tol + ', got ' + actual); }
}

var ST = require('../js/simple-true.js');
var TC = require('../js/truing-core.js');
var calc = require('../js/calculations.js');

var ENV = { tempF: 59, pressureInHg: 29.92, humidity: 50, source: 'default' };
var CLAIMED = { muzzleVelocity: 2960, bc: 0.315, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };
var TRUE_P = { muzzleVelocity: 2945, bc: 0.315, dragModel: 'G7', bulletWeight: 143, zeroRange: 100, scopeHeight: 1.8 };

console.log('\nUnit conversion:');
checkClose('MIL → MOA', ST.simpleToMOA(1, 'MIL', 600), 3.43775, 1e-6);
checkClose('IN at 600 → MOA', ST.simpleToMOA(6.28, 'IN', 600), 1.0, 0.01);
check('MOA passthrough', ST.simpleToMOA(2.5, 'MOA', 600), 2.5);
checkClose('round trip MOA→IN→MOA', ST.simpleToMOA(ST.simpleFromMOA(2, 'IN', 600), 'IN', 600), 2, 1e-9);

console.log('\nTHE ROUND-TRIP — planted 15 fps error, one 600-yd hit:');
// The shooter dials what the claimed profile says…
var dialedMOA = ST.simpleComeUpAt(CLAIMED, ENV, 600);
// …but the bullet flies at the TRUE (15 fps slower) velocity:
var trueMOA = ST.simpleComeUpAt(TRUE_P, ENV, 600);
check('slower bullet needs MORE dial (hits LOW)', trueMOA > dialedMOA, true);
var hitInches = calc.moaToInches(dialedMOA - trueMOA, 600); // negative = LOW

var out = ST.simpleTrueObservation({
    profile: CLAIMED, env: ENV, rangeYds: 600,
    dialed: dialedMOA, hitInches: hitInches, units: 'MOA',
    mvMeasured: false, zeroConfirmed: true, trackingVerified: false
});
check('engine solved from one observation', !!out, true);
check('doctrine routed silently to MV (supersonic, MV unmeasured)', out.picked, 'mv');
checkClose('recovered the planted velocity', out.option.value, 2945, 5);
check('no fork shown — one option returned', typeof out.option.value, 'number');

console.log('\nThe payoff:');
check('payoff carries the range', out.payoff.rangeYds, 600);
check('dial moved', out.payoff.moved, true);
check('new dial is MORE come-up (bullet was slower)', out.payoff.newDial > out.payoff.oldDial, true);
check('payoff horizon ~2/3 of range', out.payoff.pastYd, 400);
var copy = ST.simpleTruePayoffCopy(out.payoff);
check('copy leads with Got it', copy.indexOf('Got it.'), 0);
check('copy states the dial change', copy.indexOf(out.payoff.oldDial.toFixed(1) + ' to ' + out.payoff.newDial.toFixed(1)) !== -1, true);
check('copy states the horizon', copy.indexOf('past ~400') !== -1, true);

console.log('\nHonest confidence (one shot = rough):');
check('one-shot confidence ≤ 2 segments', out.confidence.segments <= 2, true);
check('engine word is Thin', out.confidence.word, 'Thin');
var richer = TC.truingConfidence({
    shotCount: 8, groupCount: 2, mvMeasuredPct: 1, windLoggedPct: 1,
    groupSpreadMOA: 0.1, envSource: 'manual', zeroConfirmed: true,
    trackingVerified: true, supersonicPct: 0.9, correctionType: 'mv', mode: 'full'
});
check('accumulation raises confidence honestly', richer.segments > out.confidence.segments, true);

console.log('\nHonesty edges:');
var onTarget = ST.simpleTrueObservation({
    profile: CLAIMED, env: ENV, rangeYds: 600,
    dialed: dialedMOA, hitInches: 0, units: 'MOA', mvMeasured: false
});
check('dead-center hit → barely moves', onTarget.payoff.moved, false);
check('barely-moves copy is honest', ST.simpleTruePayoffCopy(onTarget.payoff).indexOf('barely moves') !== -1, true);

var tooClose = ST.simpleTrueObservation({
    profile: CLAIMED, env: ENV, rangeYds: 120,
    dialed: 0.5, hitInches: -1, units: 'MOA', mvMeasured: false
});
check('a hit inside the zero band teaches nothing (null)', tooClose, null);

var absurd = ST.simpleTrueObservation({
    profile: CLAIMED, env: ENV, rangeYds: 600,
    dialed: dialedMOA, hitInches: -60, units: 'MOA', mvMeasured: false
});
check('a miss too big to be speed/drag → refused (capped)', absurd, null);

var typedMv = ST.simpleTrueObservation({
    profile: CLAIMED, env: ENV, rangeYds: 600,
    dialed: dialedMOA, hitInches: hitInches, units: 'MOA',
    shotMV: 2952, mvMeasured: false
});
check('typed bullet speed feeds the normalization', !!typedMv, true);
check('typed speed counts toward confidence input', typedMv.confidence.segments >= out.confidence.segments, true);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
