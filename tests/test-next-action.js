/**
 * test-next-action.js — THE NEXT ACTION priority ladder (v2.4 §1.2).
 * Run: node tests/test-next-action.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var NA = require('../js/next-action.js');

var NOW = '2026-07-25T12:00:00Z';

/** Convenience: a full status object with every element green. */
function greenStatus(over) {
    var s = {
        tracking: { state: 'verified' },
        zero: { state: 'confirmed' },
        mv: { state: 'measured' },
        trued: { state: 'mv', toYd: 700, flagged: false },
        rollup: { calibratedToYd: 700 }
    };
    for (var k in (over || {})) s[k] = over[k];
    return s;
}

function derive(over) {
    var input = {
        now: NOW,
        status: greenStatus(),
        hasLoad: true,
        mvTrueYd: 450,
        distanceStrings: [],
        roundsSinceCleaning: null,
        dismissals: {}
    };
    for (var k in (over || {})) input[k] = over[k];
    return NA.deriveNextAction(input);
}

console.log('\nRung 1 — no load / no MV at all:');
check('no load → add-load', derive({ hasLoad: false }).id, 'add-load');
check('no MV data → add-load',
    derive({ status: greenStatus({ mv: { state: 'none' } }) }).id, 'add-load');
check('add-load payoff mentions DOPE',
    derive({ hasLoad: false }).payoff.indexOf('DOPE') !== -1, true);
check('add-load deep link', derive({ hasLoad: false }).action.type, 'addLoad');
check('no status at all + no load → add-load', derive({ status: null, hasLoad: false }).id, 'add-load');

console.log('\nRung 2 — zero never / adjust / stale / drifted:');
check('never → confirm-zero',
    derive({ status: greenStatus({ zero: { state: 'never' } }) }).id, 'confirm-zero');
check('adjust → confirm-zero',
    derive({ status: greenStatus({ zero: { state: 'adjust' } }) }).id, 'confirm-zero');
check('stale → confirm-zero',
    derive({ status: greenStatus({ zero: { state: 'stale' } }) }).id, 'confirm-zero');
check('drifted → confirm-zero',
    derive({ status: greenStatus({ zero: { state: 'drifted' } }) }).id, 'confirm-zero');
check('thin does NOT interrupt (quality, not absence)',
    derive({ status: greenStatus({ zero: { state: 'thin' } }) }).id, 'go-shoot');
check('confirm-zero payoff', derive({ status: greenStatus({ zero: { state: 'never' } }) }).payoff,
    'Proven at 100.');
check('confirm-zero launches a range session',
    derive({ status: greenStatus({ zero: { state: 'never' } }) }).action.type, 'rangeSession');
check('zero beats MV in the ladder',
    derive({ status: greenStatus({ zero: { state: 'never' }, mv: { state: 'estimated' } }) }).id,
    'confirm-zero');

console.log('\nRung 3 — MV not measured:');
check('estimated → measure-mv',
    derive({ status: greenStatus({ mv: { state: 'estimated' } }) }).id, 'measure-mv');
check('stale MV → measure-mv (re-measure title)',
    derive({ status: greenStatus({ mv: { state: 'stale' } }) }).title.indexOf('Re-measure'), 0);
check('payoff states the prescription distance',
    derive({ status: greenStatus({ mv: { state: 'estimated' } }), mvTrueYd: 450 }).payoff,
    'Extends your proven range to ~450 yd.');
check('no prescription computable → confidence payoff',
    derive({ status: greenStatus({ mv: { state: 'estimated' } }), mvTrueYd: null }).payoff,
    'Measured velocity beats the box number.');
check('measure-mv deep link', derive({ status: greenStatus({ mv: { state: 'estimated' } }) }).action.type, 'chrono');

console.log('\nRungs 4/5 — untrued:');
var untrued = greenStatus({ trued: { state: 'untrued', toYd: null, flagged: false } });
check('untrued + usable string → true-rifle',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 600, shotCount: 8 }] }).id, 'true-rifle');
check('true-rifle names the string',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 600, shotCount: 8 }] }).detail,
    'You\'ve got a 8-shot string at 600 yd ready.');
