/**
 * test-friendly-error-usage.js — no raw err.message in user-facing text.
 *
 * AUDIT-FINDINGS.md F5/F7: every catch handler that showed `err.message`
 * (or `error.message`) directly leaked raw browser/JS-runtime jargon
 * ("Failed to fetch", a bare TypeError) into user-facing alerts/banners.
 * All known sites were routed through utils.js's friendlyError() in the
 * fix for F5/F7 — this is a structural regression guard (same house
 * style as tests/test-screen-nav.js) so a new catch handler can't
 * quietly reintroduce the raw pattern in one of these files.
 *
 * Run: node tests/test-friendly-error-usage.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function check(label, fn) {
    try {
        fn();
        passed++; console.log('  ✓ ' + label);
    } catch (e) {
        failed++; console.log('  ✗ ' + label + ' — ' + e.message);
    }
}

var FILES = [
    'js/new-ammo.js',
    'js/rifle-record.js',
    'js/chrono.js',
    'js/certificate.js',
    'js/admin.js',
    'js/app.js'
];

console.log('\nNo raw err.message/error.message in user-facing catch handlers:');

FILES.forEach(function (rel) {
    check(rel + ' has no bare err.message/error.message', function () {
        var source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        // Once every site routes through friendlyError(err), the literal
        // substring "err.message"/"error.message" shouldn't appear in
        // these files at all (friendlyError itself owns that access).
        if (/\berr(?:or)?\.message\b/.test(source)) {
            throw new Error('found a raw err.message/error.message — route it through friendlyError()');
        }
    });
});

check('utils.js still exports friendlyError', function () {
    var fe = require('../js/utils.js').friendlyError;
    if (typeof fe !== 'function') throw new Error('friendlyError is not exported from utils.js');
});

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
