/**
 * test-friendly-error.js — Unit tests for utils.js's friendlyError().
 *
 * AUDIT-FINDINGS.md F7/F5: every catch handler that showed raw
 * `err.message` ("Failed to fetch", a bare TypeError) leaked
 * browser/JS-runtime jargon into user-facing text. friendlyError()
 * is the single place that decides "was this a dropped connection"
 * (reusing SyncQueueCore.isNetworkError, already tested in
 * tests/test-sync-queue.js) vs. any other kind of failure.
 *
 * Run: node tests/test-friendly-error.js
 */

global.SyncQueueCore = require('../js/sync-queue.js').SyncQueueCore;
var friendlyError = require('../js/utils.js').friendlyError;

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    if (actual === expected) {
        passed++; console.log('  ✓ ' + label);
    } else {
        failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
}

console.log('\nfriendlyError():');

check('a bare TypeError (fetch failure shape) reads as "no signal", not the raw message',
    friendlyError(new TypeError('Failed to fetch')),
    'No signal right now — try again once you have a connection.');

check('a message matching the network-error regex reads as "no signal"',
    friendlyError(new Error('network request failed')),
    'No signal right now — try again once you have a connection.');

check('a genuine server rejection (not network-shaped) passes its own message through',
    friendlyError(new Error('permission denied')),
    'permission denied');

check('no error object at all falls back to a generic, still-plain message',
    friendlyError(null),
    'Something went wrong — try again.');

check('an error with no .message falls back to the generic message',
    friendlyError({}),
    'Something went wrong — try again.');

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
