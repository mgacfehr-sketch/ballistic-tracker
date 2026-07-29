/**
 * test-round-budget.js — Amendment 1 A14 pre-trip round budgeting.
 * Run: node tests/test-round-budget.js
 */

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

var RB = require('../js/round-budget.js');

// Doctrine's own worked example: 75-round interval, already at 65 (10
// left), a mission that costs ~18 -> clean first, negative margin case.
var doctrineExample = RB.deriveRoundBudget({ roundsSinceCleaning: 65, cleaningIntervalRounds: 75, missionRoundCost: 18 });
check('doctrine worked example -> clean-first', doctrineExample.word, 'clean-first');
check('doctrine worked example remaining is 10', doctrineExample.remaining, 10);
check('doctrine worked example margin is negative', doctrineExample.margin, -8);

check('already past interval -> clean-first with the right reason',
    RB.deriveRoundBudget({ roundsSinceCleaning: 90, cleaningIntervalRounds: 75, missionRoundCost: 15 }).verdict,
    'Clean it first — you\'re already past this barrel\'s usual cleaning interval.');

var tight = RB.deriveRoundBudget({ roundsSinceCleaning: 40, cleaningIntervalRounds: 75, missionRoundCost: 25 });
check('enough for the mission but too tight afterward -> clean-first', tight.word, 'clean-first');
check('tight-margin verdict matches the doctrine phrasing', tight.verdict,
    'Clean it first — you\'d finish with only 10 rounds left before cleaning, and you don\'t want to hunt on a dirty-margin barrel.');

var ok = RB.deriveRoundBudget({ roundsSinceCleaning: 10, cleaningIntervalRounds: 75, missionRoundCost: 18 });
check('plenty of margin -> ok', ok.word, 'ok');
check('ok margin computed correctly', ok.margin, 47);

check('exactly at the low-margin threshold still counts as ok (not clean-first)',
    RB.deriveRoundBudget({ roundsSinceCleaning: 45, cleaningIntervalRounds: 75, missionRoundCost: 15 }).word,
    'ok');

check('missing inputs default safely to zero, never throw',
    RB.deriveRoundBudget({}).word,
    'clean-first');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