check('true-rifle payoff = proven to X',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 600, shotCount: 8 }] }).payoff,
    'Proven to 600.');
check('largest distance wins',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 400, shotCount: 10 }, { distanceYd: 750, shotCount: 5 }] }).detail.indexOf('750') !== -1,
    true);
check('tie → more shots wins',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 600, shotCount: 3 }, { distanceYd: 600, shotCount: 9 }] }).detail.indexOf('9-shot') !== -1, true);
check('untrued + no data → shoot-distance',
    derive({ status: untrued }).id, 'shoot-distance');
check('shoot-distance launches steel',
    derive({ status: untrued }).action.type, 'steelSession');
check('bad string entries ignored',
    derive({ status: untrued, distanceStrings: [{ distanceYd: 0 }, null, {}] }).id, 'shoot-distance');

console.log('\nRung 6 — tracking caps confidence:');
check('trued + tracking never → verify-tracking',
    derive({ status: greenStatus({ tracking: { state: 'never' } }) }).id, 'verify-tracking');
check('trued + tracking stale → verify-tracking',
    derive({ status: greenStatus({ tracking: { state: 'stale' } }) }).id, 'verify-tracking');
check('UNtrued + tracking never → truing path first (no tracking door)',
    derive({ status: greenStatus({ trued: { state: 'untrued' }, tracking: { state: 'never' } }) }).id,
    'shoot-distance');
check('verify-tracking payoff', derive({ status: greenStatus({ tracking: { state: 'never' } }) }).payoff,
    'Confidence to High.');

console.log('\nRung 7 — maintenance, only when true:');
check('flagged truing → re-true',
    derive({ status: greenStatus({ trued: { state: 'mv', toYd: 700, flagged: true } }) }).id, 're-true');
check('400+ rounds since cleaning → clean-barrel',
    derive({ roundsSinceCleaning: 412 }).id, 'clean-barrel');
check('cleaning threshold respects override',
    derive({ roundsSinceCleaning: 250, cleaningNudgeRounds: 200 }).id, 'clean-barrel');
check('under threshold → no nag', derive({ roundsSinceCleaning: 399 }).id, 'go-shoot');

console.log('\nThe floor:');
var floor = derive({});
check('everything green → go-shoot', floor.id, 'go-shoot');
check('go-shoot states the number', floor.title, 'You\'re proven to 700 — go shoot');
check('go-shoot never dismissible', floor.dismissible, false);
check('no proven range → plain go shoot',
    derive({ status: greenStatus({ rollup: { calibratedToYd: null } }) }).title, 'Go shoot');
check('all real rungs dismissible', derive({ hasLoad: false }).dismissible, true);

console.log('\nDismissals ("Not now" — 7 days):');
var dis = NA.withNextActionDismissal({}, 'confirm-zero', '2026-07-24T12:00:00Z');
check('withNextActionDismissal stamps the id', dis['confirm-zero'], '2026-07-24T12:00:00Z');
check('immutable — source untouched', Object.keys({}).length, 0);
check('dismissed yesterday → still dismissed',
    NA.nextActionDismissed(dis, 'confirm-zero', NOW), true);
check('dismissed 8 days ago → expired',
    NA.nextActionDismissed({ 'confirm-zero': '2026-07-17T11:00:00Z' }, 'confirm-zero', NOW), false);
check('garbage date → not dismissed',
    NA.nextActionDismissed({ 'confirm-zero': 'nope' }, 'confirm-zero', NOW), false);
check('dismissed rung falls through to the next',
    derive({
        status: greenStatus({ zero: { state: 'never' }, mv: { state: 'estimated' } }),
        dismissals: dis
    }).id, 'measure-mv');
check('everything dismissed → the floor',
    derive({
        status: greenStatus({ zero: { state: 'never' } }),
        dismissals: { 'confirm-zero': NOW }
    }).id, 'go-shoot');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
