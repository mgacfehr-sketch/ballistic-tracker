/**
 * test-garmin-import.js — Unit tests for the Garmin ShotView parser.
 *
 * Run: node tests/test-garmin-import.js
 *
 * Fixtures (tests/fixtures/):
 *   TEST SHOTVIEW SHEET.xlsx  — real ShotView export (source of truth)
 *   shotview-sheets.json      — row arrays extracted from that XLSX, exact
 *                               cell strings preserved (incl. U+202F)
 *   shotview-single.csv       — single-session CSV built from the same data
 */

var fs = require('fs');
var path = require('path');
var G = require('../js/garmin-import.js');

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = typeof expected === 'number' && typeof actual === 'number'
        ? Math.abs(actual - expected) < 1e-9
        : actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}

function checkThrows(label, fn, msgFragment) {
    try {
        fn();
        failed++; console.log('  ✗ ' + label + ' — expected an Error, none thrown');
    } catch (e) {
        if (e.message.indexOf(msgFragment) !== -1) { passed++; console.log('  ✓ ' + label); }
        else { failed++; console.log('  ✗ ' + label + ' — error message missing "' + msgFragment + '": ' + e.message); }
    }
}

function mean(xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; }
function populationSD(xs) {
    var m = mean(xs);
    return Math.sqrt(xs.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / xs.length);
}

var FIXTURES = path.join(__dirname, 'fixtures');
var sheetsFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'shotview-sheets.json'), 'utf8'));
var csvText = fs.readFileSync(path.join(FIXTURES, 'shotview-single.csv'), 'utf8');

// ── Fixture integrity ─────────────────────────────────────────
console.log('\nFixture integrity:');
check('JSON fixture has 3 sheets', sheetsFixture.sheets.length, 3);
check('raw fixture Time contains U+202F', sheetsFixture.sheets[0].rows[2][5].indexOf(' ') !== -1, true);
check('raw CSV contains U+202F', csvText.indexOf(' ') !== -1, true);
check('raw fixture velocities are strings', typeof sheetsFixture.sheets[0].rows[2][1], 'string');

// ── XLSX (multi-session) parsing ─────────────────────────────
console.log('\nXLSX multi-session parsing:');
var sessions = G.parseShotViewSheets(sheetsFixture.sheets);
check('3 sessions parsed', sessions.length, 3);
check('session 1 shot count', sessions[0].shots.length, 8);
check('session 2 shot count', sessions[1].shots.length, 11);
check('session 3 shot count', sessions[2].shots.length, 7);

check('session 1 first velocity (parseFloat of text)', sessions[0].shots[0].fps, 2691.5);
check('session 1 last velocity', sessions[0].shots[7].fps, 2732.4);
check('session 2 shot 9 velocity', sessions[1].shots[8].fps, 3019.8);
check('all velocities are finite numbers', sessions.every(function (s) {
    return s.shots.every(function (x) { return typeof x.fps === 'number' && isFinite(x.fps); });
}), true);

check('U+202F stripped from Time', sessions[0].shots[0].time, '3:09:32 PM');
check('no shot Time retains U+202F', sessions.every(function (s) {
    return s.shots.every(function (x) { return !x.time || x.time.indexOf(' ') === -1; });
}), true);

check('junk AVERAGE SPEED row not imported as a shot', sessions[0].shots.every(function (x) { return x.fps !== 2743.4; }), true);
check('shot numbers sequential from 1', sessions[1].shots.map(function (x) { return x.shot; }).join(','), '1,2,3,4,5,6,7,8,9,10,11');

// Dates: prefer the DATE summary row, sheet name as fallback
check('session 1 date from DATE row', sessions[0].date, '2026-06-26T15:07');
check('session 2 date', sessions[1].date, '2026-06-26T14:48');
check('session 3 date', sessions[2].date, '2026-06-26T14:39');
check('sheet-name date parser (fallback path)', G.parseSheetNameDate('Rifle sessio_2026-06-26_15-07_1'), '2026-06-26T15:07');

