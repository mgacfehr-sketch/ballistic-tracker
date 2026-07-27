/**
 * test-jargon.js — no software/tech jargon in user-facing copy.
 *
 * AUDIT-FINDINGS.md F12/F14: a 60-year-old non-tech expert shooter
 * doesn't say "px/in" or "CSV/XLSX" out loud — these are software
 * units and file-format acronyms, not language a shooter would use.
 * Structural/source-text checks, same house style as
 * tests/test-screen-nav.js.
 *
 * Run: node tests/test-jargon.js
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

function readFile(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('\nNo tech jargon in user-facing copy:');

check('F12: no "px/in" in session-flow.js calibration messages', function () {
    var source = readFile('js/session-flow.js');
    if (source.indexOf('px/in') !== -1) {
        throw new Error('"px/in" (pixels per inch — a screen/graphics unit) found in session-flow.js — no shooter says this out loud');
    }
});

check('F14: no "CSV or XLSX" jargon in chrono import copy', function () {
    var source = readFile('js/chrono.js');
    if (source.indexOf('Garmin ShotView (CSV or XLSX)') !== -1) {
        throw new Error('the chrono import screen still spells out file-format acronyms in its user-facing description');
    }
});

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
