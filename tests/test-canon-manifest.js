/**
 * test-canon-manifest.js — Gate 0: freeze the canon.
 *
 * docs/canon/MANIFEST.md is the recorded truth about which documents
 * govern PROVEN and what they currently say (via content hash). This test
 * fails the instant a canon file's bytes diverge from the hash recorded
 * in the manifest, or a file appears in one place and not the other.
 *
 * It does NOT judge whether a canon change is good — only that nobody
 * edited a governing document without also updating the manifest that
 * records it.
 *
 * Run: node tests/test-canon-manifest.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var CANON_DIR = path.join(__dirname, '..', 'docs', 'canon');
var MANIFEST_PATH = path.join(CANON_DIR, 'MANIFEST.md');

var passed = 0;
var failed = 0;

function check(label, ok, detail) {
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Extract every markdown table row of the form:
//   | ... | `filename.md` | ... | `hexhash` |
// from MANIFEST.md. This is deliberately tolerant of extra columns so it
// works for both the "Governing" and "Historical" tables.
function extractManifestEntries(manifestText) {
    var entries = [];
    var lines = manifestText.split('\n');
    var hashRe = /^[0-9a-f]{64}$/;
    lines.forEach(function (line) {
        if (line.indexOf('|') === -1) return;
        var cells = line.split('|').map(function (c) { return c.trim(); });
        var fileCell = null, hashCell = null;
        cells.forEach(function (cell) {
            var backticked = cell.match(/^`([^`]+)`$/);
            if (!backticked) return;
            var inner = backticked[1];
            if (hashRe.test(inner)) hashCell = inner;
            else if (/\.md$/.test(inner)) fileCell = inner;
        });
        if (fileCell && hashCell) entries.push({ file: fileCell, hash: hashCell });
    });
    return entries;
}

console.log('\nCanon manifest integrity:');

check('MANIFEST.md exists', fs.existsSync(MANIFEST_PATH));
if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
}

var manifestText = fs.readFileSync(MANIFEST_PATH, 'utf8');
var entries = extractManifestEntries(manifestText);

check('manifest lists at least 5 governing canon docs', entries.length >= 5,
    'found ' + entries.length + ' file/hash rows');

// Every entry's recorded hash must match the file's actual current hash.
entries.forEach(function (entry) {
    var filePath = path.join(CANON_DIR, entry.file);
    if (!fs.existsSync(filePath)) {
        check(entry.file + ' exists on disk', false, 'listed in manifest but file is missing');
        return;
    }
    var actual = sha256(filePath);
    check(entry.file + ' hash matches manifest', actual === entry.hash,
        actual === entry.hash ? undefined : ('manifest says ' + entry.hash + ', file is ' + actual + ' — update MANIFEST.md'));
});

// Every .md file physically present in docs/canon/ must be listed in the
// manifest (governing OR historical) — a new canon file can't slip in
// unrecorded, and MANIFEST.md itself is excluded from having to list itself.
var onDisk = fs.readdirSync(CANON_DIR).filter(function (f) {
    return /\.md$/.test(f) && f !== 'MANIFEST.md';
});
var listedFiles = {};
entries.forEach(function (e) { listedFiles[e.file] = true; });

onDisk.forEach(function (f) {
    check(f + ' is recorded in MANIFEST.md', !!listedFiles[f],
        'file present in docs/canon/ but not listed in the manifest');
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