// Garmin's own summary stats captured for cross-checking
console.log('\nReported stats extraction + recompute cross-check:');
check('session 1 reported avg', sessions[0].reported.avg, 2743.4);
check('session 1 reported SD', sessions[0].reported.sd, 30.7);
check('session 1 reported spread (ES)', sessions[0].reported.es, 108.8);
check('session 2 reported avg', sessions[1].reported.avg, 2977.0);
check('session 3 reported avg', sessions[2].reported.avg, 2959.3);

// Tolerance note: exported per-shot velocities are rounded to 0.1 fps, but
// Garmin computes its summary from unrounded internal values — recomputed
// stats can therefore differ from the reported ones by up to ~0.1 fps
// (observed: session 3 ES recomputes to 69.9 vs Garmin's 69.8).
sessions.forEach(function (s, i) {
    var fps = s.shots.map(function (x) { return x.fps; });
    var avg = mean(fps);
    var sd = populationSD(fps);
    var es = Math.max.apply(null, fps) - Math.min.apply(null, fps);
    check('session ' + (i + 1) + ' recomputed avg matches Garmin (±0.11)', Math.abs(avg - s.reported.avg) < 0.11, true);
    check('session ' + (i + 1) + ' recomputed population SD matches Garmin (±0.11)', Math.abs(sd - s.reported.sd) < 0.11, true);
    check('session ' + (i + 1) + ' recomputed ES matches Garmin (±0.11)', Math.abs(es - s.reported.es) < 0.11, true);
});

// ── CSV (single-session) parsing ─────────────────────────────
console.log('\nCSV single-session parsing:');
var csvSession = G.parseShotViewCSV(csvText, 'shotview-single.csv');
check('CSV shot count', csvSession.shots.length, 11);
check('CSV first velocity', csvSession.shots[0].fps, 2994.2);
check('CSV last velocity', csvSession.shots[10].fps, 3009.4);
check('CSV Time cleaned of U+202F', csvSession.shots[0].time, '2:51:29 PM');
check('CSV date from quoted DATE row (comma inside quotes)', csvSession.date, '2026-06-26T14:48');
check('CSV reported avg', csvSession.reported.avg, 2977.0);
check('CSV source tag', csvSession.source, 'garmin_csv');

// ── Header located by content, not position ──────────────────
console.log('\nHeader detection:');
var shifted = [[], [], ['junk'], sheetsFixture.sheets[0].rows[1]].concat(sheetsFixture.sheets[0].rows.slice(2));
var shiftedSession = G.parseSheetRows(shifted, { name: 'shifted' });
check('header found on row 4 instead of row 2', shiftedSession.shots.length, 8);

// ── Loud rejection, never guessing ────────────────────────────
console.log('\nRejection of non-ShotView input:');
checkThrows('random CSV text rejected', function () {
    G.parseShotViewCSV('name,age\nbob,42\nsue,39\n');
}, 'does not look like a Garmin ShotView export');
checkThrows('empty text rejected', function () {
    G.parseShotViewCSV('   ');
}, 'empty');
checkThrows('header but zero shot rows rejected', function () {
    G.parseSheetRows([['#', 'Speed (FPS)', 'Time'], ['AVERAGE SPEED', '2743.4']], {});
}, 'no shot rows');
checkThrows('empty workbook rejected', function () {
    G.parseShotViewSheets([]);
}, 'no sheets');
checkThrows('workbook of junk sheets rejected', function () {
    G.parseShotViewSheets([{ name: 'x', rows: [['a', 'b'], ['1', '2']] }]);
}, 'No sheet in this workbook');

// Bad speed cell on a valid shot row → warning + skip, not a crash or a guess
console.log('\nPer-cell defensiveness:');
var withBadSpeed = G.parseSheetRows([
    ['#', 'Speed (FPS)', 'Time'],
    ['1', '2800.1', '3:09:32 PM'],
    ['2', 'ERROR', '3:10:00 PM']
], {});
check('bad speed row skipped', withBadSpeed.shots.length, 1);
check('bad speed row produces a warning', withBadSpeed.warnings.length, 1);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
