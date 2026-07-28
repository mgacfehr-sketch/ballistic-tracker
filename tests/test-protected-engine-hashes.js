/**
 * test-protected-engine-hashes.js — Gate 0: freeze the protected engines.
 *
 * CLAUDE.md and the PROVEN canon (Constitution C21, §116.7; Product
 * Definition §8) require that the existing tested engines remain the
 * sole mathematical authority. This test locks their bytes: it recomputes
 * a SHA-256 of each protected engine file and fails if it no longer
 * matches tests/fixtures/protected-engine-hashes.json.
 *
 * This is a BLUNT instrument on purpose — it does not know what changed,
 * only that something did. It exists so that any future refactor of the
 * spine (Phase B onward) cannot silently touch engine math while adding
 * "decoration" around it. Legitimate engine changes update the fixture
 * in the same commit, with the reason recorded in the commit message.
 *
 * Run: node tests/test-protected-engine-hashes.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var FIXTURE_PATH = path.join(__dirname, 'fixtures', 'protected-engine-hashes.json');

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

console.log('\nProtected engine hash lock:');

check('fixture file exists', fs.existsSync(FIXTURE_PATH));
if (!fs.existsSync(FIXTURE_PATH)) {
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
}

var locked = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
var lockedFiles = Object.keys(locked);

check('fixture locks all 8 protected engines', lockedFiles.length === 8,
    'found ' + lockedFiles.length);

lockedFiles.forEach(function (relPath) {
    var fullPath = path.join(ROOT, relPath);
    var expected = locked[relPath];
    if (!fs.existsSync(fullPath)) {
        check(relPath + ' exists', false, 'listed in fixture but file is missing');
        return;
    }
    var buf = fs.readFileSync(fullPath);
    var actualHash = crypto.createHash('sha256').update(buf).digest('hex');
    var actualBytes = buf.length;

    check(relPath + ' is byte-identical to locked hash', actualHash === expected.sha256,
        actualHash === expected.sha256 ? undefined :
            ('locked ' + expected.sha256 + ' (' + expected.bytes + ' bytes), now ' +
             actualHash + ' (' + actualBytes + ' bytes) — engine changed. If intentional, ' +
             'update tests/fixtures/protected-engine-hashes.json and explain why in the commit.'));
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
