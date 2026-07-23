/**
 * test-labradar-import.js — LabRadar CSV parser (§2.2).
 * Run: node tests/test-labradar-import.js
 */

var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;

function check(label, actual, expected) {
    var ok = actual === expected;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function checkThrows(label, fn, msgFragment) {
    try {
        fn();
        failed++;
        console.log('  ✗ ' + label + ' — expected a throw, got none');
    } catch (e) {
        var ok = !msgFragment || String(e.message).toLowerCase().indexOf(msgFragment.toLowerCase()) !== -1;
        if (ok) { passed++; console.log('  ✓ ' + label); }
        else { failed++; console.log('  ✗ ' + label + ' — wrong message: ' + e.message); }
    }
}
function approx(label, actual, expected, tol) {
    var ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
    if (ok) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label + ' — expected ~' + expected + ', got ' + actual); }
}

var L = require('../js/labradar-import.js');
var fpsText = fs.readFileSync(path.join(__dirname, 'fixtures', 'labradar-report.csv'), 'utf8');
var mpsText = fs.readFileSync(path.join(__dirname, 'fixtures', 'labradar-report-mps.csv'), 'utf8');

console.log('\nfps report:');
var s = L.parseLabRadarCSV(fpsText, 'SR0042 Report.csv');
check('source tagged', s.source, 'labradar_csv');
check('series name from metadata', s.name, 'Series 0042');
check('all five shots parsed', s.shots.length, 5);
check('shot numbers sequential', s.shots.map(function (x) { return x.shot; }).join(','), '1,2,3,4,5');
check('V0 is the muzzle velocity (shot 1)', s.shots[0].fps, 2823.11);
check('time carried through', s.shots[0].time, '09:41:12');
check('dd.mm.yyyy date parsed to ISO', s.date, '2026-07-18');
check('reported average captured', s.reported.avg, 2814.86);
check('reported SD captured', s.reported.sd, 5.69);
check('reported ES captured', s.reported.es, 16.91);
check('no warnings on a clean file', s.warnings.length, 0);

// reported-vs-recomputed cross-check (population SD, house convention)
var sum = 0;
s.shots.forEach(function (x) { sum += x.fps; });
var avg = sum / s.shots.length;
approx('recomputed average matches LabRadar', avg, s.reported.avg, 0.05);
var ss = 0;
s.shots.forEach(function (x) { ss += (x.fps - avg) * (x.fps - avg); });
approx('recomputed population SD matches LabRadar', Math.sqrt(ss / s.shots.length), s.reported.sd, 0.05);
approx('recomputed ES matches LabRadar', 2823.11 - 2806.20, s.reported.es, 0.01);

console.log('\nm/s report (decimal commas, conversion):');
var m = L.parseLabRadarCSV(mpsText);
check('three shots parsed', m.shots.length, 3);
approx('859.90 m/s → 2821.2 fps', m.shots[0].fps, 859.90 * 3.280839895, 0.05);
approx('reported average converted too', m.reported.avg, 858.05 * 3.280839895, 0.05);
check('conversion warned, not silent', m.warnings.some(function (w) { return w.indexOf('m/s') !== -1; }), true);
check('decimal-comma cells parsed', typeof m.shots[2].fps, 'number');

console.log('\nstructure found by content, not position:');
var shuffled = fpsText.replace('Shot ID;V0;V10;V20;Ke0;Proj. Weight;Date;Time',
    'Ke0;Shot ID;Proj. Weight;V0;V10;V20;Date;Time')
    .replace(/^(\d{4});([\d.]+);([\d.]+);([\d.]+);([\d.]+);([\d.]+);/gm,
        '$5;$1;$6;$2;$3;$4;');
var sh = L.parseLabRadarCSV(shuffled);
check('reordered columns still parse', sh.shots.length, 5);
check('V0 still the velocity', sh.shots[0].fps, 2823.11);

console.log('\nloud rejection (never guess):');
checkThrows('empty file throws', function () { L.parseLabRadarCSV(''); }, 'empty');
checkThrows('random CSV throws', function () {
    L.parseLabRadarCSV('a,b,c\n1,2,3\n4,5,6');
}, 'not a labradar');
checkThrows('prose throws', function () {
    L.parseLabRadarCSV('Dear diary, today I shot my rifle.');
}, 'not a labradar');

console.log('\nper-row defensiveness:');
var damaged = fpsText.replace('0003;2806.20', '0003;garbage');
var d = L.parseLabRadarCSV(damaged);
check('damaged row skipped, not fatal', d.shots.length, 4);
check('damage produces a warning', d.warnings.some(function (w) { return w.indexOf('Shot 3') !== -1; }), true);

console.log('\nhelpers:');
check('semicolon detected', L.labradarDelimiter(fpsText), ';');
check('comma fallback', L.labradarDelimiter('a,b,c\n1,2,3'), ',');
check('decimal comma number', L.labradarNumber('858,05'), 858.05);
check('sniffer accepts LabRadar', L.looksLikeLabRadar(fpsText), true);
check('sniffer rejects prose', L.looksLikeLabRadar('hello world'), false);

console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
