/**
 * test-steel-core.js — pure Steel Session logic (§2.2).
 * Run: node tests/test-steel-core.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var S = require('../js/steel-core.js');

console.log('\nStepper increments (locked by contract):');
check('MOA = 0.25 per tap', S.STEEL_INCREMENTS.MOA, 0.25);
check('Inches = 0.5 per tap', S.STEEL_INCREMENTS.IN, 0.5);
check('MIL = 0.1 per tap', S.STEEL_INCREMENTS.MIL, 0.1);
check('step up from 0 (MOA)', S.steelStep(0, 1, 'MOA'), 0.25);
check('step down through zero goes negative', S.steelStep(0.25, -1, 'MOA'), 0);
check('step below zero (LOW/LEFT territory)', S.steelStep(0, -1, 'MOA'), -0.25);
check('MIL steps avoid float artifacts (0.1+0.1+0.1)', S.steelStep(S.steelStep(S.steelStep(0, 1, 'MIL'), 1, 'MIL'), 1, 'MIL'), 0.3);
check('inches step 0.5', S.steelStep(1.0, 1, 'IN'), 1.5);
check('off-grid value snaps to the lattice', S.steelStep(0.3, 1, 'MOA'), 0.5);

console.log('\nCenter detection + shot description:');
check('0/0 is center', S.steelIsCenter(0, 0, 'MOA'), true);
check('within half an increment is ~center', S.steelIsCenter(0.1, -0.1, 'MOA'), true);
check('a full increment off is not center', S.steelIsCenter(0.25, 0, 'MOA'), false);
check('MIL center window is tighter', S.steelIsCenter(0.1, 0, 'MIL'), false);
check('center reads "center"', S.steelDescribeShot(0, 0, 'MOA'), 'center');
check('high-right description', S.steelDescribeShot(0.5, 0.25, 'MOA'), '0.5 high · 0.25 R');
check('low-left description', S.steelDescribeShot(-0.75, -0.5, 'MOA'), '0.75 low · 0.5 L');
check('elevation only', S.steelDescribeShot(0.5, 0, 'MOA'), '0.5 high');

console.log('\nWind + direction of fire:');
check('wind stated in text', S.steelWindText(2, 8), "8 mph from 2 o'clock");
check('no wind honest', S.steelWindText(12, 0), 'no wind');
check('heading 0 → N', S.steelDofFromHeading(0), 'N');
check('heading 44 → NE (nearest chip)', S.steelDofFromHeading(44), 'NE');
check('heading 350 → N (wraps)', S.steelDofFromHeading(350), 'N');
check('heading 200 rounds to S (20° vs 25° to SW)', S.steelDofFromHeading(200), 'S');
check('heading 210 rounds to SW', S.steelDofFromHeading(210), 'SW');
check('bad heading → null', S.steelDofFromHeading(NaN), null);
check('chip → degrees (E = 90)', S.steelDofToDegrees('E'), 90);
check('unknown chip → null', S.steelDofToDegrees('X'), null);

console.log('\nChrono reconciliation (§2.2 — in order, confirm-gated):');
function shot(seq, mv) { return { seq: seq, mvFps: mv === undefined ? null : mv }; }

var logged = [shot(1, null), shot(2, 2815), shot(3, null), shot(4, 2790)];
var chrono = [2823.1, 2816.2, 2806.2, 2812.6];
var p = S.steelPairVelocities(logged, chrono);
check('one row per shot', p.rows.length, 4);
check('skipped shot 1 filled from chrono', p.rows[0].action, 'fill');
check('fill uses the chrono value', p.rows[0].use, 2823.1);
check('typed value agreeing within 5 fps = match', p.rows[1].action, 'match');
check('match standardizes on the chrono value', p.rows[1].use, 2816.2);
check('typed 2790 vs chrono 2812.6 = conflict (flagged)', p.rows[3].action, 'conflict');
check('conflict prefers the instrument', p.rows[3].use, 2812.6);
check('filled count', p.filled, 2);
check('conflict count', p.conflicts, 1);
check('no count mismatch', p.countMismatch, 0);

var extra = S.steelPairVelocities([shot(1, null), shot(2, null)], [2800, 2805, 2810]);
check('chrono longer → +1 mismatch', extra.countMismatch, 1);
check('extra chrono shot rendered as its own row', extra.rows[2].action, 'extra');

var short = S.steelPairVelocities(logged, [2800, 2805]);
check('chrono shorter → -2 mismatch', short.countMismatch, -2);
check('uncovered logged shots keep their value', short.rows[3].action, 'keep');
check('keep preserves the typed velocity', short.rows[3].use, 2790);

var applied = S.steelApplyPairing(logged, p, 'labradar');
check('apply fills the skipped shots', applied[0].mvFps, 2823.1);
check('apply stamps the source', applied[0].mvSource, 'labradar');
check('apply resolves conflicts to chrono', applied[3].mvFps, 2812.6);
check('apply is immutable (original untouched)', logged[0].mvFps, null);
check('keep rows untouched by apply when no chrono', S.steelApplyPairing(logged, short, 'x')[2].mvFps, null);

console.log('\nString summary (group centers, never single shots):');
var shots = [
    { seq: 1, elevOff: 0.5, windOff: 0.25, mvFps: 2810 },
    { seq: 2, elevOff: 0.75, windOff: 0.5, mvFps: 2820 },
    { seq: 3, elevOff: 0.25, windOff: 0, mvFps: null },
    { seq: 4, elevOff: 0, windOff: 0.05, mvFps: 2815 }
];
var sum = S.steelStringSummary(shots, 'MOA');
check('n', sum.n, 4);
check('mean elevation offset', sum.meanElevOff, 0.375);
check('mean windage offset', sum.meanWindOff, 0.2);
check('center hits counted', sum.centerHits, 1);
check('mv coverage counted', sum.mvCount, 3);
check('avg mv', sum.avgMv, 2815);
check('population SD', sum.sdMv, 4.1);
check('empty string safe', S.steelStringSummary([], 'MOA').n, 0);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
