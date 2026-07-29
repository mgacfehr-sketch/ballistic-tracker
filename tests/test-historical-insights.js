/**
 * test-historical-insights.js — Amendment 1 A13 whitelist.
 * Run: node tests/test-historical-insights.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var HI = require('../js/historical-insights.js');

check('empty context -> no insight (silence, never fabricated)', HI.deriveHistoricalInsight({}), null);

check('config-change note wins over everything else (priority 1)',
    HI.deriveHistoricalInsight({
        configChangeNote: 'Different muzzle configuration than this event.',
        roundsSinceTruing: 200, mvDeltaSinceTruing: 40
    }).id, 'config-change');

var truing = HI.deriveHistoricalInsight({ roundsSinceTruing: 187, mvDeltaSinceTruing: 18 });
check('truing MV drift fires with the canonical B2 phrasing shape', truing.text, 'You last trued this rifle 187 rounds ago — MV has risen 18 fps since.');
check('truing MV drift level is DERIVED', truing.level, 'DERIVED');

check('MV drift under the noise floor (< 10 fps) does not fire',
    HI.deriveHistoricalInsight({ roundsSinceTruing: 50, mvDeltaSinceTruing: 4 }), null);

check('falling MV uses "fallen"',
    HI.deriveHistoricalInsight({ roundsSinceTruing: 100, mvDeltaSinceTruing: -22 }).text.indexOf('fallen 22') !== -1,
    true);

var confirmations = HI.deriveHistoricalInsight({
    spotCheckHistory: [
        { distanceYd: 700, outcome: 'confirmed', date: '2026-07-01T00:00:00Z' },
        { distanceYd: 700, outcome: 'confirmed', date: '2026-06-01T00:00:00Z' },
        { distanceYd: 700, outcome: 'confirmed', date: '2026-05-01T00:00:00Z' },
        { distanceYd: 700, outcome: 'confirmed', date: '2026-04-01T00:00:00Z' },
        { distanceYd: 700, outcome: 'drift', date: '2026-03-01T00:00:00Z' }
    ]
});
check('4 consecutive confirmations at the same distance fires', confirmations.text, 'That\'s 4 consecutive confirmations at 700 across 3 months.');

check('a single confirmation (not "repeated") does not fire',
    HI.deriveHistoricalInsight({ spotCheckHistory: [{ distanceYd: 700, outcome: 'confirmed', date: '2026-07-01T00:00:00Z' }] }),
    null);

check('a break in confirmations (drift most recent) does not count the streak behind it',
    HI.deriveHistoricalInsight({
        spotCheckHistory: [
            { distanceYd: 700, outcome: 'drift', date: '2026-07-01T00:00:00Z' },
            { distanceYd: 700, outcome: 'confirmed', date: '2026-06-01T00:00:00Z' },
            { distanceYd: 700, outcome: 'confirmed', date: '2026-05-01T00:00:00Z' }
        ]
    }), null);

var lots = HI.deriveHistoricalInsight({
    priorLotStats: { lot: 'A', avgFps: 2846, shotCount: 63 },
    currentLotStats: { lot: 'B', avgFps: 2810, shotCount: 10 }
});
check('lot comparison phrasing matches the canonical shape', lots.text, 'This lot averages 36 fps slower than your previous lot.');

check('lot comparison needs >=3 shots on BOTH lots (small-sample honesty)',
    HI.deriveHistoricalInsight({
        priorLotStats: { lot: 'A', avgFps: 2846, shotCount: 63 },
        currentLotStats: { lot: 'B', avgFps: 2810, shotCount: 2 }
    }), null);

var cleaning = HI.deriveHistoricalInsight({ cleaningSettlingCounts: [12, 10, 11, 9] });
check('cleaning history uses only the most recent three', cleaning.text, 'Last three cleaning cycles: 12, 10, 11 fouling shots before groups settled.');

check('cleaning history needs at least 3 cycles', HI.deriveHistoricalInsight({ cleaningSettlingCounts: [12, 10] }), null);

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
